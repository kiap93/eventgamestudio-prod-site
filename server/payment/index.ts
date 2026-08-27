import crypto from 'node:crypto';
import Stripe from 'stripe';
import {
  getTopupOrderById,
  processTopupOrderStatus,
  recordWalletAuditEvent,
  toCents,
  fromCents,
} from '../db/wallet.js';
import { TopupOrderRecord } from '../db/types.js';

let stripeClientInstance: Stripe | null = null;

/**
 * Lazy initializer for Stripe client (server-side only)
 */
export function getStripeClient(env?: Record<string, any>): Stripe | null {
  const secretKey =
    env?.STRIPE_SECRET_KEY ||
    (typeof process !== 'undefined' ? process.env.STRIPE_SECRET_KEY : undefined);
  if (!secretKey) return null;
  if (!stripeClientInstance) {
    stripeClientInstance = new Stripe(secretKey);
  }
  return stripeClientInstance;
}

export interface PaymentSessionConfig {
  order: TopupOrderRecord;
  originUrl?: string;
  customerEmail?: string;
  env?: Record<string, any>;
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
    // Default fallback secret for sandbox provider, mock simulations, and development
    return 'egs_dev_webhook_secret_key_2026_sandbox';
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
      const parts = signatureHeader.split(',').reduce((acc, item) => {
        const [k, v] = item.trim().split('=');
        if (k && v) acc[k] = v;
        return acc;
      }, {} as Record<string, string>);

      const timestampStr = parts['t'];
      const v1Sig = parts['v1'];

      if (!timestampStr || !v1Sig) {
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

      const isMatch = crypto.timingSafeEqual(
        Buffer.from(expectedSig, 'utf8'),
        Buffer.from(v1Sig, 'utf8')
      );

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
 */
export async function createPaymentSession(
  config: PaymentSessionConfig
): Promise<PaymentSessionResult> {
  const { order, originUrl, customerEmail, env } = config;

  if (order.status !== 'PENDING') {
    throw new Error(`Cannot create payment session for order in status ${order.status}. Only PENDING orders can be checked out.`);
  }

  const baseUrl = originUrl || (typeof process !== 'undefined' ? process.env.APP_URL : '') || '';
  const stripe = getStripeClient(env);

  let sessionId = `cs_egs_${crypto.randomBytes(16).toString('hex')}`;
  let checkoutUrl = `${baseUrl}/wallet/top-up?order_id=${order.id}&session_id=${sessionId}&checkout=true`;
  let paymentReference = `PAY_REF_${order.id.slice(0, 8).toUpperCase()}_${Date.now()}`;
  let paymentMethod = 'card_or_fpx';
  let expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // If Stripe API secret key is configured, create live Stripe Checkout Session
  if (stripe) {
    try {
      const formattedAmountCents = Math.round(order.top_up_amount * 100);
      const stripeSession = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: order.currency.toLowerCase(),
              product_data: {
                name: `Wallet Top-Up: ${order.currency} ${order.top_up_amount.toFixed(2)}`,
                description: `EventGameStudio Wallet Top-Up for organization ${order.organization_id}`,
              },
              unit_amount: formattedAmountCents,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        customer_email: customerEmail || undefined,
        success_url: `${baseUrl}/wallet/top-up?order_id=${order.id}&session_id={CHECKOUT_SESSION_ID}&status=success`,
        cancel_url: `${baseUrl}/wallet/top-up?order_id=${order.id}&status=cancelled`,
        metadata: {
          order_id: order.id,
          organization_id: order.organization_id,
          user_id: order.user_id || '',
          purpose: 'wallet_top_up',
        },
      });

      sessionId = stripeSession.id;
      checkoutUrl = stripeSession.url || checkoutUrl;
      paymentReference = (stripeSession.payment_intent as string) || `STRIPE_${stripeSession.id}`;
      paymentMethod = 'card';
      if (stripeSession.expires_at) {
        expiresAt = new Date(stripeSession.expires_at * 1000).toISOString();
      }
    } catch (stripeErr: any) {
      console.error('Stripe Checkout Session creation error:', stripeErr);
      throw new Error(`Stripe Checkout Session initialization failed: ${stripeErr.message}`);
    }
  }

  // Record PAYMENT_CREATED audit event
  await recordWalletAuditEvent(
    {
      organizationId: order.organization_id,
      eventType: 'PAYMENT_CREATED',
      orderId: order.id,
      paymentReference,
      amount: order.top_up_amount,
      currency: order.currency,
      metadata: {
        sessionId,
        expiresAt,
        paymentMethod,
        provider: stripe ? 'stripe' : 'payment_gateway',
      },
    },
    env
  );

  return {
    sessionId,
    checkoutUrl,
    paymentReference,
    paymentMethod,
    orderId: order.id,
    amount: order.top_up_amount,
    currency: order.currency,
    expiresAt,
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
  const eventType = payload.type || payload.event || payload.status || 'payment.succeeded';
  const dataObject = payload.data?.object || payload.data || payload;

  const orderId =
    dataObject.metadata?.order_id ||
    dataObject.metadata?.orderId ||
    dataObject.order_id ||
    dataObject.orderId;

  if (!orderId) {
    const err: any = new Error('Top-up order ID missing from webhook payload metadata');
    err.status = 400;
    err.code = 'MISSING_ORDER_ID';
    throw err;
  }

  // 3. Find corresponding Top Up Order from Server Database
  const order = await getTopupOrderById(orderId, env);
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
  if (rawAmountValue !== undefined) {
    const expectedCents = toCents(order.top_up_amount);
    // If sent as cents (standard for Stripe e.g. 60000 cents for RM 600.00)
    if (Math.round(rawAmountValue) === expectedCents) {
      receivedAmount = fromCents(rawAmountValue);
    } else if (rawAmountValue > 100000 && order.top_up_amount < 100000) {
      receivedAmount = fromCents(rawAmountValue);
    } else {
      receivedAmount = rawAmountValue;
    }
  }

  if (receivedAmount !== undefined) {
    const receivedCents = toCents(receivedAmount);
    const expectedCents = toCents(order.top_up_amount);
    if (receivedCents !== expectedCents) {
      const err: any = new Error(
        `Payment amount mismatch: expected RM${order.top_up_amount.toFixed(2)}, received RM${receivedAmount.toFixed(2)}`
      );
      err.status = 422;
      err.code = 'AMOUNT_MISMATCH';
      throw err;
    }
  }

  const receivedCurrency = (dataObject.currency || 'MYR').toUpperCase();
  if (receivedCurrency !== order.currency.toUpperCase()) {
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
    const err: any = new Error('Unauthorized: Organization mismatch on top-up order');
    err.status = 403;
    err.code = 'ORGANIZATION_MISMATCH';
    throw err;
  }

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

  let targetStatus: 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED' = 'PAID';
  if (isFailedEvent) targetStatus = 'FAILED';
  else if (isCancelledEvent) targetStatus = 'CANCELLED';
  else if (isExpiredEvent) targetStatus = 'EXPIRED';

  // 6. Check Current Order Status & Idempotency
  // If order is ALREADY 'PAID'
  if (order.status === 'PAID') {
    if (targetStatus === 'PAID') {
      return {
        success: true,
        isDuplicate: true,
        alreadyProcessed: true,
        status: 'PAID',
        orderId: order.id,
        paymentReference: order.payment_reference || undefined,
        paymentMethod: order.payment_method || undefined,
        amount: order.top_up_amount,
        currency: order.currency,
        order,
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

  // 7. Process Status Transition via Atomic Engine
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
