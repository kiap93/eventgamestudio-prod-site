/**
 * Resend Email Delivery Service (Dedicated Admin Invitations Mailer)
 *
 * Direct REST API client for sending Admin Customer Invitations via Resend.
 * Completely separated from the built-in system mailer (Gmail API).
 *
 * Features:
 * - Reads RESEND_API_KEY and RESEND_INVITATION_FROM server-side only (never exposed to browser)
 * - Safe retries with bounded exponential backoff for transient failures (429, 5xx, timeouts)
 * - Rejects permanent failures immediately without indefinite retries (400, 401, 403, 422)
 * - Validates sender and recipient configuration with clear, actionable error messages
 * - Never logs API keys, tokens, or credentials
 * - Resend webhook event processing for delivery and bounce tracking
 */

export interface SendResendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  env?: Record<string, any>;
  maxRetries?: number; // Default: 2 (total 3 attempts)
  initialBackoffMs?: number; // Default: 250ms
  timeoutMs?: number; // Default: 10000ms (10 seconds)
}

export interface ResendSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  rawResponse?: any;
  retryCount?: number;
  status?: 'sent' | 'failed';
  permanentFailure?: boolean;
}

export interface ResendWebhookPayload {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    id?: string;
    from?: string;
    to?: string[] | string;
    subject?: string;
    bounce?: {
      message?: string;
      type?: string;
      sub_type?: string;
    };
    [key: string]: any;
  };
}

export interface ProcessedResendWebhook {
  eventType: string;
  emailId: string | null;
  recipient: string | null;
  deliveryStatus: 'delivered' | 'bounced' | 'complained' | 'delayed' | 'sent' | 'unknown';
  reason: string | null;
  rawPayload: any;
}

// Basic email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Retrieve the active Resend API key from server-side environment.
 * NEVER exposed to client or prefixed with VITE_.
 */
export function getResendApiKey(env?: Record<string, any>): string | null {
  const procEnv = typeof process !== 'undefined' ? process.env : {};
  const key =
    (env && typeof env.RESEND_API_KEY === 'string' && env.RESEND_API_KEY.trim()) ||
    procEnv.RESEND_API_KEY?.trim() ||
    null;

  return key;
}

/**
 * Retrieve the configured sender address for admin invitations.
 * Uses RESEND_INVITATION_FROM as primary server-side configuration,
 * with fallback to RESEND_FROM_EMAIL.
 */
export function getResendInvitationFrom(env?: Record<string, any>): string | null {
  const procEnv = typeof process !== 'undefined' ? process.env : {};
  const configured =
    (env && typeof env.RESEND_INVITATION_FROM === 'string' && env.RESEND_INVITATION_FROM.trim()) ||
    procEnv.RESEND_INVITATION_FROM?.trim() ||
    (env && typeof env.RESEND_FROM_EMAIL === 'string' && env.RESEND_FROM_EMAIL.trim()) ||
    procEnv.RESEND_FROM_EMAIL?.trim() ||
    null;

  return configured;
}

/**
 * Validates sender configuration and returns a clear, actionable error if it is missing or malformed.
 */
export function validateResendSenderConfig(
  env?: Record<string, any>,
  customFrom?: string
): { valid: boolean; fromAddress?: string; error?: string } {
  const rawFrom = (customFrom && customFrom.trim()) || getResendInvitationFrom(env);

  if (!rawFrom) {
    return {
      valid: false,
      error:
        'Resend invitation sender address is missing. Please configure RESEND_INVITATION_FROM in your server environment (e.g. "Mun Jian (EventGameStudio) <invitations@eventgamestudio.com>" or "onboarding@resend.dev").',
    };
  }

  // Extract email component if formatted as "Name <email@domain.com>"
  const emailMatch = rawFrom.match(/<([^>]+)>/);
  const emailPart = (emailMatch ? emailMatch[1] : rawFrom).trim();

  if (!isValidEmail(emailPart)) {
    return {
      valid: false,
      error: `Configured RESEND_INVITATION_FROM "${rawFrom}" does not contain a valid email address.`,
    };
  }

  return {
    valid: true,
    fromAddress: rawFrom,
  };
}

/**
 * Check whether Resend is configured with a valid API key and sender address.
 */
