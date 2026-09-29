import crypto from 'node:crypto';
import Stripe from 'stripe';
import {
  getTopupOrderById,
  findTopupOrderByReference,
  processTopupOrderStatus,
  recordWalletAuditEvent,
  getWalletBalance,
  attachCheckoutSessionToTopupOrder,
  getOutstandingBalance,
  setOutstandingBalance,
  addOutstandingBalance,
  clearOutstandingBalance,
  cancelActiveCheckoutSession,
  expireActiveCheckoutSession,
  claimCheckoutSessionCreation,
  releaseCheckoutSessionClaim,
  toCents,
  fromCents,
} from '../db/wallet.js';
import {
  TopupOrderRecord,
  TopupOrderStatus,
  WalletTransactionRecord,
  WalletBalanceSummary,
} from '../db/types.js';
import {
  dispatchNotificationEvent,
  PaymentSuccessEvent,
} from '../notifications/dispatcher.js';
import {
  NotificationRecord,
} from '../notifications/types.js';
import {
  getNotificationByDeduplicationKey,
} from '../db/notifications.js';
import { isProductionEnvironment, isSupabaseConfigured } from '../supabase.js';

export {
  getOutstandingBalance,
  setOutstandingBalance,
  addOutstandingBalance,
  clearOutstandingBalance,
  cancelActiveCheckoutSession,
  expireActiveCheckoutSession,
  claimCheckoutSessionCreation,
  releaseCheckoutSessionClaim,
};

/**
 * Authoritative supported payment methods configuration.
 * Currently, only Credit / Debit Card ('card') is configured and supported by Stripe Checkout.
 * Online Banking / FPX is not supported by the Stripe configuration and must not be advertised.
 */
export const SUPPORTED_PAYMENT_METHODS = [
  {
    id: 'card',
    name: 'Credit / Debit Card',
    description: 'Visa, Mastercard, American Express',
    enabled: true,
  },
] as const;

export type SupportedPaymentMethod = (typeof SUPPORTED_PAYMENT_METHODS)[number]['id'];

export function isPaymentMethodSupported(method?: string | null): boolean {
  if (!method) return true; // Default fallback to card is permitted
  const normalized = method.toLowerCase().trim();
  return SUPPORTED_PAYMENT_METHODS.some((m) => m.id === normalized && m.enabled);
}

export function getSupportedPaymentMethods() {
  return SUPPORTED_PAYMENT_METHODS.filter((m) => m.enabled).map((m) => ({ ...m }));
}

let stripeClientInstance: Stripe | null = null;
let lastResolvedSecretKey: string | null = null;

/**
 * Lazy initializer for Stripe client (server-side and Cloudflare Worker compatible)
 */
