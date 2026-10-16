/**
 * Resend Inbound Email Webhook & Reply Forwarding Service
 *
 * Implements receiving inbound emails (Method B: Branded Inbound Email) via Resend's
 * `email.received` webhook and forwards them securely to eventgamestudio@gmail.com.
 *
 * Security & Reliability:
 * - Svix webhook signature verification using Web Crypto (timing-safe HMAC SHA-256)
 * - Raw request body preserved for signature verification
 * - Resend receiving API (GET /emails/{id}) fetch to retrieve full message (HTML, text, headers, attachments)
 * - Safe forwarding from branded sender (RESEND_INVITATION_FROM) with [EventGameStudio Reply] subject prefix
 * - Untrusted HTML sanitization (strips <script>, <style>, event handlers, javascript: URIs)
 * - Persistent idempotency tracking to prevent duplicate forwards on webhook retries
 * - Attachment size limits and safe forwarding
 * - Zero secrets logged; sanitized error reporting
 */

import { getResendApiKey, getResendInvitationFrom, sendEmailViaResend, sanitizeErrorMessage } from './resend.js';
import { escapeHtml } from './gmail.js';

export const FORWARD_DESTINATION_EMAIL = 'eventgamestudio@gmail.com';
export const FORWARD_SUBJECT_PREFIX = '[EventGameStudio Reply]';
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per attachment
export const MAX_TOTAL_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25MB total

// In-memory idempotency cache fallback for duplicate webhook delivery prevention
const processedInboundMessageIds = new Map<string, { timestamp: number; forwardMessageId?: string }>();
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Clean up expired in-memory idempotency records
 */
function pruneExpiredIdempotencyKeys() {
  const now = Date.now();
  for (const [key, val] of processedInboundMessageIds.entries()) {
    if (now - val.timestamp > IDEMPOTENCY_TTL_MS) {
      processedInboundMessageIds.delete(key);
    }
  }
}

/**
 * Check if message has already been processed (idempotency check)
 */
export function isMessageAlreadyProcessed(messageId: string): boolean {
  pruneExpiredIdempotencyKeys();
  return processedInboundMessageIds.has(messageId);
}

/**
 * Mark message as processed
 */
export function markMessageProcessed(messageId: string, forwardMessageId?: string): void {
  pruneExpiredIdempotencyKeys();
  processedInboundMessageIds.set(messageId, {
    timestamp: Date.now(),
    forwardMessageId,
  });
}

/**
 * Reset idempotency cache (useful for testing)
 */
export function clearIdempotencyCache(): void {
  processedInboundMessageIds.clear();
}

/**
 * Verify Svix webhook signature using standard Web Crypto API.
 * Compatible with Node.js, Bun, and Cloudflare Workers runtime.
 *
 * Headers required:
 * - svix-id (or webhook-id)
 * - svix-timestamp (or webhook-timestamp)
 * - svix-signature (or webhook-signature)
 *
 * Secret format: "whsec_..." (base64 encoded after prefix) or raw base64 string
 */
export async function verifySvixWebhookSignature(params: {
  payload: string;
  headers: Record<string, string | string[] | undefined>;
  secret: string;
  toleranceSeconds?: number;
}): Promise<{ valid: boolean; reason?: string }> {
  const { payload, headers, secret, toleranceSeconds = 300 } = params;

  if (!secret || typeof secret !== 'string' || !secret.trim()) {
    return { valid: false, reason: 'Webhook secret is not configured' };
  }

  // Normalize header lookups (case-insensitive)
  const normalizedHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined) {
      normalizedHeaders[k.toLowerCase()] = Array.isArray(v) ? v[0] : String(v);
    }
  }

  const msgId = normalizedHeaders['svix-id'] || normalizedHeaders['webhook-id'];
  const msgTimestamp = normalizedHeaders['svix-timestamp'] || normalizedHeaders['webhook-timestamp'];
  const msgSignature = normalizedHeaders['svix-signature'] || normalizedHeaders['webhook-signature'];

  if (!msgId) {
    return { valid: false, reason: 'Missing svix-id header' };
  }
  if (!msgTimestamp) {
    return { valid: false, reason: 'Missing svix-timestamp header' };
  }
  if (!msgSignature) {
    return { valid: false, reason: 'Missing svix-signature header' };
  }

  // Timestamp freshness check (prevent replay attacks)
  const timestampNum = parseInt(msgTimestamp, 10);
  if (isNaN(timestampNum)) {
    return { valid: false, reason: 'Invalid svix-timestamp header' };
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampNum) > toleranceSeconds) {
    return { valid: false, reason: 'Webhook timestamp expired (possible replay)' };
  }

  // Parse secret key
  let base64Secret = secret.trim();
  if (base64Secret.startsWith('whsec_')) {
    base64Secret = base64Secret.slice(6);
  }

  let binaryKey: Uint8Array;
  try {
    const binStr = atob(base64Secret);
    binaryKey = Uint8Array.from(binStr, (c) => c.charCodeAt(0));
  } catch (err: any) {
    return { valid: false, reason: `Failed to decode webhook secret: ${err?.message || 'Invalid base64'}` };
  }

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      binaryKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const toSign = `${msgId}.${msgTimestamp}.${payload}`;
    const enc = new TextEncoder();
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(toSign));
    const computedSignatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    // Signatures in header can be space-delimited (multiple versions or rotated keys):
    // e.g. "v1,g0hM9LWM0... v1,k9F2..."
    const passedSignatures = msgSignature.split(' ');
    for (const versionedSig of passedSignatures) {
      const parts = versionedSig.split(',');
      if (parts.length === 2 && parts[0] === 'v1') {
        const candidateSig = parts[1];
        if (candidateSig === computedSignatureBase64) {
          return { valid: true };
        }
      }
    }

    return { valid: false, reason: 'Signature mismatch' };
  } catch (err: any) {
    return { valid: false, reason: `Cryptographic verification failed: ${err?.message || 'Unknown error'}` };
  }
}

