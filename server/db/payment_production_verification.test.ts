/**
 * Production Verification Test Suite: Payment Flow & Top-up Settlement Hardening
 * 
 * Verifies Constraints A through E:
 *   A. Webhook must be the only normal settlement path (no public/org API can do PENDING -> PAID).
 *   B. Duplicate webhook protection (Idempotency, DB uniqueness constraints on references, no double-credit).
 *   C. Amount must come from server-side order (browser/webhook cannot alter credited amount).
 *   D. Currency must be validated (order currency, Stripe currency, and wallet currency cannot mismatch).
 *   E. Failed / expired payments (terminal states cannot become PAID).
 */

import crypto from 'node:crypto';
import { getSupabaseServerClient } from '../supabase.js';
import {
  createTopupOrder,
  getTopupOrderById,
  processTopupOrderStatus,
  getWalletBalance,
  getWalletTransactions,
  toCents,
} from './wallet.js';
import {
  verifyAndProcessPaymentWebhook,
  generateWebhookSignature,
} from '../payment/index.js';

function assertEqual(actual: any, expected: any, description: string) {
  if (actual === expected) {
    console.log(`  [PASS] ${description} (Value: ${actual})`);
  } else {
    console.error(`  [FAIL] ${description} -> Expected "${expected}", got "${actual}"`);
    throw new Error(`Assertion failed: ${description}. Expected "${expected}", got "${actual}"`);
  }
}

async function ensureTestOrg(orgId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .maybeSingle();

  if (!existing) {
    await supabase.from('organizations').insert({
      id: orgId,
      name: `Test Org Prod Verification ${orgId.slice(0, 8)}`,
      slug: `test-org-prod-${orgId.slice(0, 8)}`,
    });
  }
}