export function getStripeClient(env?: Record<string, any>): Stripe | null {
  const rawKey =
    env?.STRIPE_SECRET_KEY ||
    env?.STRIPE_API_KEY ||
    env?.STRIPE_KEY ||
    env?.STRIPE_SECRET ||
    env?.STRIPE_SK ||
    env?.stripe_secret_key ||
    env?.stripe_api_key ||
    env?.stripe_sk ||
    env?.stripeSecretKey ||
    (typeof process !== 'undefined'
      ? process.env.STRIPE_SECRET_KEY ||
        process.env.STRIPE_API_KEY ||
        process.env.STRIPE_KEY ||
        process.env.STRIPE_SECRET ||
        process.env.STRIPE_SK ||
        process.env.stripe_secret_key
      : undefined) ||
    (typeof globalThis !== 'undefined'
      ? (globalThis as any).STRIPE_SECRET_KEY ||
        (globalThis as any).STRIPE_API_KEY ||
        (globalThis as any).env?.STRIPE_SECRET_KEY ||
        (globalThis as any).process?.env?.STRIPE_SECRET_KEY
      : undefined);

  if (!rawKey || typeof rawKey !== 'string') return null;

  // Trim whitespace and remove accidental surrounding quotes (e.g. "sk_live_..." or 'sk_test_...')
  const secretKey = rawKey.trim().replace(/^["']|["']$/g, '');
  if (!secretKey) return null;

  if (!stripeClientInstance || lastResolvedSecretKey !== secretKey) {
    try {
      // Use createFetchHttpClient for Cloudflare Workers / Edge runtimes if available
      const fetchHttpClient = typeof (Stripe as any).createFetchHttpClient === 'function'
        ? (Stripe as any).createFetchHttpClient()
        : undefined;

      stripeClientInstance = new Stripe(secretKey, fetchHttpClient ? { httpClient: fetchHttpClient } : undefined);
    } catch {
      stripeClientInstance = new Stripe(secretKey);
    }
    lastResolvedSecretKey = secretKey;
  }
  return stripeClientInstance;
}

export const STRIPE_MINIMUM_AMOUNT_MYR = 2.00;

/**
 * Server-authoritative total due calculation:
 * total due = current payable amount + any existing outstanding amount
 */
export function calculateTotalDue(
  payableAmount: number,
  existingOutstandingAmount: number
): number {
  const payableCents = toCents(Math.max(0, Number(payableAmount) || 0));
  const outstandingCents = toCents(Math.max(0, Number(existingOutstandingAmount) || 0));
  return fromCents(payableCents + outstandingCents);
}

export type PaymentAmountEvaluation =
  | { action: 'ZERO_AMOUNT'; totalDue: 0; shouldCreateSession: false; message: string }
  | { action: 'PERSIST_OUTSTANDING'; totalDue: number; shouldCreateSession: false; message: string }
  | { action: 'CREATE_SESSION'; totalDue: number; shouldCreateSession: true; message: string };

/**
 * Server-authoritative evaluation of payable amount and outstanding balance:
 * - RM0.00 -> do not create Checkout Session
 * - RM0.01 - RM1.99 -> do not create Checkout Session, persist as outstanding balance
 * - RM2.00+ -> create Stripe Checkout Session
 *
 * Enforces:
 * - Do NOT silently round RM1.00 to RM2.00
 * - Do NOT charge more than actual amount owed
 */
export function evaluatePaymentAmount(
  payableAmount: number,
  existingOutstandingAmount: number
): PaymentAmountEvaluation {
  const totalDue = calculateTotalDue(payableAmount, existingOutstandingAmount);
  const totalDueCents = toCents(totalDue);
  const minCents = toCents(STRIPE_MINIMUM_AMOUNT_MYR);

  if (totalDueCents <= 0) {
    return {
      action: 'ZERO_AMOUNT',
      totalDue: 0,
      shouldCreateSession: false,
      message: 'Total due is RM0.00. Do not create Checkout Session.',
    };
  }

  if (totalDueCents < minCents) {
    return {
      action: 'PERSIST_OUTSTANDING',
      totalDue,
      shouldCreateSession: false,
      message: `Total due (RM${totalDue.toFixed(2)}) is below Stripe minimum of RM2.00. Persist as outstanding balance.`,
    };
  }

  return {
    action: 'CREATE_SESSION',
    totalDue,
    shouldCreateSession: true,
    message: `Total due (RM${totalDue.toFixed(2)}) meets Stripe minimum. Create Stripe Checkout Session.`,
  };
}

export interface PaymentSessionConfig {
  order: TopupOrderRecord;
  originUrl?: string;
  customerEmail?: string;
  env?: Record<string, any>;
  payableAmount?: number;
}

export interface PaymentSessionResult {
  sessionId: string;
  checkoutUrl: string;
  paymentReference: string;
  paymentMethod: string;
  orderId: string;
  amount: number;
  currency: string;
  expiresAt: string;
  totalDue?: number;
  payableAmount?: number;
  outstandingAmount?: number;
  sessionCreated?: boolean;
  status?: 'SESSION_CREATED' | 'OUTSTANDING_BALANCE_RECORDED' | 'ZERO_AMOUNT_NO_SESSION';
  message?: string;
}

export interface WebhookVerificationParams {
  rawBody: string;
  signature?: string | null;
  headers?: Record<string, string | string[] | undefined>;
  secretOverride?: string;
  env?: Record<string, any>;
}

export interface WebhookProcessingResult {
  success: boolean;
  isDuplicate: boolean;
  alreadyProcessed: boolean;
  status: 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
  orderId: string;
  paymentReference?: string;
  paymentMethod?: string;
  amount?: number;
  currency?: string;
  order?: TopupOrderRecord;
  ledgerResult?: any;
  message?: string;
  error?: string;
}

/**
 * Get payment webhook secret from environment variables.
 * CRITICAL SECURITY: Production fails closed with NO hardcoded default secret.
 */
export function getPaymentWebhookSecret(env?: Record<string, any>, secretOverride?: string): string {
  if (secretOverride) return secretOverride;

  const secret =
    env?.PAYMENT_WEBHOOK_SECRET ||
    env?.STRIPE_WEBHOOK_SECRET ||
    (typeof process !== 'undefined'
      ? process.env.PAYMENT_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET
      : undefined);

  if (!secret) {
    const err: any = new Error(
      'Server security configuration error: PAYMENT_WEBHOOK_SECRET is not configured on the server. Webhook verification rejected.'
    );
    err.status = 500;
    err.code = 'MISSING_WEBHOOK_SECRET';
    throw err;
  }

  return secret;
}

/**
 * Generate HMAC-SHA256 signature for payload.
 * Supports Stripe format (t=timestamp,v1=sig) or standard hex signature.
 */
export function generateWebhookSignature(
  payload: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): { signatureHeader: string; rawSignature: string; timestamp: number } {
  const signedPayload = `${timestamp}.${payload}`;
  const rawSignature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  const signatureHeader = `t=${timestamp},v1=${rawSignature}`;
  return { signatureHeader, rawSignature, timestamp };
}

/**
 * Securely verify webhook signature using timing-safe comparison.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined | null,
  secret: string,
  toleranceSeconds: number = 300
): { isValid: boolean; error?: string; timestamp?: number } {
  if (!signatureHeader) {
    return { isValid: false, error: 'Missing webhook signature header' };
  }

  try {
    // 1. Check if signature is in Stripe format (t=xxx,v1=yyy)
    if (signatureHeader.includes('t=') && signatureHeader.includes('v1=')) {
      const items = signatureHeader.split(',');
      let timestampStr: string | undefined;
      const v1Signatures: string[] = [];

      for (const item of items) {
        const eqIdx = item.indexOf('=');
        if (eqIdx === -1) continue;
        const k = item.slice(0, eqIdx).trim();
        const v = item.slice(eqIdx + 1).trim();
        if (k === 't') timestampStr = v;
        if (k === 'v1') v1Signatures.push(v);
      }

      if (!timestampStr || v1Signatures.length === 0) {
        return { isValid: false, error: 'Malformed stripe-signature header' };
      }

      const timestamp = parseInt(timestampStr, 10);
      if (isNaN(timestamp)) {
        return { isValid: false, error: 'Invalid signature timestamp' };
      }

      // Check timestamp tolerance
      const now = Math.floor(Date.now() / 1000);
      if (toleranceSeconds > 0 && Math.abs(now - timestamp) > toleranceSeconds) {
        return { isValid: false, error: 'Webhook timestamp outside tolerance window (replay protection)', timestamp };
      }

      const signedPayload = `${timestamp}.${rawBody}`;
      const expectedSig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
      const expectedBuffer = Buffer.from(expectedSig, 'utf8');

      let isMatch = false;
      for (const v1Sig of v1Signatures) {
        if (Buffer.byteLength(expectedSig) === Buffer.byteLength(v1Sig)) {
          if (crypto.timingSafeEqual(expectedBuffer, Buffer.from(v1Sig, 'utf8'))) {
            isMatch = true;
            break;
          }
        }
      }

      return { isValid: isMatch, error: isMatch ? undefined : 'Signature verification failed', timestamp };
    }

    // 2. Check if signature is standard sha256=hex or raw hex
    let providedSig = signatureHeader;
    if (providedSig.startsWith('sha256=')) {
      providedSig = providedSig.slice(7);
    }

    const expectedSigRaw = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (providedSig.length !== expectedSigRaw.length) {
      return { isValid: false, error: 'Signature length mismatch' };
    }

    const isMatchRaw = crypto.timingSafeEqual(
      Buffer.from(expectedSigRaw, 'utf8'),
      Buffer.from(providedSig, 'utf8')
    );

    return { isValid: isMatchRaw, error: isMatchRaw ? undefined : 'Signature verification failed' };
  } catch (err: any) {
    return { isValid: false, error: `Signature verification error: ${err.message}` };
  }
}

/**
 * Create a payment checkout session for a Top Up Order.
 *
 * SERVER-AUTHORITATIVE STRIPE MINIMUM PAYMENT HANDLING:
 * total due = current payable amount + any existing outstanding amount
 * - RM0.00 -> do not create Checkout Session
 * - RM0.01-RM1.99 -> do not create Checkout Session, persist amount as outstanding balance
 * - RM2.00+ -> create Stripe Checkout Session
 *
 * Guaranteed boundaries:
 * - Do NOT silently round RM1.00 to RM2.00
 * - Do NOT charge more than actual amount owed
 * - Outstanding balance remains in DB until confirmed successful settlement
 * - Replaces any expired/cancelled attempt without losing outstanding balance
 * - Prevents duplicate active Stripe Checkout Sessions for the same top-up order
 * - Safely deduplicates concurrent requests / double-clicks
 */

// Per-order in-flight session creation mutex / promise de-duplication
const inFlightCheckoutSessions = new Map<string, Promise<PaymentSessionResult>>();

export function _clearInFlightCheckoutSessionsForTests() {
  inFlightCheckoutSessions.clear();
}

export function _getInFlightCheckoutSessionsCount() {
  return inFlightCheckoutSessions.size;
}

export async function createPaymentSession(
  config: PaymentSessionConfig
): Promise<PaymentSessionResult> {
  const { order } = config;
  if (!order || !order.id) {
    throw new Error('Valid top-up order is required to create a payment session');
  }

  // 1. IN-FLIGHT CONCURRENCY DEDUPLICATION (Double-click / simultaneous request protection)
  // If a session creation is already in-flight for this exact order, await and return the exact same promise!
  const existingInFlight = inFlightCheckoutSessions.get(order.id);
  if (existingInFlight) {
    return await existingInFlight;
  }

  const sessionPromise = (async () => {
    try {
      return await executeCreatePaymentSession(config);
    } finally {
      inFlightCheckoutSessions.delete(order.id);
    }
  })();

  inFlightCheckoutSessions.set(order.id, sessionPromise);
  return await sessionPromise;
}

async function executeCreatePaymentSession(
  config: PaymentSessionConfig
): Promise<PaymentSessionResult> {
  const { order, originUrl, customerEmail, env, payableAmount } = config;

  // 1. Always re-fetch the freshest order from the authoritative database/cache
  const currentOrder = (await getTopupOrderById(order.id, env)) || order;

  if (currentOrder.status !== 'PENDING') {
    throw new Error(
      `Cannot create payment session for order in status ${currentOrder.status}. Only PENDING orders can be checked out.`
    );
  }

  // Reject checkout for orders with unsupported payment methods
  if (currentOrder.payment_method && !isPaymentMethodSupported(currentOrder.payment_method)) {
    throw new Error(
      `Unsupported payment method '${currentOrder.payment_method}'. Currently supported payment methods: ${SUPPORTED_PAYMENT_METHODS.map((m) => m.id).join(', ')}.`
    );
  }

  // 2. Determine Current Payable Amount and Existing Outstanding Amount
  const currentPayable = payableAmount !== undefined ? Number(payableAmount) : Number(currentOrder.top_up_amount);
  const existingOutstanding = await getOutstandingBalance(currentOrder.organization_id, env);

  // 3. Server-Authoritative Evaluation of Total Due
  const evaluation = evaluatePaymentAmount(currentPayable, existingOutstanding);
  const totalDue = evaluation.totalDue;

  // Case 1: RM0.00 -> Do NOT create Checkout Session
  if (evaluation.action === 'ZERO_AMOUNT') {
    return {
      sessionId: '',
      checkoutUrl: '',
      paymentReference: '',
      paymentMethod: '',
      orderId: currentOrder.id,
      amount: 0,
      currency: currentOrder.currency,
      expiresAt: '',
      totalDue: 0,
      payableAmount: currentPayable,
      outstandingAmount: existingOutstanding,
      sessionCreated: false,
      status: 'ZERO_AMOUNT_NO_SESSION',
      message: evaluation.message,
    };
  }

  // Case 2: RM0.01–RM1.99 -> Do NOT create Checkout Session. Persist amount as outstanding balance!
  if (evaluation.action === 'PERSIST_OUTSTANDING') {
    // Persist totalDue as the organization's new outstanding balance
    await setOutstandingBalance(currentOrder.organization_id, totalDue, env);

    // Update top-up order record with outstanding metadata
    try {
      await attachCheckoutSessionToTopupOrder(
        currentOrder.id,
        {
          sessionId: `outstanding_${currentOrder.id}`,
          checkoutUrl: '',
          paymentReference: `OUTSTANDING_${currentOrder.id}`,
          paymentMethod: 'outstanding_balance',
          totalDue,
          payableAmount: currentPayable,
          includedOutstandingAmount: totalDue,
        },
        env
      );
    } catch (attachErr: any) {
      console.error(`[Payment Session] Could not record outstanding metadata on order ${currentOrder.id}:`, attachErr);
      if (isProductionEnvironment(env) || isSupabaseConfigured(env)) {
        throw new Error(`Financial session attachment failed: ${attachErr.message}`);
      }
    }

    return {
      sessionId: '',
      checkoutUrl: '',
      paymentReference: `OUTSTANDING_${currentOrder.id}`,
      paymentMethod: 'outstanding_balance',
      orderId: currentOrder.id,
      amount: totalDue,
      currency: currentOrder.currency,
      expiresAt: '',
      totalDue,
      payableAmount: currentPayable,
      outstandingAmount: totalDue,
      sessionCreated: false,
      status: 'OUTSTANDING_BALANCE_RECORDED',
      message: evaluation.message,
    };
  }

  // Case 3: RM2.00+ -> Check if active valid Checkout Session ALREADY exists!
  const baseUrl = originUrl || (typeof process !== 'undefined' ? process.env.APP_URL : '') || '';
  const stripe = getStripeClient(env);
  const isProduction =
    env?.NODE_ENV === 'production' ||
    env?.ENVIRONMENT === 'production' ||
    (typeof process !== 'undefined' && process.env.NODE_ENV === 'production');

  // In production, require live Stripe payment configuration
  if (isProduction && !stripe) {
    const err: any = new Error(
      'Payment checkout service unavailable: STRIPE_SECRET_KEY is required in production environments to initialize payment checkout.'
    );
    err.status = 500;
    err.code = 'MISSING_STRIPE_SECRET_KEY';
    throw err;
  }

  // Check for existing checkout session on currentOrder
  const existingSessionId =
    currentOrder.metadata?.stripe_session_id ||
    currentOrder.metadata?.sessionId;
  let existingCheckoutUrl = currentOrder.metadata?.checkout_url;
  let existingExpiresAt =
    currentOrder.metadata?.checkout_expires_at ||
    currentOrder.expired_at ||
    currentOrder.metadata?.expiresAt;

  const isSessionCancelled =
    Boolean(currentOrder.metadata?.checkout_cancelled) ||
    Boolean(currentOrder.metadata?.cancelled_at) ||
    currentOrder.metadata?.session_status === 'cancelled' ||
    currentOrder.metadata?.session_status === 'CANCELLED';

  let isSessionActiveAndValid = false;
  let sessionInvalidReason = '';

  if (existingSessionId && !isSessionCancelled) {
    let isTimestampExpired = false;
    if (existingExpiresAt) {
      const expiresTime = new Date(existingExpiresAt).getTime();
      if (!isNaN(expiresTime) && expiresTime <= Date.now()) {
        isTimestampExpired = true;
        sessionInvalidReason = 'checkout_session_expired';
      }
    }

    if (!isTimestampExpired) {
      if (stripe && existingSessionId.startsWith('cs_') && !existingSessionId.startsWith('cs_egs_')) {
        try {
          const stripeSession = await stripe.checkout.sessions.retrieve(existingSessionId);
          if (stripeSession.status === 'open') {
            if (stripeSession.expires_at && stripeSession.expires_at * 1000 <= Date.now()) {
              isSessionActiveAndValid = false;
              sessionInvalidReason = 'stripe_session_expired';
            } else {
              isSessionActiveAndValid = true;
              if (!existingCheckoutUrl && stripeSession.url) {
                existingCheckoutUrl = stripeSession.url;
              }
              if (stripeSession.expires_at) {
                existingExpiresAt = new Date(stripeSession.expires_at * 1000).toISOString();
              }
            }
          } else if (stripeSession.status === 'expired') {
            isSessionActiveAndValid = false;
            sessionInvalidReason = 'stripe_session_expired';
          } else if (stripeSession.status === 'complete' || stripeSession.payment_status === 'paid') {
            isSessionActiveAndValid = false;
            sessionInvalidReason = 'stripe_session_already_paid';
          } else {
            isSessionActiveAndValid = false;
            sessionInvalidReason = `stripe_session_status_${stripeSession.status}`;
          }
        } catch (retrieveErr: any) {
          console.warn(`[Payment Checkout] Failed to retrieve Stripe session ${existingSessionId}:`, retrieveErr.message);
          isSessionActiveAndValid = false;
          sessionInvalidReason = 'stripe_session_retrieve_failed';
        }
      } else {
        // Mock / local test mode session: active if checkoutUrl exists and not expired/cancelled
        if (existingCheckoutUrl) {
          isSessionActiveAndValid = true;
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // IF ACTIVE VALID SESSION EXISTS: REUSE IT! NEVER CREATE DUPLICATE SESSIONS!
  // --------------------------------------------------------------------------
  if (isSessionActiveAndValid && existingSessionId) {
    return {
      sessionId: existingSessionId,
      checkoutUrl: existingCheckoutUrl || `${baseUrl}/wallet/top-up?order_id=${currentOrder.id}&session_id=${existingSessionId}&checkout=true`,
      paymentReference: currentOrder.payment_reference || `STRIPE_${existingSessionId}`,
      paymentMethod: currentOrder.payment_method || 'card',
      orderId: currentOrder.id,
      amount: currentOrder.total_due || Number(currentOrder.top_up_amount) || totalDue,
      currency: currentOrder.currency,
      expiresAt: existingExpiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      totalDue: currentOrder.total_due || Number(currentOrder.top_up_amount) || totalDue,
      payableAmount: currentOrder.payable_amount !== undefined ? currentOrder.payable_amount : currentPayable,
      outstandingAmount: currentOrder.included_outstanding_amount !== undefined ? currentOrder.included_outstanding_amount : existingOutstanding,
      sessionCreated: false, // Flag explicitly indicating reused session, not newly created
      status: 'SESSION_CREATED',
      message: 'Active valid Stripe Checkout Session reused',
    };
  }

  // --------------------------------------------------------------------------
  // CREATE NEW CHECKOUT SESSION (When previous session is expired/cancelled/missing)
  // --------------------------------------------------------------------------
  const previousSessions = Array.isArray(currentOrder.metadata?.previous_sessions)
    ? [...currentOrder.metadata.previous_sessions]
    : [];

  if (existingSessionId) {
    previousSessions.push({
      sessionId: existingSessionId,
      checkoutUrl: existingCheckoutUrl,
      expiredAt: existingExpiresAt,
      invalidatedAt: new Date().toISOString(),
      reason: sessionInvalidReason || (isSessionCancelled ? 'session_cancelled' : 'session_invalid_or_expired'),
    });
  }

  // --------------------------------------------------------------------------
  // DATABASE-LEVEL ATOMIC CHECKOUT CLAIM & DISTRIBUTED CONCURRENCY LOCK
  // --------------------------------------------------------------------------
  // Concept:
  // PENDING order -> atomic "claim checkout creation" -> only ONE request wins -> Stripe Checkout -> save session
  // Others wait/re-read the order. This guarantees distributed safety across Cloudflare Workers.
  const claimId = `claim_${crypto.randomUUID()}`;
  let claimResult = await claimCheckoutSessionCreation(
    currentOrder.id,
    { claimId, timeoutSeconds: 30 },
    env
  );

  // If active session was already created by another worker, reuse it immediately:
  if (claimResult.alreadyHasSession && (claimResult.sessionId || claimResult.order)) {
    const activeOrder = claimResult.order || (await getTopupOrderById(currentOrder.id, env)) || currentOrder;
    const activeMeta = (activeOrder.metadata && typeof activeOrder.metadata === 'object') ? activeOrder.metadata : {};
    const activeSessionId = activeMeta.stripe_session_id || activeMeta.sessionId || claimResult.sessionId;
    const activeCheckoutUrl = activeMeta.checkout_url || claimResult.checkoutUrl;
    const activeExpiresAt = activeMeta.checkout_expires_at || activeOrder.expired_at || claimResult.expiresAt;

    return {
      sessionId: activeSessionId || '',
      checkoutUrl: activeCheckoutUrl || `${baseUrl}/wallet/top-up?order_id=${activeOrder.id}&session_id=${activeSessionId}&checkout=true`,
      paymentReference: activeOrder.payment_reference || `STRIPE_${activeSessionId}`,
      paymentMethod: activeOrder.payment_method || 'card',
      orderId: activeOrder.id,
      amount: activeOrder.total_due || Number(activeOrder.top_up_amount) || totalDue,
      currency: activeOrder.currency,
      expiresAt: activeExpiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      totalDue: activeOrder.total_due || Number(activeOrder.top_up_amount) || totalDue,
      payableAmount: activeOrder.payable_amount !== undefined ? activeOrder.payable_amount : currentPayable,
      outstandingAmount: activeOrder.included_outstanding_amount !== undefined ? activeOrder.included_outstanding_amount : existingOutstanding,
      sessionCreated: false,
      status: 'SESSION_CREATED',
      message: 'Active valid Stripe Checkout Session reused',
    };
  }

  // If another distributed worker holds the claim: "Others wait/re-read the order"
  if (claimResult.waitRequired || (claimResult.inProgress && !claimResult.claimed)) {
    const maxWaitMs = 10000;
    const pollIntervalMs = 250;
    const startTime = Date.now();
    let resolvedSession: PaymentSessionResult | null = null;

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

      const refreshedOrder = await getTopupOrderById(currentOrder.id, env);
      if (refreshedOrder) {
        const refMeta = (refreshedOrder.metadata && typeof refreshedOrder.metadata === 'object') ? refreshedOrder.metadata : {};
        const refSessionId = refMeta.stripe_session_id || refMeta.sessionId;
        const refCheckoutUrl = refMeta.checkout_url;
        const refExpiresAt = refMeta.checkout_expires_at || refreshedOrder.expired_at;
        const refCancelled =
          Boolean(refMeta.checkout_cancelled) ||
          Boolean(refMeta.cancelled_at) ||
          refMeta.session_status === 'cancelled';

        if (refSessionId && !refCancelled) {
          let isExpired = false;
          if (refExpiresAt && new Date(refExpiresAt).getTime() <= Date.now()) {
            isExpired = true;
          }
          if (!isExpired) {
            resolvedSession = {
              sessionId: refSessionId,
              checkoutUrl:
                refCheckoutUrl ||
                `${baseUrl}/wallet/top-up?order_id=${refreshedOrder.id}&session_id=${refSessionId}&checkout=true`,
              paymentReference: refreshedOrder.payment_reference || `STRIPE_${refSessionId}`,
              paymentMethod: refreshedOrder.payment_method || 'card',
              orderId: refreshedOrder.id,
              amount: refreshedOrder.total_due || Number(refreshedOrder.top_up_amount) || totalDue,
              currency: refreshedOrder.currency,
              expiresAt: refExpiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              totalDue: refreshedOrder.total_due || Number(refreshedOrder.top_up_amount) || totalDue,
              payableAmount:
                refreshedOrder.payable_amount !== undefined
                  ? refreshedOrder.payable_amount
                  : currentPayable,
              outstandingAmount:
                refreshedOrder.included_outstanding_amount !== undefined
                  ? refreshedOrder.included_outstanding_amount
                  : existingOutstanding,
              sessionCreated: false,
              status: 'SESSION_CREATED',
              message: 'Active valid Stripe Checkout Session reused',
            };
            break;
          }
        }

        // If other worker finished without setting session (e.g. error released claim)
        if (!refMeta.checkout_in_progress) {
          break;
        }
      }
    }

    if (resolvedSession) {
      return resolvedSession;
    }

    // Re-attempt claim after waiting
    claimResult = await claimCheckoutSessionCreation(
      currentOrder.id,
      { claimId, timeoutSeconds: 30 },
      env
    );

    if (claimResult.alreadyHasSession && (claimResult.sessionId || claimResult.order)) {
      const activeOrder = claimResult.order || (await getTopupOrderById(currentOrder.id, env)) || currentOrder;
      const activeMeta = (activeOrder.metadata && typeof activeOrder.metadata === 'object') ? activeOrder.metadata : {};
      const activeSessionId = activeMeta.stripe_session_id || activeMeta.sessionId || claimResult.sessionId;
      const activeCheckoutUrl = activeMeta.checkout_url || claimResult.checkoutUrl;
      const activeExpiresAt = activeMeta.checkout_expires_at || activeOrder.expired_at || claimResult.expiresAt;

      return {
        sessionId: activeSessionId || '',
        checkoutUrl: activeCheckoutUrl || `${baseUrl}/wallet/top-up?order_id=${activeOrder.id}&session_id=${activeSessionId}&checkout=true`,
        paymentReference: activeOrder.payment_reference || `STRIPE_${activeSessionId}`,
        paymentMethod: activeOrder.payment_method || 'card',
        orderId: activeOrder.id,
        amount: activeOrder.total_due || Number(activeOrder.top_up_amount) || totalDue,
        currency: activeOrder.currency,
        expiresAt: activeExpiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        totalDue: activeOrder.total_due || Number(activeOrder.top_up_amount) || totalDue,
        payableAmount: activeOrder.payable_amount !== undefined ? activeOrder.payable_amount : currentPayable,
        outstandingAmount: activeOrder.included_outstanding_amount !== undefined ? activeOrder.included_outstanding_amount : existingOutstanding,
        sessionCreated: false,
        status: 'SESSION_CREATED',
        message: 'Active valid Stripe Checkout Session reused',
      };
    }
  }

  // Claim won by this request! The attempt number is strictly allocated by database lock.
  const attempt = claimResult.attempt || (Number(currentOrder.metadata?.checkout_attempt) || 0) + 1;

  let sessionId = `cs_egs_${crypto.randomBytes(16).toString('hex')}`;
  let checkoutUrl = `${baseUrl}/wallet/top-up?order_id=${currentOrder.id}&session_id=${sessionId}&checkout=true`;
  let paymentReference = `PAY_REF_${currentOrder.id.slice(0, 8).toUpperCase()}_${Date.now()}`;
  let paymentMethod = 'card';
  let expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // If Stripe API secret key is configured, create live Stripe Checkout Session with idempotency key
  if (stripe) {
    try {
      const formattedAmountCents = toCents(totalDue);
      const lineItemName =
        existingOutstanding > 0
          ? `Wallet Top-Up: ${currentOrder.currency} ${totalDue.toFixed(2)} (includes RM${existingOutstanding.toFixed(2)} outstanding)`
          : `Wallet Top-Up: ${currentOrder.currency} ${totalDue.toFixed(2)}`;

      const idempotencyKey = `stripe_cs_${currentOrder.id}_att_${attempt}_${formattedAmountCents}`;

      const stripeSession = await stripe.checkout.sessions.create(
        {
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: currentOrder.currency.toLowerCase(),
                product_data: {
                  name: lineItemName,
                  description: `EventGameStudio Wallet Top-Up for organization ${currentOrder.organization_id}`,
                },
                unit_amount: formattedAmountCents,
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          customer_email: customerEmail || undefined,
          success_url: `${baseUrl}/wallet/top-up?order_id=${currentOrder.id}&session_id={CHECKOUT_SESSION_ID}&status=success`,
          cancel_url: `${baseUrl}/wallet/top-up?order_id=${currentOrder.id}&status=cancelled`,
          metadata: {
            order_id: currentOrder.id,
            organization_id: currentOrder.organization_id,
            user_id: currentOrder.user_id || '',
            payable_amount: currentPayable.toFixed(2),
            outstanding_amount: existingOutstanding.toFixed(2),
            total_due: totalDue.toFixed(2),
            purpose: 'wallet_top_up',
            checkout_attempt: attempt.toString(),
          },
          payment_intent_data: {
            metadata: {
              order_id: currentOrder.id,
              organization_id: currentOrder.organization_id,
              user_id: currentOrder.user_id || '',
              payable_amount: currentPayable.toFixed(2),
              outstanding_amount: existingOutstanding.toFixed(2),
              total_due: totalDue.toFixed(2),
              purpose: 'wallet_top_up',
              checkout_attempt: attempt.toString(),
            },
          },
        },
        {
          idempotencyKey,
        }
      );

      sessionId = stripeSession.id;
      checkoutUrl = stripeSession.url || checkoutUrl;
      paymentReference = (stripeSession.payment_intent as string) || `STRIPE_${stripeSession.id}`;
      paymentMethod = 'card';
      if (stripeSession.expires_at) {
        expiresAt = new Date(stripeSession.expires_at * 1000).toISOString();
      }
    } catch (stripeErr: any) {
      console.error('Stripe Checkout Session creation error:', stripeErr);
      try {
        await releaseCheckoutSessionClaim(currentOrder.id, claimId, env);
      } catch (releaseErr) {
        console.warn('Failed to release checkout session claim on error:', releaseErr);
      }
      throw new Error(`Stripe Checkout Session initialization failed: ${stripeErr.message}`);
    }
  }

  // Record PAYMENT_CREATED audit event
  await recordWalletAuditEvent(
    {
      organizationId: currentOrder.organization_id,
      eventType: 'PAYMENT_CREATED',
      orderId: currentOrder.id,
      paymentReference,
      amount: totalDue,
      currency: currentOrder.currency,
      metadata: {
        sessionId,
        expiresAt,
        paymentMethod,
        provider: stripe ? 'stripe' : 'payment_gateway',
        payableAmount: currentPayable,
        outstandingAmount: existingOutstanding,
        totalDue,
        checkoutAttempt: attempt,
      },
    },
    env
  );

  // Attach session info and expiration window to the top-up order record
  try {
    await attachCheckoutSessionToTopupOrder(
      currentOrder.id,
      {
        sessionId,
        checkoutUrl,
        paymentReference,
        paymentMethod,
        expiresAt,
        totalDue,
        payableAmount: currentPayable,
        includedOutstandingAmount: existingOutstanding,
        extraMetadata: {
          checkout_attempt: attempt,
          checkout_in_progress: false,
          checkout_claim_id: null,
          checkout_cancelled: false,
          previous_sessions: previousSessions,
        },
      },
      env
    );
  } catch (attachErr: any) {
    console.error(`[Payment Session] Could not attach checkout session to order ${currentOrder.id}:`, attachErr);
    try {
      await releaseCheckoutSessionClaim(currentOrder.id, claimId, env);
    } catch {}
    if (isProductionEnvironment(env) || isSupabaseConfigured(env)) {
      throw new Error(`Financial session attachment failed: ${attachErr.message}`);
    }
  }

  return {
    sessionId,
    checkoutUrl,
    paymentReference,
    paymentMethod,
    orderId: currentOrder.id,
    amount: totalDue,
    currency: currentOrder.currency,
    expiresAt,
    totalDue,
    payableAmount: currentPayable,
    outstandingAmount: existingOutstanding,
    sessionCreated: true,
    status: 'SESSION_CREATED',
    message: 'Stripe Checkout Session created successfully',
  };
}

/**
 * Helper to format top-up currency amount for human-readable notifications.
 * e.g., 1000 -> RM1,000 | 1400.5 -> RM1,400.50
 */
export function formatTopupAmountNotification(amount: number, currency: string = 'MYR'): string {
  const curr = currency.toUpperCase() === 'MYR' ? 'RM' : `${currency.toUpperCase()} `;
  const num = Number(amount);
  const formatted = num % 1 === 0
    ? num.toLocaleString('en-US')
    : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${curr}${formatted}`;
}

/**
 * Ensures that the "Top Up Successful" in-app notification exists exactly once.
 * 
 * CORE INVARIANTS & ERROR RESILIENCE:
 * 1. Idempotency Key: Uses deterministic `payment_success_topup_${order.id}` deduplication key.
 * 2. Recipient: Targets order.user_id.
 * 3. Existence Check: Checks database first before creating.
 * 4. Self-Healing / Repair: If order is already PAID but notification is missing (e.g., initial
 *    request timeout or transient failure), it creates the missing notification.
 * 5. Failure Truthfulness: Returns `notificationCreated: false` if creation failed and the
 *    notification does NOT exist in DB. Does not hide failures.
 * 6. Never Re-credits Wallet: Operates strictly on notifications; never touches balances.
 */
export async function ensureTopUpSuccessfulNotification(
  order: TopupOrderRecord,
  promoCreditAmount?: number,
  env?: Record<string, any>
): Promise<{
  notificationCreated: boolean;
  isExisting: boolean;
  notification?: NotificationRecord | null;
  error?: any;
}> {
  const recipientUserId = order.user_id;
  const baseKey = `payment_success_topup_${order.id}`;
  const userDeduplicationKey = `${baseKey}_${recipientUserId}`;

  if (!recipientUserId) {
    console.warn(`[ensureTopUpSuccessfulNotification] Missing user_id on order ${order.id}`);
    return { notificationCreated: false, isExisting: false, notification: null };
  }

  // Helper to query either format of deduplication key
  const findExisting = async (): Promise<NotificationRecord | null> => {
    const byUserKey = await getNotificationByDeduplicationKey(recipientUserId, userDeduplicationKey, env);
    if (byUserKey) return byUserKey;
    return getNotificationByDeduplicationKey(recipientUserId, baseKey, env);
  };

  // 1. Fast idempotency check: check if notification already exists in database
  try {
    const existing = await findExisting();
    if (existing) {
      return {
        notificationCreated: true,
        isExisting: true,
        notification: existing,
      };
    }
  } catch (checkErr) {
    console.warn(`[ensureTopUpSuccessfulNotification] Error checking existing notification for order ${order.id}:`, checkErr);
  }

  // 2. Notification does not exist yet; dispatch it
  const amountStr = formatTopupAmountNotification(order.top_up_amount, order.currency);
  const effectivePromoCredit =
    promoCreditAmount !== undefined
      ? promoCreditAmount
      : order.expected_credit_amount !== undefined
      ? order.expected_credit_amount
      : 0;

  const notifEvent: PaymentSuccessEvent = {
    eventType: 'PAYMENT_SUCCESS',
    organizationId: order.organization_id,
    recipientUserId: order.user_id,
    referenceId: `topup_${order.id}`,
    amount: order.top_up_amount,
    currency: order.currency || 'MYR',
    subject: `Wallet Top-Up (${order.id.slice(0, 8).toUpperCase()})`,
    paymentType: 'TOPUP',
    customTitle: 'Top Up Successful',
    customMessage: `Your wallet top-up of ${amountStr} has been completed successfully.`,
    metadata: {
      order_id: order.id,
      top_up_amount: order.top_up_amount,
      promo_credit: effectivePromoCredit,
    },
  };

  try {
    const dispatched = await dispatchNotificationEvent(notifEvent, env);
    if (Array.isArray(dispatched) && dispatched.length > 0) {
      return {
        notificationCreated: true,
        isExisting: false,
        notification: dispatched[0],
      };
    }

    // Double-check DB in case of concurrent insert or adapter race
    const confirmed = await findExisting();
    if (confirmed) {
      return {
        notificationCreated: true,
        isExisting: Boolean((confirmed as any).is_inserted === false),
        notification: confirmed,
      };
    }

    // Dispatch finished without error, but no notification record was found
    console.error(`[ensureTopUpSuccessfulNotification] Notification dispatch returned no records and notification does not exist in DB for order ${order.id}`);
    return {
      notificationCreated: false,
      isExisting: false,
      notification: null,
    };
  } catch (err: any) {
    console.error(`[ensureTopUpSuccessfulNotification] Exception dispatching Top Up Successful notification for order ${order.id}:`, err);
    // Double-check if DB insert succeeded despite secondary adapter failure
    try {
      const confirmed = await findExisting();
      if (confirmed) {
        return {
          notificationCreated: true,
          isExisting: true,
          notification: confirmed,
        };
      }
    } catch {}

    return {
      notificationCreated: false,
      isExisting: false,
      notification: null,
      error: err,
    };
  }
}

export interface FinalizeWalletTopUpOptions {
  stripeSession?: Stripe.Checkout.Session | any;
  sessionId?: string;
  paymentReference?: string;
  paymentMethod?: string;
  webhookPayload?: any;
  webhookEventId?: string;
  isManualReconciliation?: boolean;
  reconciledBy?: string;
  reconciliationReason?: string;
  isSimulation?: boolean;
  reason?: string;
  metadata?: Record<string, any>;
  origin?: string;
}

export interface FinalizeWalletTopUpResult {
  success: boolean;
  status: TopupOrderStatus | string;
  order: TopupOrderRecord;
  alreadyProcessed: boolean;
  isDuplicate?: boolean;
  wallet?: WalletBalanceSummary;
  ledgerResult?: {
    topupTransaction?: WalletTransactionRecord;
    promoCreditTransaction?: WalletTransactionRecord | null;
    wallet: WalletBalanceSummary;
  };
  notificationCreated?: boolean;
  paymentReference?: string;
  paymentMethod?: string;
  amount?: number;
  currency?: string;
  isPending?: boolean;
  message?: string;
}

/**
 * Authoritative, idempotent server-side wallet top-up finalization function.
 *
 * All execution paths that discover or confirm a Stripe payment has succeeded MUST
 * call this function:
 * 1. Normal payment confirmation (return from Checkout)
 * 2. Retry after timeout / Check Payment button
 * 3. Payment status polling
 * 4. Webhook reconciliation
 * 5. Manual / admin developer reconciliation
 *
 * Invariant:
 * ONE successful Stripe top-up
 * = ONE PAID wallet transaction
 * = ONE wallet credit
 * = ONE "Top Up Successful" notification
 */
export async function finalizeWalletTopUp(
  orderOrId: TopupOrderRecord | string,
  options?: FinalizeWalletTopUpOptions,
  env?: Record<string, any>
): Promise<FinalizeWalletTopUpResult> {
  // 1. Load the wallet top-up transaction/order
  let order: TopupOrderRecord | null = null;
  if (typeof orderOrId === 'string') {
    const rawId = orderOrId.trim();
    order = await getTopupOrderById(rawId, env);
    if (!order) {
      order = await findTopupOrderByReference(rawId, env);
    }
    if (!order && rawId.startsWith('cs_') && !rawId.startsWith('cs_egs_')) {
      const stripe = getStripeClient(env);
      if (stripe) {
        try {
          const stripeSession = await stripe.checkout.sessions.retrieve(rawId);
          const trustedOrderId = stripeSession.metadata?.order_id || stripeSession.metadata?.orderId;
          if (trustedOrderId) {
            order = await getTopupOrderById(trustedOrderId, env);
          }
        } catch (err: any) {
          console.warn('[finalizeWalletTopUp] Failed to retrieve Stripe session by ID:', err?.message);
        }
      }
    }
  } else {
    order = orderOrId;
  }

  if (!order) {
    const err: any = new Error(`Top-up order not found: ${typeof orderOrId === 'string' ? orderOrId : 'unknown'}`);
    err.status = 404;
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }

  // 2. IMPORTANT IDEMPOTENCY & REPAIR: If the transaction is already PAID:
  // - DO NOT credit the wallet again (zero duplicate credit).
  // - DO NOT create duplicate wallet transactions.
  // - Check whether the "Top Up Successful" notification exists in DB.
  // - If missing (e.g. timeout on initial confirmation, or transient DB error), REPAIR it!
  // - Return the existing / repaired successful state.
  if (order.status === 'PAID') {
    const currentWallet = await getWalletBalance(order.organization_id, env);
    const notifStatus = await ensureTopUpSuccessfulNotification(
      order,
      order.expected_credit_amount,
      env
    );
    return {
      success: true,
      status: 'PAID',
      order,
      alreadyProcessed: true,
      isDuplicate: true,
      wallet: currentWallet,
      notificationCreated: notifStatus.notificationCreated,
      amount: order.top_up_amount,
      currency: order.currency,
      paymentReference: order.payment_reference || undefined,
      paymentMethod: order.payment_method || undefined,
      message: notifStatus.isExisting
        ? 'Top-up order is already marked as PAID and credited (idempotent replay, zero duplicate credit)'
        : notifStatus.notificationCreated
        ? 'Top-up order was already marked as PAID; repaired missing Top Up Successful notification.'
        : 'Top-up order is already marked as PAID (notification could not be created).',
    };
  }

  // Reject terminal non-PAID states (unless manual reconciliation explicitly authorizes)
  if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(order.status) && !options?.isManualReconciliation) {
    const err: any = new Error(`Cannot finalize top-up order in terminal status '${order.status}'`);
    err.status = 409;
    err.code = 'INVALID_STATE_TRANSITION';
    throw err;
  }

  const effectiveOrderAmount =
    order.total_due !== undefined && order.total_due > 0
      ? order.total_due
      : order.metadata?.total_due !== undefined && Number(order.metadata.total_due) > 0
      ? Number(order.metadata.total_due)
      : order.top_up_amount;
  const expectedCents = toCents(effectiveOrderAmount);

  // 3. Verify Stripe payment/checkout/payment intent status, amount, and currency
  let resolvedPaymentReference = options?.paymentReference || order.payment_reference;
  let resolvedPaymentMethod = options?.paymentMethod || order.payment_method || 'card';
  let syncSource = 'finalize_wallet_topup';

  // Case A: Webhook Payload provided
  if (options?.webhookPayload) {
    const dataObject = options.webhookPayload;
    syncSource = 'webhook';

    // Verify amount
    let rawAmountValue =
      dataObject.amount_total !== undefined
        ? Number(dataObject.amount_total)
        : dataObject.amount_received !== undefined
        ? Number(dataObject.amount_received)
        : dataObject.amount !== undefined
        ? Number(dataObject.amount)
        : undefined;

    let receivedAmount: number | undefined = undefined;
    if (rawAmountValue !== undefined) {
      if (dataObject.amount_total !== undefined || dataObject.amount_received !== undefined) {
        receivedAmount = fromCents(rawAmountValue);
      } else if (Math.round(rawAmountValue) === expectedCents || Math.round(rawAmountValue) === toCents(order.top_up_amount)) {
        receivedAmount = fromCents(rawAmountValue);
      } else if (rawAmountValue === effectiveOrderAmount || rawAmountValue === order.top_up_amount) {
        receivedAmount = rawAmountValue;
      } else if (
        dataObject.object === 'checkout.session' ||
        dataObject.object === 'payment_intent' ||
        dataObject.object === 'charge'
      ) {
        receivedAmount = fromCents(rawAmountValue);
      } else {
        receivedAmount = rawAmountValue;
      }
    }

    if (receivedAmount !== undefined) {
      const receivedCents = toCents(receivedAmount);
      if (receivedCents !== expectedCents && receivedCents !== toCents(order.top_up_amount)) {
        console.warn(
          `[finalizeWalletTopUp] Rejected: Amount mismatch on order ${order.id}. Expected RM${effectiveOrderAmount.toFixed(2)}, received RM${receivedAmount.toFixed(2)}`
        );
        const err: any = new Error(
          `Payment amount mismatch: expected RM${effectiveOrderAmount.toFixed(2)}, received RM${receivedAmount.toFixed(2)}`
        );
        err.status = 422;
        err.code = 'AMOUNT_MISMATCH';
        throw err;
      }
    }

    // Verify currency
    const rawCurrency = dataObject.currency;
    if (!rawCurrency || typeof rawCurrency !== 'string') {
      const err: any = new Error('Payment webhook payload is missing valid currency');
      err.status = 422;
      err.code = 'MISSING_CURRENCY';
      throw err;
    }
    const receivedCurrency = rawCurrency.trim().toUpperCase();
    if (receivedCurrency !== order.currency.toUpperCase()) {
      console.warn(
        `[finalizeWalletTopUp] Rejected: Currency mismatch on order ${order.id}. Expected ${order.currency}, received ${receivedCurrency}`
      );
      const err: any = new Error(
        `Payment currency mismatch: expected ${order.currency}, received ${receivedCurrency}`
      );
      err.status = 422;
      err.code = 'CURRENCY_MISMATCH';
      throw err;
    }

    // Verify organization
    const receivedOrgId =
      dataObject.metadata?.organization_id ||
      dataObject.metadata?.organizationId ||
      dataObject.organization_id;
    if (receivedOrgId && receivedOrgId !== order.organization_id) {
      console.warn(
        `[finalizeWalletTopUp] Rejected: Organization mismatch on order ${order.id}. Expected ${order.organization_id}, received ${receivedOrgId}`
      );
      const err: any = new Error('Unauthorized: Organization mismatch on top-up order');
      err.status = 403;
      err.code = 'ORGANIZATION_MISMATCH';
      throw err;
    }

    resolvedPaymentReference =
      dataObject.payment_reference ||
      dataObject.payment_intent ||
      dataObject.id ||
      resolvedPaymentReference;
    resolvedPaymentMethod =
      dataObject.payment_method_types?.[0] || dataObject.payment_method || resolvedPaymentMethod;
  }
  // Case B: Developer Admin Manual Reconciliation
  else if (options?.isManualReconciliation) {
    syncSource = 'manual_reconciliation';
    if (!options.paymentReference || typeof options.paymentReference !== 'string' || options.paymentReference.trim().length === 0) {
      const err: any = new Error('Valid external payment reference is required for reconciliation');
      err.status = 400;
      err.code = 'PAYMENT_REFERENCE_REQUIRED';
      throw err;
    }
    if (!options.reconciliationReason || typeof options.reconciliationReason !== 'string' || options.reconciliationReason.trim().length < 5) {
      const err: any = new Error('Explicit reconciliation reason (minimum 5 characters) is required');
      err.status = 400;
      err.code = 'RECONCILIATION_REASON_REQUIRED';
      throw err;
    }
    resolvedPaymentReference = options.paymentReference.trim();
    resolvedPaymentMethod = options.paymentMethod || 'MANUAL_RECONCILIATION';
  }
  // Case C: Simulation / Sandbox Mode
  else if (options?.isSimulation || order.metadata?.simulated_status === 'PAID') {
    syncSource = 'simulation_paid';
    resolvedPaymentReference = resolvedPaymentReference || `SIM_${order.id.slice(0, 8)}`;
    resolvedPaymentMethod = options?.paymentMethod || 'simulated_card';
  }
  // Case D: Stripe Checkout Session / API verification (Normal, Polling, Retry, Confirm)
  else {
    const stripeCandidateId =
      options?.sessionId ||
      options?.stripeSession?.id ||
      order.metadata?.stripe_session_id ||
      order.metadata?.sessionId ||
      (typeof order.payment_reference === 'string' && order.payment_reference.startsWith('STRIPE_cs_')
        ? order.payment_reference.replace('STRIPE_', '')
        : typeof order.payment_reference === 'string' && order.payment_reference.startsWith('cs_')
        ? order.payment_reference
        : null);

    let stripeSession = options?.stripeSession;
    const stripe = getStripeClient(env);

    if (!stripeSession && stripe && stripeCandidateId && stripeCandidateId.startsWith('cs_') && !stripeCandidateId.startsWith('cs_egs_')) {
      try {
        stripeSession = await stripe.checkout.sessions.retrieve(stripeCandidateId.trim());
      } catch (stripeErr: any) {
        console.warn(`[finalizeWalletTopUp] Failed to retrieve Stripe session ${stripeCandidateId}:`, stripeErr?.message);
      }
    }

    if (stripeSession) {
      // 1. Verify Stripe payment status
      const isStripePaid =
        stripeSession.payment_status === 'paid' ||
        (stripeSession.status === 'complete' && stripeSession.payment_status === 'paid');

      if (!isStripePaid) {
        const isStripeExpired =
          stripeSession.status === 'expired' ||
          (typeof stripeSession.expires_at === 'number' && stripeSession.expires_at * 1000 <= Date.now());

        if (isStripeExpired && order.status === 'PENDING') {
          try {
            const expireResult = await processTopupOrderStatus(
              {
                orderId: order.id,
                newStatus: 'EXPIRED',
                reason: 'Stripe Checkout Session expired',
                metadata: {
                  ...(order.metadata || {}),
                  stripe_session_id: stripeCandidateId,
                  expired_at: new Date().toISOString(),
                  sync_source: 'stripe_checkout_expired',
                },
                isTrustedSettlement: false,
              },
              env
            );
            return {
              success: false,
              status: 'EXPIRED',
              order: expireResult.order,
              alreadyProcessed: false,
              isPending: false,
              message: 'Stripe checkout session has expired',
            };
          } catch (expireErr) {
            console.warn('[finalizeWalletTopUp] Failed to mark order expired:', expireErr);
          }
        }

        // If Stripe payment is still pending/unpaid: DO NOT credit wallet, DO NOT create notification
        return {
          success: false,
          status: order.status,
          order,
          alreadyProcessed: false,
          isPending: stripeSession.status === 'open' || stripeSession.payment_status === 'unpaid',
          message: `Stripe payment has not completed yet (status: ${stripeSession.status}, payment_status: ${stripeSession.payment_status})`,
        };
      }

      // 2. Verify Amount
      const stripeCents = stripeSession.amount_total;
      if (typeof stripeCents === 'number') {
        if (Math.round(stripeCents) !== expectedCents && Math.round(stripeCents) !== toCents(order.top_up_amount)) {
          console.warn(
            `[finalizeWalletTopUp] Stripe session amount mismatch for order ${order.id}: expected RM${effectiveOrderAmount.toFixed(2)} (${expectedCents} cents), got ${stripeCents} cents`
          );
          const err: any = new Error(
            `Payment amount mismatch: expected RM${effectiveOrderAmount.toFixed(2)}, received RM${fromCents(stripeCents).toFixed(2)}`
          );
          err.status = 422;
          err.code = 'AMOUNT_MISMATCH';
          throw err;
        }
      }

      // 3. Verify Currency
      const stripeCurrency = stripeSession.currency ? String(stripeSession.currency).trim().toUpperCase() : null;
      if (stripeCurrency && stripeCurrency !== order.currency.toUpperCase()) {
        console.warn(
          `[finalizeWalletTopUp] Stripe session currency mismatch for order ${order.id}: expected ${order.currency}, got ${stripeCurrency}`
        );
        const err: any = new Error(
          `Payment currency mismatch: expected ${order.currency}, received ${stripeCurrency}`
        );
        err.status = 422;
        err.code = 'CURRENCY_MISMATCH';
        throw err;
      }

      // 4. Verify Organization
      const stripeOrgId = stripeSession.metadata?.organization_id || stripeSession.metadata?.organizationId;
      if (stripeOrgId && stripeOrgId !== order.organization_id) {
        console.warn(
          `[finalizeWalletTopUp] Stripe session organization mismatch for order ${order.id}: expected ${order.organization_id}, got ${stripeOrgId}`
        );
        const err: any = new Error('Unauthorized: Organization mismatch on top-up order');
        err.status = 403;
        err.code = 'ORGANIZATION_MISMATCH';
        throw err;
      }

      const paymentIntentId =
        typeof stripeSession.payment_intent === 'string'
          ? stripeSession.payment_intent
          : stripeSession.payment_intent?.id || `STRIPE_${stripeSession.id}`;
      resolvedPaymentReference = paymentIntentId;
      resolvedPaymentMethod = stripeSession.payment_method_types?.[0] || 'card';
      syncSource = 'stripe_api_reconciliation';
    } else {
      // If no live Stripe session found: check if simulated
      if (!isProductionEnvironment(env) && (order.metadata?.simulated_status === 'PAID' || options?.isSimulation)) {
        syncSource = 'simulation_paid';
        resolvedPaymentReference = resolvedPaymentReference || `SIM_${order.id.slice(0, 8)}`;
        resolvedPaymentMethod = 'simulated_card';
      } else if (!stripeCandidateId && !resolvedPaymentReference) {
        return {
          success: false,
          status: order.status,
          order,
          alreadyProcessed: false,
          isPending: true,
          message: 'No active Stripe payment session found to finalize',
        };
      }
    }
  }

  // 4. Atomically/idempotently transition the transaction to PAID via processTopupOrderStatus
  const now = new Date().toISOString();
  const settleResult = await processTopupOrderStatus(
    {
      orderId: order.id,
      newStatus: 'PAID',
      paymentReference: resolvedPaymentReference || `PAY_REF_${order.id.slice(0, 8)}`,
      paymentMethod: resolvedPaymentMethod,
      processedBy: options?.reconciledBy || order.user_id,
      reason: options?.reason || (
        options?.isManualReconciliation
          ? `Manual Admin Reconciliation: ${options.reconciliationReason}`
          : 'Stripe payment finalized successfully'
      ),
      metadata: {
        ...(order.metadata || {}),
        paid_at: now,
        finalized_at: now,
        sync_source: syncSource,
        ...(options?.metadata || {}),
      },
      isTrustedSettlement: true,
    },
    env
  );

  const updatedOrder = settleResult.order;

  // 5. Ensure "Top Up Successful" in-app notification exists exactly once
  const notifStatus = await ensureTopUpSuccessfulNotification(
    updatedOrder,
    updatedOrder.expected_credit_amount,
    env
  );
  const notificationCreated = notifStatus.notificationCreated;

  return {
    success: true,
    status: 'PAID',
    order: updatedOrder,
    alreadyProcessed: settleResult.alreadyProcessed,
    isDuplicate: settleResult.alreadyProcessed,
    wallet: settleResult.wallet || settleResult.ledgerResult?.wallet,
    ledgerResult: settleResult.ledgerResult,
    notificationCreated,
    paymentReference: updatedOrder.payment_reference || resolvedPaymentReference,
    paymentMethod: updatedOrder.payment_method || resolvedPaymentMethod,
    amount: updatedOrder.top_up_amount,
    currency: updatedOrder.currency,
    message: settleResult.message || 'Top-up order successfully finalized as PAID',
  };
}

/**
 * Verifies and processes an incoming payment provider webhook.
 *
 * CRITICAL SECURITY & BUSINESS RULES:
 * 1. Verifies the provider signature (HMAC-SHA256).
 * 2. Retrieves the corresponding Top Up Order from database.
 * 3. Strictly validates amount, currency, and organization.
 * 4. Checks current order status.
 * 5. Processes PAID only once (Atomic & Idempotent).
 * 6. Creates wallet ledger entries (Separate Paid Balance + Top-up Credit).
 * 7. Marks the order as PAID.
 * 8. Returns the correct status result.
 */
export async function verifyAndProcessPaymentWebhook(
  params: WebhookVerificationParams
): Promise<WebhookProcessingResult> {
  const { rawBody, signature, headers, secretOverride, env } = params;

  // 1. Signature Verification
  const secret = getPaymentWebhookSecret(env, secretOverride);
  const signatureHeader =
    signature ||
    (headers?.['stripe-signature'] as string) ||
    (headers?.['x-signature'] as string) ||
    (headers?.['x-provider-signature'] as string) ||
    (headers?.['x-hub-signature-256'] as string);

  const verification = verifyWebhookSignature(rawBody, signatureHeader, secret);
  if (!verification.isValid) {
    const errorMsg = verification.error || 'Invalid webhook signature';
    const err: any = new Error(errorMsg);
    err.status = 400;
    err.code = 'INVALID_SIGNATURE';
    throw err;
  }

  // 2. Parse Payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    const err: any = new Error('Invalid JSON webhook payload');
    err.status = 400;
    err.code = 'INVALID_JSON';
    throw err;
  }

  // Extract Event Details (Support standard Stripe / EGS payment provider formats)
  const eventType = payload.type || payload.event || payload.status;
  if (!eventType || typeof eventType !== 'string') {
    const err: any = new Error('Top-up order webhook event type is missing from payload');
    err.status = 400;
    err.code = 'MISSING_EVENT_TYPE';
    throw err;
  }
  const dataObject = payload.data?.object || payload.data || payload;

  let orderId =
    dataObject.metadata?.order_id ||
    dataObject.metadata?.orderId ||
    dataObject.order_id ||
    dataObject.orderId;

  let order: TopupOrderRecord | null = null;
  if (orderId) {
    order = await getTopupOrderById(orderId, env);
  }

  // Fallback: look up by Stripe Session ID or Payment Intent ID if order not found by ID
  if (!order) {
    const candidateRef =
      dataObject.id ||
      (typeof dataObject.payment_intent === 'string' ? dataObject.payment_intent : dataObject.payment_intent?.id) ||
      dataObject.metadata?.sessionId ||
      dataObject.metadata?.stripe_session_id;

    if (candidateRef) {
      order = await findTopupOrderByReference(candidateRef, env);
      if (order) {
        orderId = order.id;
      }
    }
  }

  if (!orderId) {
    const err: any = new Error('Top-up order ID missing from webhook payload metadata');
    err.status = 400;
    err.code = 'MISSING_ORDER_ID';
    throw err;
  }

  // 3. Find corresponding Top Up Order from Server Database (if not resolved yet)
  if (!order) {
    order = await getTopupOrderById(orderId, env);
  }
  if (!order) {
    const err: any = new Error(`Top-up order not found: ${orderId}`);
    err.status = 404;
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }

  // 4. Verify Amount, Currency, and Organization
  // Extract amount: handle Stripe amount_total, amount_received, or amount (cents vs major units)
  let rawAmountValue =
    dataObject.amount_total !== undefined
      ? Number(dataObject.amount_total)
      : dataObject.amount_received !== undefined
      ? Number(dataObject.amount_received)
      : dataObject.amount !== undefined
      ? Number(dataObject.amount)
      : undefined;

  let receivedAmount: number | undefined = undefined;
  const effectiveOrderAmount =
    order.total_due !== undefined && order.total_due > 0
      ? order.total_due
      : order.metadata?.total_due !== undefined && Number(order.metadata.total_due) > 0
      ? Number(order.metadata.total_due)
      : order.top_up_amount;
  const expectedCents = toCents(effectiveOrderAmount);

  if (rawAmountValue !== undefined) {
    // If sent as cents (standard for Stripe checkout session/payment intent/charges)
    if (dataObject.amount_total !== undefined || dataObject.amount_received !== undefined) {
      receivedAmount = fromCents(rawAmountValue);
    } else if (Math.round(rawAmountValue) === expectedCents || Math.round(rawAmountValue) === toCents(order.top_up_amount)) {
      receivedAmount = fromCents(rawAmountValue);
    } else if (rawAmountValue === effectiveOrderAmount || rawAmountValue === order.top_up_amount) {
      receivedAmount = rawAmountValue;
    } else if (
      dataObject.object === 'checkout.session' ||
      dataObject.object === 'payment_intent' ||
      dataObject.object === 'charge'
    ) {
      receivedAmount = fromCents(rawAmountValue);
    } else {
      receivedAmount = rawAmountValue;
    }
  }

  if (receivedAmount !== undefined) {
    const receivedCents = toCents(receivedAmount);
    if (receivedCents !== expectedCents && receivedCents !== toCents(order.top_up_amount)) {
      console.warn(
        `[Payment Webhook] Rejected: Amount mismatch on order ${order.id}. Expected RM${effectiveOrderAmount.toFixed(2)} (${expectedCents} cents), received RM${receivedAmount.toFixed(2)} (${receivedCents} cents)`
      );
      const err: any = new Error(
        `Payment amount mismatch: expected RM${effectiveOrderAmount.toFixed(2)}, received RM${receivedAmount.toFixed(2)}`
      );
      err.status = 422;
      err.code = 'AMOUNT_MISMATCH';
      throw err;
    }
  }

  const rawCurrency = dataObject.currency;
  if (!rawCurrency || typeof rawCurrency !== 'string') {
    const err: any = new Error('Payment webhook payload is missing valid currency');
    err.status = 422;
    err.code = 'MISSING_CURRENCY';
    throw err;
  }
  const receivedCurrency = rawCurrency.trim().toUpperCase();
  if (receivedCurrency !== order.currency.toUpperCase()) {
    console.warn(
      `[Payment Webhook] Rejected: Currency mismatch on order ${order.id}. Expected ${order.currency}, received ${receivedCurrency}`
    );
    const err: any = new Error(
      `Payment currency mismatch: expected ${order.currency}, received ${receivedCurrency}`
    );
    err.status = 422;
    err.code = 'CURRENCY_MISMATCH';
    throw err;
  }

  const receivedOrgId =
    dataObject.metadata?.organization_id ||
    dataObject.metadata?.organizationId ||
    dataObject.organization_id;

  if (receivedOrgId && receivedOrgId !== order.organization_id) {
    console.warn(
      `[Payment Webhook] Rejected: Organization mismatch on order ${order.id}. Expected ${order.organization_id}, received ${receivedOrgId}`
    );
    const err: any = new Error('Unauthorized: Organization mismatch on top-up order');
    err.status = 403;
    err.code = 'ORGANIZATION_MISMATCH';
    throw err;
  }

  console.log(
    `[Payment Webhook] Verified: Order ${order.id} | Org: ${order.organization_id} | Amount: ${order.currency} ${order.top_up_amount.toFixed(2)} | Event: ${eventType}`
  );

  // 5. Determine Target Status from Webhook Event
  const paymentReference =
    dataObject.payment_reference ||
    dataObject.id ||
    dataObject.payment_intent ||
    `PAY_REF_${order.id.slice(0, 8)}`;
  const paymentMethod = dataObject.payment_method_types?.[0] || dataObject.payment_method || 'payment_gateway';

  const isSuccessEvent =
    eventType === 'payment.succeeded' ||
    eventType === 'checkout.session.completed' ||
    eventType === 'payment_intent.succeeded' ||
    eventType === 'charge.succeeded' ||
    eventType === 'PAID' ||
    eventType === 'SUCCESS';

  const isFailedEvent =
    eventType === 'payment.failed' ||
    eventType === 'payment_intent.payment_failed' ||
    eventType === 'charge.failed' ||
    eventType === 'FAILED';

  const isCancelledEvent =
    eventType === 'payment.cancelled' ||
    eventType === 'CANCELLED';

  const isExpiredEvent =
    eventType === 'checkout.session.expired' ||
    eventType === 'payment.expired' ||
    eventType === 'EXPIRED';

  let targetStatus: 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
  if (isSuccessEvent) {
    targetStatus = 'PAID';
  } else if (isFailedEvent) {
    targetStatus = 'FAILED';
  } else if (isCancelledEvent) {
    targetStatus = 'CANCELLED';
  } else if (isExpiredEvent) {
    targetStatus = 'EXPIRED';
  } else {
    const err: any = new Error(`Unrecognized or unsupported payment webhook event type: "${eventType}". Webhook rejected.`);
    err.status = 422;
    err.code = 'UNKNOWN_EVENT_TYPE';
    throw err;
  }

  // 6. Check Current Order Status & Idempotency
  // If order is ALREADY 'PAID'
  if (order.status === 'PAID') {
    if (targetStatus === 'PAID') {
      const finalizeResult = await finalizeWalletTopUp(
        order,
        {
          webhookPayload: dataObject,
          webhookEventId: payload.id,
          paymentReference,
          paymentMethod,
        },
        env
      );

      return {
        success: true,
        isDuplicate: true,
        alreadyProcessed: true,
        status: 'PAID',
        orderId: order.id,
        paymentReference: finalizeResult.paymentReference || order.payment_reference || undefined,
        paymentMethod: finalizeResult.paymentMethod || order.payment_method || undefined,
        amount: finalizeResult.amount ?? order.top_up_amount,
        currency: finalizeResult.currency ?? order.currency,
        order: finalizeResult.order || order,
        ledgerResult: finalizeResult.ledgerResult,
        message: 'Top-up order is already PAID (idempotent replay, zero duplicate credit)',
      };
    }
    const err: any = new Error(`Cannot change status of an already PAID top-up order (${order.id}) to ${targetStatus}`);
    err.status = 409;
    err.code = 'INVALID_STATE_TRANSITION';
    throw err;
  }

  // If order is in terminal non-PAID state
  if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(order.status)) {
    if (order.status === targetStatus) {
      return {
        success: true,
        isDuplicate: true,
        alreadyProcessed: true,
        status: order.status as any,
        orderId: order.id,
        order,
        message: `Top-up order is already ${order.status}`,
      };
    }
    const err: any = new Error(`Cannot change status of a ${order.status} top-up order (${order.id}) to ${targetStatus}`);
    err.status = 409;
    err.code = 'INVALID_STATE_TRANSITION';
    throw err;
  }

  // 7. Process Status Transition via Authoritative Engine
  if (targetStatus === 'PAID') {
    const finalizeResult = await finalizeWalletTopUp(
      order,
      {
        webhookPayload: dataObject,
        webhookEventId: payload.id,
        paymentReference,
        paymentMethod,
      },
      env
    );

    // Record WEBHOOK_RECEIVED audit event
    await recordWalletAuditEvent(
      {
        organizationId: order.organization_id,
        eventType: 'WEBHOOK_RECEIVED',
        orderId: order.id,
        paymentReference: finalizeResult.paymentReference || paymentReference,
        amount: receivedAmount ?? order.top_up_amount,
        currency: receivedCurrency,
        metadata: {
          webhook_event_id: payload.id,
          webhook_type: eventType,
          status: 'PAID',
          is_duplicate: Boolean(finalizeResult.alreadyProcessed),
        },
      },
      env
    );

    return {
      success: true,
      isDuplicate: Boolean(finalizeResult.alreadyProcessed),
      alreadyProcessed: Boolean(finalizeResult.alreadyProcessed),
      status: 'PAID',
      orderId: finalizeResult.order.id,
      paymentReference: finalizeResult.paymentReference || undefined,
      paymentMethod: finalizeResult.paymentMethod || undefined,
      amount: finalizeResult.amount ?? finalizeResult.order.top_up_amount,
      currency: finalizeResult.currency ?? finalizeResult.order.currency,
      order: finalizeResult.order,
      ledgerResult: finalizeResult.ledgerResult,
      message: finalizeResult.message || 'Order successfully marked as PAID',
    };
  }

  // For non-PAID status transitions (FAILED, EXPIRED, CANCELLED):
  const result = await processTopupOrderStatus(
    {
      orderId: order.id,
      newStatus: targetStatus,
      paymentReference,
      paymentMethod,
      reason: `Verified ${eventType} webhook`,
      metadata: {
        webhook_event_id: payload.id,
        webhook_type: eventType,
        provider: 'payment_provider',
        processed_at: new Date().toISOString(),
      },
      isTrustedSettlement: true,
    },
    env
  );

  // Record WEBHOOK_RECEIVED audit event
  await recordWalletAuditEvent(
    {
      organizationId: order.organization_id,
      eventType: 'WEBHOOK_RECEIVED',
      orderId: order.id,
      paymentReference,
      amount: receivedAmount ?? order.top_up_amount,
      currency: receivedCurrency,
      metadata: {
        webhook_event_id: payload.id,
        webhook_type: eventType,
        status: targetStatus,
        is_duplicate: Boolean(result.alreadyProcessed),
      },
    },
    env
  );

  return {
    success: true,
    isDuplicate: Boolean(result.alreadyProcessed),
    alreadyProcessed: Boolean(result.alreadyProcessed),
    status: result.order.status as any,
    orderId: result.order.id,
    paymentReference: result.order.payment_reference || undefined,
    paymentMethod: result.order.payment_method || undefined,
    amount: result.order.top_up_amount,
    currency: result.order.currency,
    order: result.order,
    ledgerResult: result.ledgerResult,
    message: result.message || `Order successfully marked as ${targetStatus}`,
  };
}

/**
 * Synchronize expiration and terminal state for a top-up order.
 *
 * SPECIFICATION & CRITICAL REQUIREMENTS:
 * - If the order exists and is pending, return its current status.
 * - If the order has expired, return EXPIRED.
 * - If Stripe Checkout has expired, synchronize the order to EXPIRED.
 * - Do not return 404 Top-up order not found merely because the Stripe Checkout Session expired.
 * - Only return 404 when the database order genuinely does not exist.
 */
export async function syncTopupOrderExpiration(
  orderOrId: TopupOrderRecord | string,
  options?: { sessionId?: string; status?: string },
  env?: Record<string, any>
): Promise<TopupOrderRecord> {
  let order: TopupOrderRecord | null = null;
  if (typeof orderOrId === 'string') {
    order = await getTopupOrderById(orderOrId, env);
  } else {
    order = orderOrId;
  }

  if (!order) {
    throw new Error(`Top-up order not found: ${typeof orderOrId === 'string' ? orderOrId : 'unknown'}`);
  }

  // 1. Terminal states (PAID, EXPIRED, CANCELLED, FAILED) are permanent and never transition again
  if (['PAID', 'EXPIRED', 'CANCELLED', 'FAILED'].includes(order.status)) {
    if (order.status === 'PAID') {
      // Reconcile / ensure Top Up Successful notification exists (idempotent repair for timeout recovery)
      try {
        await ensureTopUpSuccessfulNotification(order, order.expected_credit_amount, env);
      } catch (notifErr) {
        console.warn(`[Topup Sync] Failed to ensure notification on PAID order ${order.id}:`, notifErr);
      }
    }
    return order;
  }

  // Defensive: only process PENDING orders
  if (order.status !== 'PENDING') {
    return order;
  }

  const now = Date.now();

  // 2. Client indicated cancellation via return URL (e.g. status=cancelled)
  if (options?.status === 'cancelled') {
    try {
      const cancelResult = await processTopupOrderStatus(
        {
          orderId: order.id,
          newStatus: 'CANCELLED',
          reason: 'Checkout cancelled by user',
          metadata: {
            cancelled_at: new Date(now).toISOString(),
            synchronized_at: new Date(now).toISOString(),
            sync_source: 'client_cancel_return',
          },
          isTrustedSettlement: false,
        },
        env
      );
      return cancelResult.order;
    } catch (err) {
      console.warn(`[Topup Sync] Failed to transition order ${order.id} to CANCELLED:`, err);
      return {
        ...order,
        status: 'CANCELLED',
        metadata: {
          ...(order.metadata || {}),
          cancelled_at: new Date(now).toISOString(),
          sync_source: 'client_cancel_fallback',
        },
      };
    }
  }

  // 3. Check if order expiration timestamp has elapsed
  let isTimestampExpired = false;
  const expiredAtTime = order.expired_at ? new Date(order.expired_at).getTime() : NaN;
  const checkoutExpiresTime = order.metadata?.checkout_expires_at
    ? new Date(order.metadata.checkout_expires_at).getTime()
    : NaN;
  const metaExpiresTime = order.metadata?.expiresAt
    ? new Date(order.metadata.expiresAt).getTime()
    : NaN;
  const createdAtTime = order.created_at ? new Date(order.created_at).getTime() : NaN;

  if (!isNaN(expiredAtTime) && expiredAtTime <= now) {
    isTimestampExpired = true;
  } else if (!isNaN(checkoutExpiresTime) && checkoutExpiresTime <= now) {
    isTimestampExpired = true;
  } else if (!isNaN(metaExpiresTime) && metaExpiresTime <= now) {
    isTimestampExpired = true;
  } else if (!isNaN(createdAtTime) && now - createdAtTime >= 24 * 60 * 60 * 1000) {
    // Standard 24h fallback payment expiration
    isTimestampExpired = true;
  }

  if (isTimestampExpired) {
    try {
      const expireResult = await processTopupOrderStatus(
        {
          orderId: order.id,
          newStatus: 'EXPIRED',
          reason: 'Top-up order payment window elapsed',
          metadata: {
            ...(order.metadata || {}),
            expired_at: new Date(now).toISOString(),
            synchronized_at: new Date(now).toISOString(),
            sync_source: 'timestamp_expiry',
          },
          isTrustedSettlement: false,
        },
        env
      );
      return expireResult.order;
    } catch (expireErr) {
      console.error(`[Topup Sync] Error marking order ${order.id} expired:`, expireErr);
      return {
        ...order,
        status: 'EXPIRED',
        metadata: {
          ...(order.metadata || {}),
          expired_at: new Date(now).toISOString(),
          sync_source: 'timestamp_expiry_fallback',
        },
      };
    }
  }

  // 4. Check Stripe Checkout Session expiration
  const stripeCandidateId =
    options?.sessionId ||
    order.metadata?.stripe_session_id ||
    order.metadata?.sessionId ||
    (typeof order.payment_reference === 'string' && order.payment_reference.startsWith('STRIPE_cs_')
      ? order.payment_reference.replace('STRIPE_', '')
      : typeof order.payment_reference === 'string' && order.payment_reference.startsWith('cs_')
      ? order.payment_reference
      : null);

  if (stripeCandidateId && typeof stripeCandidateId === 'string') {
    const cleanSessionId = stripeCandidateId.trim();

    const stripe = getStripeClient(env);
    if (stripe && cleanSessionId.startsWith('cs_') && !cleanSessionId.startsWith('cs_egs_')) {
      try {
        const stripeSession = await stripe.checkout.sessions.retrieve(cleanSessionId);

        // A. Authoritative Stripe Payment Settlement Reconciliation
        const isStripePaid =
          stripeSession.payment_status === 'paid' ||
          (stripeSession.status === 'complete' && stripeSession.payment_status === 'paid');

        if (isStripePaid) {
          const expectedCents = toCents(order.top_up_amount);
          const stripeCents = stripeSession.amount_total;
          const stripeCurrency = stripeSession.currency ? String(stripeSession.currency).trim().toUpperCase() : null;
          const currencyMatches = Boolean(stripeCurrency && stripeCurrency === order.currency.toUpperCase());
          const amountMatches = typeof stripeCents === 'number' && Math.round(stripeCents) === expectedCents;
          const orgMatches = Boolean(
            stripeSession.metadata?.organization_id &&
            stripeSession.metadata.organization_id === order.organization_id
          );

          if (currencyMatches && amountMatches && orgMatches) {
            console.log(`[Topup Sync] Stripe Checkout session ${cleanSessionId} is PAID. Reconciling order ${order.id} to PAID via finalizeWalletTopUp.`);
            const paymentIntentId =
              typeof stripeSession.payment_intent === 'string'
                ? stripeSession.payment_intent
                : (stripeSession.payment_intent as any)?.id || null;

            const finalizeResult = await finalizeWalletTopUp(
              order.id,
              {
                stripeSession,
                sessionId: cleanSessionId,
                paymentReference: paymentIntentId || `STRIPE_${stripeSession.id}`,
                paymentMethod: stripeSession.payment_method_types?.[0] || 'card',
                reason: 'Authoritative Stripe Checkout Session completion verified via API reconciliation',
                metadata: {
                  stripe_session_id: cleanSessionId,
                  stripe_session_status: stripeSession.status,
                  stripe_payment_status: stripeSession.payment_status,
                  stripe_payment_intent: paymentIntentId,
                  sync_source: 'stripe_api_reconciliation',
                },
              },
              env
            );
            return finalizeResult.order;
          } else {
            console.warn(
              `[Topup Sync] Stripe session ${cleanSessionId} validation mismatch for order ${order.id}: currency=${currencyMatches}, amount=${amountMatches}, org=${orgMatches}`
            );
          }
        }

        // B. Expiration Check
        const isStripeExpired =
          stripeSession.status === 'expired' ||
          (typeof stripeSession.expires_at === 'number' && stripeSession.expires_at * 1000 <= now);

        if (isStripeExpired) {
          console.log(`[Topup Sync] Stripe Checkout session ${cleanSessionId} is expired. Synchronizing order ${order.id} to EXPIRED.`);
          const expireResult = await processTopupOrderStatus(
            {
              orderId: order.id,
              newStatus: 'EXPIRED',
              reason: 'Stripe Checkout Session expired',
              metadata: {
                ...(order.metadata || {}),
                stripe_session_id: cleanSessionId,
                stripe_session_status: stripeSession.status,
                stripe_expires_at: stripeSession.expires_at
                  ? new Date(stripeSession.expires_at * 1000).toISOString()
                  : undefined,
                expired_at: new Date(now).toISOString(),
                synchronized_at: new Date(now).toISOString(),
                sync_source: 'stripe_checkout_expired',
              },
              isTrustedSettlement: false,
            },
            env
          );
          return expireResult.order;
        }
      } catch (stripeErr: any) {
        // CRITICAL REQUIREMENT:
        // "Do not return 404 Top-up order not found merely because the Stripe Checkout Session expired."
        // "Only return 404 when the database order genuinely does not exist."
        // NEVER fail or return 404 here!
        console.warn(`[Topup Sync] Non-fatal Stripe session check warning for order ${order.id}:`, stripeErr?.message || stripeErr);
      }
    }
  }

  // 5. Check simulated status flags (for testing / sandboxing)
  if (order.metadata?.simulated_status === 'PAID' || options?.status === 'success') {
    // Only in non-production simulation or when explicitly marked
    if (order.metadata?.simulated_status === 'PAID') {
      try {
        const finalizeResult = await finalizeWalletTopUp(
          order.id,
          {
            isSimulation: true,
            paymentReference: order.payment_reference || `SIM_${order.id.slice(0, 8)}`,
            paymentMethod: 'simulated_card',
            reason: 'Simulation: test payment marked paid',
            metadata: {
              paid_at: new Date(now).toISOString(),
              sync_source: 'simulation_paid',
            },
          },
          env
        );
        return finalizeResult.order;
      } catch (simErr) {
        console.warn(`[Topup Sync] Simulation paid error for order ${order.id}:`, simErr);
      }
    }
  }

  if (order.metadata?.simulated_status === 'EXPIRED' || options?.status === 'expired') {
    try {
      const expireResult = await processTopupOrderStatus(
        {
          orderId: order.id,
          newStatus: 'EXPIRED',
          reason: 'Simulation: expired status set',
          metadata: {
            ...(order.metadata || {}),
            expired_at: new Date(now).toISOString(),
            synchronized_at: new Date(now).toISOString(),
            sync_source: 'simulation_expired',
          },
          isTrustedSettlement: false,
        },
        env
      );
      return expireResult.order;
    } catch (simErr) {
      console.warn(`[Topup Sync] Simulation expire error for order ${order.id}:`, simErr);
    }
  }

  if (order.metadata?.simulated_status === 'CANCELLED' || options?.status === 'cancelled') {
    try {
      const cancelResult = await processTopupOrderStatus(
        {
          orderId: order.id,
          newStatus: 'CANCELLED',
          reason: 'User or provider cancelled payment session',
          metadata: {
            ...(order.metadata || {}),
            cancelled_at: new Date(now).toISOString(),
            synchronized_at: new Date(now).toISOString(),
            sync_source: 'checkout_cancelled',
          },
          isTrustedSettlement: false,
        },
        env
      );
      return cancelResult.order;
    } catch (simErr) {
      console.warn(`[Topup Sync] Simulation cancel error for order ${order.id}:`, simErr);
    }
  }

  return order;
}

/**
 * Alias for syncTopupOrderExpiration to emphasize complete status synchronization
 * (including authoritative Stripe Checkout settlement and cancellation reconciliation).
 */
export const syncTopupOrderStatus = syncTopupOrderExpiration;