export function isResendConfigured(env?: Record<string, any>): boolean {
  const apiKey = getResendApiKey(env);
  const senderCheck = validateResendSenderConfig(env);
  return Boolean(
    apiKey &&
    apiKey.trim().length > 0 &&
    !apiKey.includes('placeholder') &&
    senderCheck.valid
  );
}

/**
 * Helper to determine if an HTTP status code or error is a transient failure
 * eligible for safe bounded retry with exponential backoff.
 */
export function isTransientResendError(status: number | null, err?: any): boolean {
  if (status === 429) return true; // Rate limit / Too Many Requests
  if (status && status >= 500 && status <= 599) return true; // Server errors (500, 502, 503, 504)

  if (err) {
    const msg = String(err.message || '').toLowerCase();
    const name = String(err.name || '').toLowerCase();
    if (name.includes('timeout') || msg.includes('timeout') || msg.includes('timed out')) return true;
    if (name.includes('abort') || msg.includes('aborted')) return true;
    if (msg.includes('fetch failed') || msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('network')) {
      return true;
    }
  }

  return false;
}

/**
 * Helper to sleep asynchronously for a specified duration in milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send an Admin Invitation email via dedicated Resend API.
 *
 * Implements:
 * 1. Strict server-side credential isolation (never uses or touches system Gmail mailer)
 * 2. Explicit sender configuration validation
 * 3. Safe retries with bounded exponential backoff for transient failures (429, 5xx, timeouts)
 * 4. Immediate fail-fast on permanent rejection errors (400, 401, 403, 422)
 * 5. Sanitized error messages without credential or token leakage
 */