async function runProductionVerificationTests() {
  console.log('========================================================================');
  console.log('STARTING PAYMENT FLOW PRODUCTION VERIFICATION (CONSTRAINTS A - E)');
  console.log('========================================================================');

  const testOrgId = crypto.randomUUID();
  const testUserId = crypto.randomUUID();
  await ensureTestOrg(testOrgId);

  const webhookSecret = 'whsec_prod_verification_test_secret_key_1234567890';
  process.env.PAYMENT_WEBHOOK_SECRET = webhookSecret;

  // =========================================================================
  // CONSTRAINT A: Webhook as Only Normal Settlement Path
  // =========================================================================
  console.log('\n--- [Constraint A] Webhook as Only Normal Settlement Path ---');

  const orderA = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 1400.00,
    currency: 'MYR',
    notes: 'Testing settlement gate security',
  });
  assertEqual(orderA.status, 'PENDING', 'Order A initial status is PENDING');

  // 1. Direct call to processTopupOrderStatus with newStatus: 'PAID' but WITHOUT isTrustedSettlement
  let untrustedSettlementBlocked = false;
  try {
    await processTopupOrderStatus({
      orderId: orderA.id,
      newStatus: 'PAID',
      isTrustedSettlement: false, // Untrusted attempt!
      paymentReference: 'fake_ref_123',
    });
  } catch (err: any) {
    untrustedSettlementBlocked = true;
    assertEqual(
      err.message.includes('requires trusted settlement verification'),
      true,
      'Untrusted settlement rejected with security error'
    );
  }
  assertEqual(untrustedSettlementBlocked, true, 'Untrusted direct PAID settlement strictly rejected');

  // Verify wallet balance is RM0.00
  const walletA = await getWalletBalance(testOrgId);
  assertEqual(walletA.paid_balance, 0.00, 'Wallet remains RM0.00 after blocked untrusted settlement');

  // =========================================================================
  // CONSTRAINT B: Duplicate Webhook Protection & Idempotency
  // =========================================================================
  console.log('\n--- [Constraint B] Duplicate Webhook Protection & Idempotency ---');

  const orderB = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 6000.00, // Qualifies for 5% = RM300 promo credit
    currency: 'MYR',
    notes: 'Testing idempotency on duplicate webhooks',
  });

  const stripeSessionIdB = `cs_test_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const stripePaymentIntentB = `pi_test_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  const webhookPayloadB = {
    id: `evt_test_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: stripeSessionIdB,
        payment_intent: stripePaymentIntentB,
        payment_status: 'paid',
        amount_total: toCents(6000.00),
        currency: 'myr',
        metadata: {
          order_id: orderB.id,
          organization_id: testOrgId,
        },
      },
    },
  };

  const rawBodyB = JSON.stringify(webhookPayloadB);
  const sigObjB = generateWebhookSignature(rawBodyB, webhookSecret);

  // Delivery 1: First arrival
  const delivery1 = await verifyAndProcessPaymentWebhook({
    rawBody: rawBodyB,
    signature: sigObjB.signatureHeader,
    env: { PAYMENT_WEBHOOK_SECRET: webhookSecret },
  });
  assertEqual(delivery1.success, true, 'First delivery succeeds');
  assertEqual(delivery1.isDuplicate, false, 'First delivery is not marked as duplicate');
  assertEqual(delivery1.status, 'PAID', 'First delivery transitions order to PAID');

  const walletPostDel1 = await getWalletBalance(testOrgId);
  assertEqual(walletPostDel1.paid_balance, 6000.00, 'Wallet credited with RM6,000.00');
  assertEqual(walletPostDel1.topup_credit, 300.00, 'Wallet credited with RM300.00 promotional credit');

  // Delivery 2: Retried / Duplicate delivery
  const delivery2 = await verifyAndProcessPaymentWebhook({
    rawBody: rawBodyB,
    signature: sigObjB.signatureHeader,
    env: { PAYMENT_WEBHOOK_SECRET: webhookSecret },
  });
  assertEqual(delivery2.success, true, 'Second delivery returns success (idempotent)');
  assertEqual(delivery2.isDuplicate, true, 'Second delivery is detected as duplicate');
  assertEqual(delivery2.status, 'PAID', 'Second delivery status remains PAID');

  const walletPostDel2 = await getWalletBalance(testOrgId);
  assertEqual(walletPostDel2.paid_balance, 6000.00, 'Paid balance NOT double-credited (remains RM6,000.00)');
  assertEqual(walletPostDel2.topup_credit, 300.00, 'Promo credit NOT double-credited (remains RM300.00)');

  // Delivery 3: Third retry
  const delivery3 = await verifyAndProcessPaymentWebhook({
    rawBody: rawBodyB,
    signature: sigObjB.signatureHeader,
    env: { PAYMENT_WEBHOOK_SECRET: webhookSecret },
  });
  assertEqual(delivery3.isDuplicate, true, 'Third delivery is detected as duplicate');

  const walletPostDel3 = await getWalletBalance(testOrgId);
  assertEqual(walletPostDel3.paid_balance, 6000.00, 'Paid balance untouched on third delivery');

  // Verify ledger transactions count: exactly 2 entries (TOPUP + TOPUP_CREDIT)
  const txnsB = await getWalletTransactions(testOrgId);
  const relevantTxns = txnsB.transactions.filter(
    (t) => t.reference_id?.startsWith(`topup_order_${orderB.id}`)
  );
  assertEqual(relevantTxns.length, 2, 'Exactly 2 ledger entries created for Order B (no duplicates)');

  // =========================================================================
  // CONSTRAINT C: Amount Must Come from Server-Side Order
  // =========================================================================
  console.log('\n--- [Constraint C] Amount Must Come from Server-Side Order ---');

  const orderC = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 10000.00, // Expected RM10,000.00 (qualifies for 7% = RM700 promo credit)
    currency: 'MYR',
    notes: 'Testing amount tamper resistance',
  });

  // Tampered Webhook 1: Client tries to report RM1.00 paid for an RM10,000.00 order
  const tamperedPayloadLow = {
    id: `evt_tamper_low_${Date.now()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_tamper_low_${Date.now()}`,
        payment_intent: `pi_tamper_low_${Date.now()}`,
        payment_status: 'paid',
        amount_total: 100, // Only RM1.00 (100 cents)!
        currency: 'myr',
        metadata: {
          order_id: orderC.id,
          organization_id: testOrgId,
        },
      },
    },
  };
  const rawBodyTamperLow = JSON.stringify(tamperedPayloadLow);
  const sigTamperLow = generateWebhookSignature(rawBodyTamperLow, webhookSecret);

  let tamperLowBlocked = false;
  try {
    await verifyAndProcessPaymentWebhook({
      rawBody: rawBodyTamperLow,
      signature: sigTamperLow.signatureHeader,
      env: { PAYMENT_WEBHOOK_SECRET: webhookSecret },
    });
  } catch (err: any) {
    tamperLowBlocked = true;
    assertEqual(err.code, 'AMOUNT_MISMATCH', 'Underpaid webhook rejected with AMOUNT_MISMATCH');
  }
  assertEqual(tamperLowBlocked, true, 'Underpaid webhook strictly rejected');

  // Verify order C remains PENDING
  const orderCAfterTamper = await getTopupOrderById(orderC.id);
  assertEqual(orderCAfterTamper?.status, 'PENDING', 'Order C remains PENDING after rejected underpayment');

  // Now legitimate payment with exact expected amount
  const legitPayloadC = {
    id: `evt_legit_${Date.now()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_legit_${Date.now()}`,
        payment_intent: `pi_legit_${Date.now()}`,
        payment_status: 'paid',
        amount_total: toCents(10000.00),
        currency: 'myr',
        metadata: {
          order_id: orderC.id,
          organization_id: testOrgId,
        },
      },
    },
  };
  const rawBodyLegitC = JSON.stringify(legitPayloadC);
  const sigLegitC = generateWebhookSignature(rawBodyLegitC, webhookSecret);

  const legitResultC = await verifyAndProcessPaymentWebhook({
    rawBody: rawBodyLegitC,
    signature: sigLegitC.signatureHeader,
    env: { PAYMENT_WEBHOOK_SECRET: webhookSecret },
  });
  assertEqual(legitResultC.success, true, 'Legitimate payment succeeds');
  assertEqual(legitResultC.status, 'PAID', 'Order C transitioned to PAID');

  const walletPostC = await getWalletBalance(testOrgId);
  assertEqual(walletPostC.paid_balance, 16000.00, 'Paid balance credited with exact server-side order amount RM10,000 (total: 16,000)');
  assertEqual(walletPostC.topup_credit, 1000.00, 'Promo credit credited with exact tier amount RM700 (total: 1,000)');

  // =========================================================================
  // CONSTRAINT D: Currency Must Be Validated
  // =========================================================================
  console.log('\n--- [Constraint D] Currency Validation ---');

  const orderD = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 1400.00,
    currency: 'MYR',
    notes: 'Testing currency validation',
  });

  // Mismatched Currency 1: Stripe payment in USD instead of MYR
  const mismatchedCurrencyPayload = {
    id: `evt_mismatch_curr_${Date.now()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_mismatch_curr_${Date.now()}`,
        payment_intent: `pi_mismatch_curr_${Date.now()}`,
        payment_status: 'paid',
        amount_total: toCents(1400.00),
        currency: 'usd', // USD instead of MYR!
        metadata: {
          order_id: orderD.id,
          organization_id: testOrgId,
        },
      },
    },
  };
  const rawBodyMismatchCurr = JSON.stringify(mismatchedCurrencyPayload);
  const sigMismatchCurr = generateWebhookSignature(rawBodyMismatchCurr, webhookSecret);

  let mismatchCurrBlocked = false;
  try {
    await verifyAndProcessPaymentWebhook({
      rawBody: rawBodyMismatchCurr,
      signature: sigMismatchCurr.signatureHeader,
      env: { PAYMENT_WEBHOOK_SECRET: webhookSecret },
    });
  } catch (err: any) {
    mismatchCurrBlocked = true;
    assertEqual(err.code, 'CURRENCY_MISMATCH', 'Currency mismatch rejected with CURRENCY_MISMATCH');
  }
  assertEqual(mismatchCurrBlocked, true, 'Mismatched currency USD vs MYR strictly rejected');

  // Mismatched Currency 2: Missing currency
  const missingCurrencyPayload = {
    id: `evt_missing_curr_${Date.now()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_missing_curr_${Date.now()}`,
        payment_intent: `pi_missing_curr_${Date.now()}`,
        payment_status: 'paid',
        amount_total: toCents(1400.00),
        metadata: {
          order_id: orderD.id,
          organization_id: testOrgId,
        },
      },
    },
  };
  const rawBodyMissingCurr = JSON.stringify(missingCurrencyPayload);
  const sigMissingCurr = generateWebhookSignature(rawBodyMissingCurr, webhookSecret);

  let missingCurrBlocked = false;
  try {
    await verifyAndProcessPaymentWebhook({
      rawBody: rawBodyMissingCurr,
      signature: sigMissingCurr.signatureHeader,
      env: { PAYMENT_WEBHOOK_SECRET: webhookSecret },
    });
  } catch (err: any) {
    missingCurrBlocked = true;
    assertEqual(err.code, 'MISSING_CURRENCY', 'Missing currency rejected with MISSING_CURRENCY');
  }
  assertEqual(missingCurrBlocked, true, 'Webhook missing currency strictly rejected');

  // =========================================================================
  // CONSTRAINT E: Failed / Expired / Cancelled Terminal States
  // =========================================================================
  console.log('\n--- [Constraint E] Failed / Expired / Cancelled Terminal States ---');

  // 1. Order transitioned to EXPIRED
  const orderExpired = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 1400.00,
    currency: 'MYR',
    notes: 'Testing expired order protection',
  });
  await processTopupOrderStatus({
    orderId: orderExpired.id,
    newStatus: 'EXPIRED',
    reason: 'Checkout window timed out',
  });
  const fetchedExpired = await getTopupOrderById(orderExpired.id);
  assertEqual(fetchedExpired?.status, 'EXPIRED', 'Order successfully set to EXPIRED');

  // Late webhook arrives for EXPIRED order
  const expiredWebhookPayload = {
    id: `evt_late_expired_${Date.now()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_late_expired_${Date.now()}`,
        payment_intent: `pi_late_expired_${Date.now()}`,
        payment_status: 'paid',
        amount_total: toCents(1400.00),
        currency: 'myr',
        metadata: {
          order_id: orderExpired.id,
          organization_id: testOrgId,
        },
      },
    },
  };
  const rawBodyExpired = JSON.stringify(expiredWebhookPayload);
  const sigExpired = generateWebhookSignature(rawBodyExpired, webhookSecret);

  let expiredToPaidBlocked = false;
  try {
    await verifyAndProcessPaymentWebhook({
      rawBody: rawBodyExpired,
      signature: sigExpired.signatureHeader,
      env: { PAYMENT_WEBHOOK_SECRET: webhookSecret },
    });
  } catch (err: any) {
    expiredToPaidBlocked = true;
    assertEqual(err.code, 'INVALID_STATE_TRANSITION', 'Late webhook for EXPIRED order rejected with INVALID_STATE_TRANSITION');
  }
  assertEqual(expiredToPaidBlocked, true, 'EXPIRED -> PAID transition strictly forbidden');

  // 2. Order transitioned to CANCELLED
  const orderCancelled = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 2000.00,
    currency: 'MYR',
    notes: 'Testing cancelled order protection',
  });
  await processTopupOrderStatus({
    orderId: orderCancelled.id,
    newStatus: 'CANCELLED',
    reason: 'User cancelled payment',
  });

  const cancelledWebhookPayload = {
    id: `evt_late_cancelled_${Date.now()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_late_cancelled_${Date.now()}`,
        payment_intent: `pi_late_cancelled_${Date.now()}`,
        payment_status: 'paid',
        amount_total: toCents(2000.00),
        currency: 'myr',
        metadata: {
          order_id: orderCancelled.id,
          organization_id: testOrgId,
        },
      },
    },
  };
  const rawBodyCancelled = JSON.stringify(cancelledWebhookPayload);
  const sigCancelled = generateWebhookSignature(rawBodyCancelled, webhookSecret);

  let cancelledToPaidBlocked = false;
  try {
    await verifyAndProcessPaymentWebhook({
      rawBody: rawBodyCancelled,
      signature: sigCancelled.signatureHeader,
      env: { PAYMENT_WEBHOOK_SECRET: webhookSecret },
    });
  } catch (err: any) {
    cancelledToPaidBlocked = true;
    assertEqual(err.code, 'INVALID_STATE_TRANSITION', 'Late webhook for CANCELLED order rejected with INVALID_STATE_TRANSITION');
  }
  assertEqual(cancelledToPaidBlocked, true, 'CANCELLED -> PAID transition strictly forbidden');

  // 3. Order transitioned to FAILED
  const orderFailed = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 3000.00,
    currency: 'MYR',
    notes: 'Testing failed order protection',
  });
  await processTopupOrderStatus({
    orderId: orderFailed.id,
    newStatus: 'FAILED',
    reason: 'Card decline',
  });

  let failedToPaidBlocked = false;
  try {
    await processTopupOrderStatus({
      orderId: orderFailed.id,
      newStatus: 'PAID',
      isTrustedSettlement: true,
      paymentReference: 'pi_test_late_failed',
    });
  } catch (err: any) {
    failedToPaidBlocked = true;
    assertEqual(err.message.includes('Cannot change status of a FAILED'), true, 'FAILED -> PAID rejected with invalid transition error');
  }
  assertEqual(failedToPaidBlocked, true, 'FAILED -> PAID transition strictly forbidden');

  // Verify wallet balance remained untouched throughout Constraint E tests
  const finalWallet = await getWalletBalance(testOrgId);
  assertEqual(finalWallet.paid_balance, 16000.00, 'Final wallet balance strictly unchanged after all rejected terminal state attempts');

  console.log('\n========================================================================');
  console.log('ALL PRODUCTION VERIFICATION CONSTRAINTS (A - E) PASSED SUCCESSFULLY!');
  console.log('========================================================================');
}

runProductionVerificationTests().catch((err) => {
  console.error('Production verification test suite failed:', err);
  process.exit(1);
});
