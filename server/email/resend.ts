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
  fetchFn?: typeof fetch; // Optional custom fetch implementation for testing / isolation
  apiUrl?: string; // Optional custom API URL (defaults to https://api.resend.com/emails)
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
 * Retrieve the active Resend API key from runtime environment.
 * For Cloudflare Workers: Reads directly from Worker `env.RESEND_API_KEY` binding.
 * For Node.js / Express: Falls back to `process.env.RESEND_API_KEY`.
 * NEVER exposed to client or prefixed with VITE_.
 * Returns null if missing, empty, or placeholder.
 */
export function getResendApiKey(env?: Record<string, any>): string | null {
  // 1. Check Cloudflare Worker env binding first if provided
  if (env && typeof env === 'object') {
    if (typeof env.RESEND_API_KEY === 'string') {
      const trimmed = env.RESEND_API_KEY.trim();
      if (!trimmed || trimmed.toLowerCase().includes('placeholder') || trimmed.toLowerCase().includes('your-resend-api-key')) {
        return null;
      }
      return trimmed;
    }
    // If an env object was explicitly passed (e.g. Worker environment or test mock),
    // and RESEND_API_KEY is not defined on it, do not fall back to process.env.
    return null;
  }

  // 2. Fall back to Node.js process.env for Express runtime when env is not passed
  const procEnv = typeof process !== 'undefined' && process && process.env ? process.env : {};
  if (typeof procEnv.RESEND_API_KEY === 'string') {
    const trimmed = procEnv.RESEND_API_KEY.trim();
    if (!trimmed || trimmed.toLowerCase().includes('placeholder') || trimmed.toLowerCase().includes('your-resend-api-key')) {
      return null;
    }
    return trimmed;
  }

  return null;
}

/**
 * Retrieve the configured sender address for admin invitations.
 * Uses RESEND_INVITATION_FROM as primary server-side configuration,
 * with fallback to RESEND_FROM_EMAIL.
 * Reads from Cloudflare Worker env binding first, falling back to process.env.
 */
export function getResendInvitationFrom(env?: Record<string, any>): string | null {
  // 1. Check Cloudflare Worker env binding first if provided
  if (env && typeof env === 'object') {
    if (typeof env.RESEND_INVITATION_FROM === 'string' && env.RESEND_INVITATION_FROM.trim()) {
      return env.RESEND_INVITATION_FROM.trim();
    }
    if (typeof env.RESEND_FROM_EMAIL === 'string' && env.RESEND_FROM_EMAIL.trim()) {
      return env.RESEND_FROM_EMAIL.trim();
    }
    return null;
  }

  // 2. Fall back to Node.js process.env for Express runtime
  const procEnv = typeof process !== 'undefined' && process && process.env ? process.env : {};
  if (typeof procEnv.RESEND_INVITATION_FROM === 'string' && procEnv.RESEND_INVITATION_FROM.trim()) {
    return procEnv.RESEND_INVITATION_FROM.trim();
  }
  if (typeof procEnv.RESEND_FROM_EMAIL === 'string' && procEnv.RESEND_FROM_EMAIL.trim()) {
    return procEnv.RESEND_FROM_EMAIL.trim();
  }

  return null;
}

/**
 * Validates that RESEND_API_KEY is configured in the environment.
 * Returns a clear, actionable error if missing without leaking credentials.
 */
export function validateResendApiKeyConfig(env?: Record<string, any>): { valid: boolean; error?: string } {
  const apiKey = getResendApiKey(env);
  if (!apiKey) {
    return {
      valid: false,
      error: 'RESEND_API_KEY is not configured on this server environment. Please configure RESEND_API_KEY in server secrets.',
    };
  }
  return { valid: true };
}

/**
 * Sanitizes error messages to ensure API keys and authorization tokens are NEVER printed in logs or errors.
 */
export function sanitizeErrorMessage(msg: string, key?: string | null): string {
  if (!msg) return 'Unknown error';
  let clean = String(msg);
  if (key && key.length > 5) {
    clean = clean.split(key).join('[REDACTED]');
  }
  clean = clean.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
  clean = clean.replace(/re_[A-Za-z0-9_\-]+/gi, 're_[REDACTED]');
  return clean;
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

  // Validate sender domain structure (RFC compliance & non-empty TLD)
  const atParts = emailPart.split('@');
  if (atParts.length !== 2 || !atParts[1].includes('.') || atParts[1].startsWith('.') || atParts[1].endsWith('.')) {
    return {
      valid: false,
      error: `Configured RESEND_INVITATION_FROM "${rawFrom}" does not contain a valid sender domain.`,
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
  const keyCheck = validateResendApiKeyConfig(env);
  const senderCheck = validateResendSenderConfig(env);
  return keyCheck.valid && senderCheck.valid;
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
    fetchFn,
    apiUrl,
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

  // 3. Validate API key: fail fast and safely if missing
  const apiKey = getResendApiKey(env);
  if (!apiKey) {
    console.error('[Resend] Server configuration error: RESEND_API_KEY secret is not configured or missing in server environment.');
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

      const effectiveFetch = fetchFn || fetch;
      const effectiveUrl = apiUrl || 'https://api.resend.com/emails';

      const res = await effectiveFetch(effectiveUrl, {
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
        // Guard against any response that has ok=true but contains an error payload or HTTP error statusCode
        if (responseData && (responseData.error || (responseData.statusCode && responseData.statusCode >= 400))) {
          const rawErrMsg = responseData?.error?.message || responseData?.message || 'Resend provider rejected request';
          const errMsg = sanitizeErrorMessage(rawErrMsg, apiKey);
          return {
            success: false,
            error: errMsg,
            rawResponse: responseData,
            retryCount: attempt,
            status: 'failed',
            permanentFailure: true,
          };
        }

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
      const rawErrorMsg =
        responseData?.message ||
        responseData?.error?.message ||
        `Resend API error (${res.status}: ${res.statusText})`;
      lastError = sanitizeErrorMessage(rawErrorMsg, apiKey);

      // Check if transient error eligible for retry
      const isTransient = isTransientResendError(res.status);
      if (isTransient && attempt < maxRetries) {
        attempt++;
        // Respect retry-after header if present, capped at 2000ms
        let backoffDelay = initialBackoffMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 50);
        const retryAfterHeader = res.headers?.get ? res.headers.get('retry-after') : null;
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
        error: lastError,
        rawResponse: responseData,
        retryCount: attempt,
        status: 'failed',
        permanentFailure: !isTransient,
      };
    } catch (fetchErr: any) {
      const isTransient = isTransientResendError(null, fetchErr);
      const rawErrMsg = fetchErr?.message || 'Network error communicating with Resend API';
      lastError = sanitizeErrorMessage(rawErrMsg, apiKey);

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
  } else if (eventType === 'email.rejected' || eventType === 'email.failed') {
    deliveryStatus = 'bounced';
    const rejectMsg = data.reject?.reason || data.message || 'Email rejected by provider or suppression list';
    reason = `Rejected: ${rejectMsg}`;
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