export async function sendEmailViaResend(options: SendResendEmailOptions): Promise<ResendSendResult> {
  const {
    to,
    subject,
    html,
    text,
    fromName,
    fromEmail,
    replyTo,
    env,
    maxRetries = 2,
    initialBackoffMs = 250,
    timeoutMs = 10000,
  } = options;

  // 1. Validate recipients
  const recipients = Array.isArray(to) ? to : [to];
  const cleanRecipients = recipients.map((r) => (typeof r === 'string' ? r.trim() : '')).filter(Boolean);

  if (cleanRecipients.length === 0) {
    return {
      success: false,
      error: 'No recipient email addresses provided',
      permanentFailure: true,
      status: 'failed',
    };
  }

  for (const r of cleanRecipients) {
    if (!isValidEmail(r)) {
      return {
        success: false,
        error: `Invalid recipient email address: "${r}"`,
        permanentFailure: true,
        status: 'failed',
      };
    }
  }

  // 2. Validate sender configuration
  const customSender = fromEmail
    ? (fromEmail.includes('<') ? fromEmail : `${fromName || 'EventGameStudio'} <${fromEmail}>`)
    : undefined;

  const senderValidation = validateResendSenderConfig(env, customSender);
  if (!senderValidation.valid) {
    return {
      success: false,
      error: senderValidation.error,
      permanentFailure: true,
      status: 'failed',
    };
  }

  const fromAddress = senderValidation.fromAddress!;
  const apiKey = getResendApiKey(env);

  // 3. Handle non-production simulation or missing API key
  const isProduction =
    (env && env.NODE_ENV === 'production') ||
    (typeof process !== 'undefined' && process.env.NODE_ENV === 'production');

  if (!apiKey || apiKey.includes('placeholder')) {
    if (!isProduction) {
      const mockId = `sim_resend_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      console.log(`[Resend][Simulation] Simulating invitation email to ${cleanRecipients.join(', ')} (Subject: "${subject}")`);
      return {
        success: true,
        messageId: mockId,
        rawResponse: { id: mockId, simulated: true },
        retryCount: 0,
        status: 'sent',
      };
    }

    return {
      success: false,
      error: 'RESEND_API_KEY is not configured on this server environment. Please configure RESEND_API_KEY in server secrets.',
      permanentFailure: true,
      status: 'failed',
    };
  }

  // 4. Construct payload
  const payload: Record<string, any> = {
    from: fromAddress,
    to: cleanRecipients,
    subject,
    html,
  };

  if (text) {
    payload.text = text;
  }

  if (replyTo) {
    payload.reply_to = replyTo;
  } else {
    payload.reply_to = 'eventgamestudio@gmail.com';
  }

  // 5. Execute HTTP request with bounded exponential backoff
  let attempt = 0;
  let lastError = 'Unknown Resend error';
  let lastResponseData: any = null;

  while (attempt <= maxRetries) {
    try {
      // Abort controller for bounded timeout (10s)
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const responseData = await res.json().catch(() => null);
      lastResponseData = responseData;

      if (res.ok) {
        const messageId = responseData?.id || `resend_${Date.now()}`;
        return {
          success: true,
          messageId,
          rawResponse: responseData,
          retryCount: attempt,
          status: 'sent',
        };
      }

      // Extract provider error message
      const errorMsg =
        responseData?.message ||
        responseData?.error?.message ||
        `Resend API error (${res.status}: ${res.statusText})`;
      lastError = errorMsg;

      // Check if transient error eligible for retry
      const isTransient = isTransientResendError(res.status);
      if (isTransient && attempt < maxRetries) {
        attempt++;
        // Respect retry-after header if present, capped at 2000ms
        let backoffDelay = initialBackoffMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 50);
        const retryAfterHeader = res.headers.get('retry-after');
        if (retryAfterHeader) {
          const parsedSec = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsedSec) && parsedSec > 0) {
            backoffDelay = Math.min(2000, parsedSec * 1000);
          }
        }
        backoffDelay = Math.min(2000, backoffDelay);
        console.warn(`[Resend] Transient error (${res.status}). Retrying in ${backoffDelay}ms (attempt ${attempt}/${maxRetries})...`);
        await sleep(backoffDelay);
        continue;
      }

      // Permanent error (e.g. 400, 401, 403, 422): do NOT retry
      return {
        success: false,
        error: errorMsg,
        rawResponse: responseData,
        retryCount: attempt,
        status: 'failed',
        permanentFailure: !isTransient,
      };
    } catch (fetchErr: any) {
      const isTransient = isTransientResendError(null, fetchErr);
      lastError = fetchErr?.message || 'Network error communicating with Resend API';

      if (isTransient && attempt < maxRetries) {
        attempt++;
        const backoffDelay = Math.min(2000, initialBackoffMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 50));
        console.warn(`[Resend] Network error: ${lastError}. Retrying in ${backoffDelay}ms (attempt ${attempt}/${maxRetries})...`);
        await sleep(backoffDelay);
        continue;
      }

      return {
        success: false,
        error: lastError,
        retryCount: attempt,
        status: 'failed',
        permanentFailure: !isTransient,
      };
    }
  }

  return {
    success: false,
    error: `Resend delivery failed after ${attempt} attempts: ${lastError}`,
    rawResponse: lastResponseData,
    retryCount: attempt,
    status: 'failed',
    permanentFailure: false,
  };
}

/**
 * Process incoming Resend webhook payload to extract delivery or bounce status.
 */
export function processResendWebhookPayload(payload: any): ProcessedResendWebhook {
  const eventType = String(payload?.type || 'unknown').toLowerCase();
  const data = payload?.data || {};
  const emailId = data.email_id || data.id || null;

  const toField = data.to;
  let recipient: string | null = null;
  if (Array.isArray(toField) && toField.length > 0) {
    recipient = String(toField[0]).trim().toLowerCase();
  } else if (typeof toField === 'string' && toField.trim()) {
    recipient = toField.trim().toLowerCase();
  }

  let deliveryStatus: 'delivered' | 'bounced' | 'complained' | 'delayed' | 'sent' | 'unknown' = 'unknown';
  let reason: string | null = null;

  if (eventType === 'email.delivered') {
    deliveryStatus = 'delivered';
    reason = 'Email delivered successfully to destination server';
  } else if (eventType === 'email.bounced') {
    deliveryStatus = 'bounced';
    const bounceMsg = data.bounce?.message || data.bounce?.type || 'Recipient server bounced message';
    reason = `Bounced: ${bounceMsg}`;
  } else if (eventType === 'email.complained') {
    deliveryStatus = 'complained';
    reason = 'Recipient marked message as spam complaint';
  } else if (eventType === 'email.delivery_delayed') {
    deliveryStatus = 'delayed';
    reason = 'Delivery delayed by recipient mail server';
  } else if (eventType === 'email.sent') {
    deliveryStatus = 'sent';
    reason = 'Email dispatched from Resend';
  }

  return {
    eventType,
    emailId,
    recipient,
    deliveryStatus,
    reason,
    rawPayload: payload,
  };
}