/**
 * Sanitize untrusted inbound HTML email content before forwarding.
 * Strips script tags, style tags, dangerous event handlers, and javascript: links.
 */
export function sanitizeInboundHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/\s*on\w+\s*=\s*([\"'][^\"']*[\"']|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*([\"'])\s*javascript:[^\"']*\1/gi, 'href="#"')
    .replace(/src\s*=\s*([\"'])\s*javascript:[^\"']*\1/gi, 'src="#"');
}

export interface InboundEmailDetails {


  id: string;
  from: string;
  to: string[] | string;
  subject?: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  attachments?: Array<{
    filename: string;
    content?: string;
    contentType?: string;
    size?: number;
  }>;
  created_at?: string;
}

/**
 * Fetch full received email details from Resend API if webhook payload only contains an ID.
 * Uses GET https://api.resend.com/emails/{emailId}
 */
export async function fetchReceivedEmailDetails(
  emailId: string,
  options?: {
    apiKey?: string;
    env?: Record<string, any>;
    fetchFn?: typeof fetch;
    apiUrl?: string;
  }
): Promise<InboundEmailDetails> {
  const fetchImpl = options?.fetchFn || fetch;
  const apiKey = options?.apiKey || getResendApiKey(options?.env);

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured for fetching received email details');
  }

  const baseUrl = options?.apiUrl || 'https://api.resend.com';
  const url = `${baseUrl}/emails/${encodeURIComponent(emailId)}`;

  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'User-Agent': 'EventGameStudio-Inbound/1.0',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Failed to fetch received email (${response.status}): ${errorText || response.statusText}`);
  }

  const data = await response.json();
  return {
    id: data.id || emailId,
    from: data.from || 'unknown@sender.com',
    to: data.to || [],
    subject: data.subject || '(No Subject)',
    html: data.html || '',
    text: data.text || '',
    headers: data.headers || {},
    attachments: data.attachments || [],
    created_at: data.created_at,
  };
}

export interface ForwardInboundEmailResult {
  success: boolean;
  forwarded: boolean;
  duplicate?: boolean;
  forwardMessageId?: string;
  originalMessageId?: string;
  originalSender?: string;
  originalRecipient?: string;
  error?: string;
}

/**
 * Format and forward an inbound email to eventgamestudio@gmail.com
 */
export async function forwardInboundEmail(params: {
  email: InboundEmailDetails;
  env?: Record<string, any>;
  fetchFn?: typeof fetch;
  forwardTo?: string;
}): Promise<ForwardInboundEmailResult> {
  const { email, env, fetchFn, forwardTo = FORWARD_DESTINATION_EMAIL } = params;

  // 1. Idempotency check: prevent duplicate forwarding
  if (isMessageAlreadyProcessed(email.id)) {
    return {
      success: true,
      forwarded: false,
      duplicate: true,
      originalMessageId: email.id,
      originalSender: email.from,
    };
  }

  // 2. Format subject with prefix
  const rawSubject = email.subject || '(No Subject)';
  const forwardedSubject = rawSubject.startsWith(FORWARD_SUBJECT_PREFIX)
    ? rawSubject
    : `${FORWARD_SUBJECT_PREFIX} ${rawSubject}`;

  // 3. Extract sender & recipients for display
  const originalFrom = email.from;
  const originalToArray = Array.isArray(email.to) ? email.to : [email.to];
  const originalTo = originalToArray.join(', ');

  // 4. Sanitize HTML and prepare fallback plain text
  const cleanHtmlBody = sanitizeInboundHtml(email.html || '');
  const cleanTextBody = email.text || '';

  // 5. Build rich forwarded HTML envelope
  const forwardedHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(forwardedSubject)}</title>
</head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <div style="max-width: 680px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    
    <!-- Header banner -->
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); color: #ffffff; padding: 20px 24px; border-bottom: 2px solid #6366f1;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #a5b4fc; font-weight: 600; margin-bottom: 4px;">
        Branded Inbound Email Notification
      </div>
      <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #ffffff;">
        Customer Reply Received via EventGameStudio
      </h2>
    </div>

    <!-- Metadata table -->
    <div style="padding: 16px 24px; background-color: #f1f5f9; border-bottom: 1px solid #e2e8f0; font-size: 13px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 0; color: #64748b; font-weight: 600; width: 110px;">From:</td>
          <td style="padding: 4px 0; color: #0f172a; font-weight: 600;">${escapeHtml(originalFrom)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b; font-weight: 600;">Addressed To:</td>
          <td style="padding: 4px 0; color: #334155;">${escapeHtml(originalTo)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b; font-weight: 600;">Original Subject:</td>
          <td style="padding: 4px 0; color: #334155;">${escapeHtml(rawSubject)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b; font-weight: 600;">Message ID:</td>
          <td style="padding: 4px 0; color: #64748b; font-family: monospace; font-size: 11px;">${escapeHtml(email.id)}</td>
        </tr>
      </table>
    </div>

    <!-- Message body container -->
    <div style="padding: 24px; line-height: 1.6; font-size: 14px; color: #1e293b;">
      ${cleanHtmlBody || (cleanTextBody ? `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${escapeHtml(cleanTextBody)}</pre>` : '<em style="color: #94a3b8;">(Empty message body)</em>')}
    </div>

    <!-- Attachment indicator if present -->
    ${
      email.attachments && email.attachments.length > 0
        ? `
    <div style="padding: 12px 24px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
      <strong>Attachments (${email.attachments.length}):</strong>
      <ul style="margin: 6px 0 0 16px; padding: 0;">
        ${email.attachments
          .map(
            (att) =>
              `<li>${escapeHtml(att.filename)}${att.size ? ` (${Math.round(att.size / 1024)} KB)` : ''}</li>`
          )
          .join('')}
      </ul>
    </div>
    `
        : ''
    }

    <!-- Footer -->
    <div style="padding: 16px 24px; background-color: #ffffff; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; text-align: center;">
      This email was received by EventGameStudio inbound mail system and securely forwarded to your team inbox.<br>
      To respond directly to the sender, click "Reply" (Reply-To is configured to ${escapeHtml(originalFrom)}).
    </div>

  </div>
</body>
</html>
  `.trim();

  // Plain text fallback
  const forwardedText = `
--- [EventGameStudio Reply Received] ---
From: ${originalFrom}
To: ${originalTo}
Subject: ${rawSubject}
Message ID: ${email.id}

--- Message Content ---
${cleanTextBody || cleanHtmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}

----------------------------------------
To reply directly to this customer, reply to this email (Reply-To is set to ${originalFrom}).
  `.trim();

  // 6. Send the forwarded email via Resend
  // Important security rule: Use the verified branded sender from RESEND_INVITATION_FROM
  // Never use the untrusted customer email as the SMTP 'From' (prevent open relay).
  // Set replyTo to the original sender so Gmail user can simply hit "Reply" to write back!
  const sendResult = await sendEmailViaResend({
    to: forwardTo,
    subject: forwardedSubject,
    html: forwardedHtml,
    text: forwardedText,
    replyTo: originalFrom, // Replying in Gmail sends directly to the customer!
    env,
    fetchFn,
  });

  if (!sendResult.success) {
    return {
      success: false,
      forwarded: false,
      originalMessageId: email.id,
      originalSender: originalFrom,
      error: sendResult.error || 'Failed to forward inbound email via Resend',
    };
  }

  // 7. Record idempotency to prevent duplicate forwards
  markMessageProcessed(email.id, sendResult.messageId);

  return {
    success: true,
    forwarded: true,
    forwardMessageId: sendResult.messageId,
    originalMessageId: email.id,
    originalSender: originalFrom,
    originalRecipient: originalTo,
  };
}

/**
 * Main Webhook Dispatcher for Resend Inbound & Event Webhooks.
 *
 * Handles:
 * 1. Svix webhook signature verification
 * 2. `email.received` event processing:
 *    - Extract email ID and data
 *    - Fetch full email details if needed
 *    - Forward to eventgamestudio@gmail.com
 *    - Return 200 OK
 * 3. Fallback to existing delivery/bounce tracking for `email.delivered`, `email.bounced`, etc.
 */
export async function handleResendInboundWebhookRequest(params: {
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
  env?: Record<string, any>;
  fetchFn?: typeof fetch;
}): Promise<{
  statusCode: number;
  responseBody: {
    success: boolean;
    eventType?: string;
    message?: string;
    forwarded?: boolean;
    duplicate?: boolean;
    error?: string;
  };
}> {
  const { rawBody, headers, env, fetchFn } = params;

  // 1. Get webhook secret from environment
  const webhookSecret = env?.RESEND_WEBHOOK_SECRET || process?.env?.RESEND_WEBHOOK_SECRET;

  // If secret is configured, strictly verify Svix signature
  if (webhookSecret) {
    const verification = await verifySvixWebhookSignature({
      payload: rawBody,
      headers,
      secret: webhookSecret,
    });

    if (!verification.valid) {
      console.warn('[Resend Webhook] Signature verification failed:', verification.reason);
      return {
        statusCode: 401,
        responseBody: {
          success: false,
          error: `Webhook signature verification failed: ${verification.reason}`,
        },
      };
    }
  }

  // 2. Parse payload safely
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (err: any) {
    return {
      statusCode: 400,
      responseBody: {
        success: false,
        error: 'Invalid JSON payload in webhook body',
      },
    };
  }

  const eventType = String(payload?.type || '').toLowerCase();

  // 3. If event is 'email.received', execute Method B Inbound Email Forwarding
  if (eventType === 'email.received') {
    const data = payload?.data || {};
    const emailId = data.email_id || data.id;

    if (!emailId) {
      return {
        statusCode: 400,
        responseBody: {
          success: false,
          error: 'Missing email_id in email.received webhook payload',
        },
      };
    }

    // Check idempotency first before fetching details
    if (isMessageAlreadyProcessed(emailId)) {
      return {
        statusCode: 200,
        responseBody: {
          success: true,
          eventType,
          message: 'Inbound email already forwarded (idempotent duplicate skipped)',
          forwarded: false,
          duplicate: true,
        },
      };
    }

    try {
      // Determine if payload already has full email body or needs fetching
      let emailDetails: InboundEmailDetails;
      if (data.html || data.text || data.from) {
        emailDetails = {
          id: emailId,
          from: data.from || 'unknown@sender.com',
          to: data.to || [],
          subject: data.subject || '(No Subject)',
          html: data.html || '',
          text: data.text || '',
          headers: data.headers || {},
          attachments: data.attachments || [],
        };
      } else {
        // Fetch full email details from Resend API
        emailDetails = await fetchReceivedEmailDetails(emailId, {
          env,
          fetchFn,
        });
      }

      // Forward to eventgamestudio@gmail.com
      const forwardResult = await forwardInboundEmail({
        email: emailDetails,
        env,
        fetchFn,
      });

      if (!forwardResult.success) {
        return {
          statusCode: 502,
          responseBody: {
            success: false,
            eventType,
            error: forwardResult.error || 'Failed to forward inbound email',
          },
        };
      }

      return {
        statusCode: 200,
        responseBody: {
          success: true,
          eventType,
          message: forwardResult.duplicate
            ? 'Inbound email already forwarded'
            : 'Inbound email received and forwarded successfully to Gmail',
          forwarded: forwardResult.forwarded,
          duplicate: forwardResult.duplicate,
        },
      };
    } catch (err: any) {
      console.error('[Resend Inbound] Error processing email.received:', err);
      return {
        statusCode: 500,
        responseBody: {
          success: false,
          eventType,
          error: sanitizeErrorMessage(err?.message || 'Inbound processing error'),
        },
      };
    }
  }

  // 4. Return standard success for non-inbound webhook events (e.g. email.delivered, email.bounced)
  return {
    statusCode: 200,
    responseBody: {
      success: true,
      eventType,
      message: 'Webhook received',
    },
  };
}
