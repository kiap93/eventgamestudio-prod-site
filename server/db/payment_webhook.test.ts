/**
 * PHASE 4 TEST SUITE: Payment Provider Integration & Cryptographic Webhooks
 *
 * Verifies:
 * 1. HMAC-SHA256 Provider Signature verification
 * 2. Complete Payment Provider Lifecycle (PENDING -> PAID via Webhook)
 * 3. Strict Webhook Idempotency (Retries do not double-credit wallet)
 * 4. Security & Integrity Validation (Amount, Org, Currency tampering rejection)
 * 5. Failed payment webhook handling (Order marked FAILED, no wallet balance added)
 */

import crypto from 'node:crypto';
import { getSupabaseServerClient } from '../supabase.js';
import {
  createTopupOrder,
  getTopupOrderById,
  getWalletBalance,
  getOutstandingBalance,
  setOutstandingBalance,
  clearOutstandingBalance,
} from './wallet.js';
import {
  createPaymentSession,
  verifyAndProcessPaymentWebhook,
  generateWebhookSignature,
  getPaymentWebhookSecret,
  evaluatePaymentAmount,
  calculateTotalDue,
  STRIPE_MINIMUM_AMOUNT_MYR,
} from '../payment/index.js';

// Explicit test webhook secret for test environment
process.env.PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'test_webhook_secret_key_12345';

let passed = 0;
let failed = 0;

function assertEqual(actual: any, expected: any, testName: string) {
  if (actual === expected) {
    console.log(`  ✓ PASS: ${testName} (expected ${expected}, got ${actual})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - Expected ${expected}, got ${actual}`);
    failed++;
  }
}

async function ensureTestOrg(orgId: string): Promise<string> {
  const supabase = getSupabaseServerClient();
  try {
    const { data: users } = await supabase.from('users').select('id').limit(1);
    const validOwnerId = users?.[0]?.id || '4c857d15-ab93-45a6-8de5-7858ab4d6bd2';
    await supabase.from('organizations').upsert({
      id: orgId,
      name: `Test Org ${orgId.slice(0, 8)}`,
      slug: `test-org-${orgId.slice(0, 8)}`,
      owner_id: validOwnerId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return validOwnerId;
  } catch {
    return '4c857d15-ab93-45a6-8de5-7858ab4d6bd2';
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log(' RUNNING PHASE 4: PAYMENT PROVIDER & WEBHOOK TEST SUITE');
  console.log('======================================================\n');

  const testOrgId = crypto.randomUUID();
  const testUserId = await ensureTestOrg(testOrgId);

  // ----------------------------------------------------
  // TEST GROUP 1: CRYPTOGRAPHIC SIGNATURE VERIFICATION
  // ----------------------------------------------------
  console.log('--- Test Group 1: HMAC-SHA256 Signature Verification ---');

  const secret = getPaymentWebhookSecret();
  const validPayload = JSON.stringify({
    id: 'evt_test_1',
    type: 'payment.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'pay_123',
        amount: 6000.0,
        currency: 'MYR',
        metadata: {
          order_id: crypto.randomUUID(),
          organization_id: testOrgId,
        },
        status: 'succeeded',
      },
    },
  });

  const { signatureHeader, rawSignature } = generateWebhookSignature(validPayload, secret);

  // Test with invalid signature
  try {
    await verifyAndProcessPaymentWebhook({
      rawBody: validPayload,
      signature: 't=12345,v1=invalid_signature_hex_value',
    });
    console.error('  ✗ FAIL: Invalid signature should have thrown error');
    failed++;
  } catch (err: any) {
    assertEqual(err.code, 'INVALID_SIGNATURE', 'Invalid webhook signature rejected with INVALID_SIGNATURE');
  }

  // Test with tampered payload
  try {
    const tamperedPayload = validPayload.replace('6000', '9000');
    await verifyAndProcessPaymentWebhook({
      rawBody: tamperedPayload,
      signature: signatureHeader,
    });
    console.error('  ✗ FAIL: Tampered payload should have thrown signature error');
    failed++;
  } catch (err: any) {
    assertEqual(err.code, 'INVALID_SIGNATURE', 'Tampered payload rejected with INVALID_SIGNATURE');
  }

  // ----------------------------------------------------
  // TEST GROUP 2: END-TO-END PAYMENT FLOW (RM6,000 + RM300 BONUS)
  // ----------------------------------------------------
  console.log('\n--- Test Group 2: End-to-End Payment Flow (RM6,000 -> PAID via Webhook) ---');

  // Step 1: User creates top-up order (PENDING)
  const initialWallet = await getWalletBalance(testOrgId);
  const initialPaid = initialWallet.paid_balance;
  const initialTopupCredit = initialWallet.topup_credit;

  const order = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 6000.0,
    currency: 'MYR',
  });

  assertEqual(order.status, 'PENDING', 'Created top-up order is in PENDING status');
  assertEqual(order.top_up_amount, 6000.0, 'Top-up amount is RM6,000.00');
  assertEqual(order.expected_credit_amount, 300.0, 'Expected promotional credit is RM300.00 (5%)');

  // Verify wallet balance is NOT credited while PENDING
  const pendingWallet = await getWalletBalance(testOrgId);
  assertEqual(pendingWallet.paid_balance, initialPaid, 'Wallet paid balance unchanged while order is PENDING');
  assertEqual(pendingWallet.topup_credit, initialTopupCredit, 'Wallet topup credit unchanged while order is PENDING');

  // Step 2: Create checkout session
  const session = await createPaymentSession({
    order,
    originUrl: 'http://localhost:3000',
    customerEmail: 'finance@testcorp.com',
  });

  assertEqual(session.orderId, order.id, 'Checkout session linked to order ID');
  assertEqual(session.amount, 6000.0, 'Checkout session amount matches order');

  // Step 3: Payment provider sends signed webhook confirmation
  const paymentReference = `pay_stripe_${Date.now()}`;
  const webhookBody = JSON.stringify({
    id: `evt_${Date.now()}`,
    type: 'payment.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: paymentReference,
        amount: 6000.0,
        currency: 'MYR',
        metadata: {
          order_id: order.id,
          organization_id: testOrgId,
        },
        status: 'succeeded',
      },
    },
  });

  const { signatureHeader: validSig } = generateWebhookSignature(webhookBody, secret);

  const webhookResult = await verifyAndProcessPaymentWebhook({
    rawBody: webhookBody,
    signature: validSig,
  });

  assertEqual(webhookResult.success, true, 'Webhook processed successfully');
  assertEqual(webhookResult.status, 'PAID', 'Webhook transitioned order to PAID');
  assertEqual(webhookResult.isDuplicate, false, 'First webhook delivery is not a duplicate');

  // Step 4: Verify Top-up Order is updated
  const updatedOrder = await getTopupOrderById(order.id);
  assertEqual(updatedOrder?.status, 'PAID', 'Order record status is now PAID');
  assertEqual(updatedOrder?.payment_reference, paymentReference, 'Order contains payment reference from provider');

  // Step 5: Verify Wallet balances credited correctly
  const updatedWallet = await getWalletBalance(testOrgId);
  assertEqual(
    Math.round(updatedWallet.paid_balance * 100),
    Math.round((initialPaid + 6000.0) * 100),
    'Paid balance credited with exact RM6,000.00'
  );
  assertEqual(
    Math.round(updatedWallet.topup_credit * 100),
    Math.round((initialTopupCredit + 300.0) * 100),
    'Topup credit credited with exact RM300.00 (5% promo bonus)'
  );

  // ----------------------------------------------------
  // TEST GROUP 3: STRICT WEBHOOK IDEMPOTENCY (RETRIES)
  // ----------------------------------------------------
  console.log('\n--- Test Group 3: Strict Webhook Idempotency & Retries ---');

  const balanceBeforeRetries = await getWalletBalance(testOrgId);

  // Retry 1: Same webhook payload sent again
  const retryResult1 = await verifyAndProcessPaymentWebhook({
    rawBody: webhookBody,
    signature: validSig,
  });

  assertEqual(retryResult1.success, true, 'Webhook retry 1 returned success');
  assertEqual(retryResult1.isDuplicate, true, 'Webhook retry 1 recognized as duplicate');
  assertEqual(retryResult1.status, 'PAID', 'Status remains PAID');

  const balanceAfterRetry1 = await getWalletBalance(testOrgId);
  assertEqual(balanceAfterRetry1.paid_balance, balanceBeforeRetries.paid_balance, 'Retry 1 did NOT double-credit paid balance');
  assertEqual(balanceAfterRetry1.topup_credit, balanceBeforeRetries.topup_credit, 'Retry 1 did NOT double-credit topup credit');

  // Retry 2: Another duplicate webhook
  const retryResult2 = await verifyAndProcessPaymentWebhook({
    rawBody: webhookBody,
    signature: validSig,
  });

  assertEqual(retryResult2.isDuplicate, true, 'Webhook retry 2 recognized as duplicate');
  const balanceAfterRetry2 = await getWalletBalance(testOrgId);
  assertEqual(balanceAfterRetry2.paid_balance, balanceBeforeRetries.paid_balance, 'Retry 2 did NOT double-credit paid balance');

  // ----------------------------------------------------
  // TEST GROUP 4: INTEGRITY & TAMPERING GUARDS
  // ----------------------------------------------------
  console.log('\n--- Test Group 4: Security & Integrity Validation ---');

  // Order with amount RM1,000
  const orderIntegrity = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 1000.0,
    currency: 'MYR',
  });

  // Scenario A: Amount mismatch (payload says RM500 instead of RM1000)
  const tamperedAmountWebhook = JSON.stringify({
    id: `evt_mismatch_${Date.now()}`,
    type: 'payment.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `pay_${Date.now()}`,
        amount: 500.0, // MISMATCH
        currency: 'MYR',
        metadata: {
          order_id: orderIntegrity.id,
          organization_id: testOrgId,
        },
        status: 'succeeded',
      },
    },
  });

  const { signatureHeader: tamperedAmountSig } = generateWebhookSignature(tamperedAmountWebhook, secret);

  try {
    await verifyAndProcessPaymentWebhook({
      rawBody: tamperedAmountWebhook,
      signature: tamperedAmountSig,
    });
    console.error('  ✗ FAIL: Webhook with amount mismatch should have been rejected');
    failed++;
  } catch (err: any) {
    assertEqual(err.code, 'AMOUNT_MISMATCH', 'Webhook with mismatched amount rejected with AMOUNT_MISMATCH');
  }

  // Scenario B: Organization mismatch
  const tamperedOrgWebhook = JSON.stringify({
    id: `evt_org_mismatch_${Date.now()}`,
    type: 'payment.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `pay_${Date.now()}`,
        amount: 1000.0,
        currency: 'MYR',
        metadata: {
          order_id: orderIntegrity.id,
          organization_id: crypto.randomUUID(), // MISMATCH
        },
        status: 'succeeded',
      },
    },
  });

  const { signatureHeader: tamperedOrgSig } = generateWebhookSignature(tamperedOrgWebhook, secret);

  try {
    await verifyAndProcessPaymentWebhook({
      rawBody: tamperedOrgWebhook,
      signature: tamperedOrgSig,
    });
    console.error('  ✗ FAIL: Webhook with org mismatch should have been rejected');
    failed++;
  } catch (err: any) {
    assertEqual(err.code, 'ORGANIZATION_MISMATCH', 'Webhook with mismatched org rejected with ORGANIZATION_MISMATCH');
  }

  // ----------------------------------------------------
  // TEST GROUP 5: FAILED PAYMENT WEBHOOK
  // ----------------------------------------------------
  console.log('\n--- Test Group 5: Failed Payment Webhook Handling ---');

  const failedOrder = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 3000.0,
    currency: 'MYR',
  });

  const balanceBeforeFailed = await getWalletBalance(testOrgId);

  const failedWebhook = JSON.stringify({
    id: `evt_fail_${Date.now()}`,
    type: 'payment.failed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `pay_fail_${Date.now()}`,
        amount: 3000.0,
        currency: 'MYR',
        metadata: {
          order_id: failedOrder.id,
          organization_id: testOrgId,
        },
        status: 'failed',
        failure_reason: 'Insufficient funds on credit card',
      },
    },
  });

  const { signatureHeader: failedSig } = generateWebhookSignature(failedWebhook, secret);

  const failedResult = await verifyAndProcessPaymentWebhook({
    rawBody: failedWebhook,
    signature: failedSig,
  });

  assertEqual(failedResult.success, true, 'Failed webhook event handled');
  assertEqual(failedResult.status, 'FAILED', 'Order status transitioned to FAILED');

  const checkFailedOrder = await getTopupOrderById(failedOrder.id);
  assertEqual(checkFailedOrder?.status, 'FAILED', 'Order in database marked FAILED');

  const balanceAfterFailed = await getWalletBalance(testOrgId);
  assertEqual(balanceAfterFailed.paid_balance, balanceBeforeFailed.paid_balance, 'Zero wallet balance added for failed payment');
  assertEqual(balanceAfterFailed.topup_credit, balanceBeforeFailed.topup_credit, 'Zero promo credit added for failed payment');

  // ----------------------------------------------------
  // TEST GROUP 6: UNKNOWN WEBHOOK EVENT TYPE REJECTION
  // ----------------------------------------------------
  console.log('\n--- Test Group 6: Unknown Event Type Rejection ---');

  const unknownTypeOrder = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 1500.0,
    currency: 'MYR',
  });

  const balanceBeforeUnknown = await getWalletBalance(testOrgId);

  const unknownEventWebhook = JSON.stringify({
    id: `evt_unknown_${Date.now()}`,
    type: 'customer.source.updated', // unrecognized event type
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `pay_unknown_${Date.now()}`,
        amount: 1500.0,
        currency: 'MYR',
        metadata: {
          order_id: unknownTypeOrder.id,
          organization_id: testOrgId,
        },
      },
    },
  });

  const { signatureHeader: unknownSig } = generateWebhookSignature(unknownEventWebhook, secret);

  try {
    await verifyAndProcessPaymentWebhook({
      rawBody: unknownEventWebhook,
      signature: unknownSig,
    });
    console.error('  ✗ FAIL: Unknown event type should have been rejected');
    failed++;
  } catch (err: any) {
    assertEqual(err.code, 'UNKNOWN_EVENT_TYPE', 'Unknown event type rejected with UNKNOWN_EVENT_TYPE');
    assertEqual(err.status, 422, 'Unknown event type HTTP status is 422');
  }

  // Ensure order remains PENDING and wallet is untouched
  const checkUnknownOrder = await getTopupOrderById(unknownTypeOrder.id);
  assertEqual(checkUnknownOrder?.status, 'PENDING', 'Order remains PENDING after unknown event');

  const balanceAfterUnknown = await getWalletBalance(testOrgId);
  assertEqual(balanceAfterUnknown.paid_balance, balanceBeforeUnknown.paid_balance, 'Wallet paid balance untouched by unknown event');
  assertEqual(balanceAfterUnknown.topup_credit, balanceBeforeUnknown.topup_credit, 'Wallet promo credit untouched by unknown event');

  // ----------------------------------------------------
  // TEST GROUP 7: MISSING EVENT TYPE REJECTION
  // ----------------------------------------------------
  console.log('\n--- Test Group 7: Missing Event Type Rejection ---');

  const missingTypeWebhook = JSON.stringify({
    id: `evt_notype_${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        amount: 1500.0,
        currency: 'MYR',
        metadata: {
          order_id: unknownTypeOrder.id,
          organization_id: testOrgId,
        },
      },
    },
  });

  const { signatureHeader: missingTypeSig } = generateWebhookSignature(missingTypeWebhook, secret);

  try {
    await verifyAndProcessPaymentWebhook({
      rawBody: missingTypeWebhook,
      signature: missingTypeSig,
    });
    console.error('  ✗ FAIL: Missing event type should have been rejected');
    failed++;
  } catch (err: any) {
    assertEqual(err.code, 'MISSING_EVENT_TYPE', 'Missing event type rejected with MISSING_EVENT_TYPE');
    assertEqual(err.status, 400, 'Missing event type HTTP status is 400');
  }

  // ----------------------------------------------------
  // TEST GROUP 8: SUCCESSFUL TOP-UP WITHOUT PROMO (RM1,400 -> RM0 BONUS)
  // ----------------------------------------------------
  console.log('\n--- Test Group 8: Successful Top-up Without Promo (RM1,400 -> RM0 Bonus) ---');

  const preNoPromoWallet = await getWalletBalance(testOrgId);
  const orderNoPromo = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 1400.0,
    currency: 'MYR',
  });

  assertEqual(orderNoPromo.status, 'PENDING', 'RM1,400 order created in PENDING status');
  assertEqual(orderNoPromo.expected_credit_amount, 0.0, 'RM1,400 order has RM0 expected bonus');

  const noPromoWebhook = JSON.stringify({
    id: `evt_nopromo_${Date.now()}`,
    type: 'payment.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `pay_nopromo_${Date.now()}`,
        amount: 1400.0,
        currency: 'MYR',
        metadata: {
          order_id: orderNoPromo.id,
          organization_id: testOrgId,
        },
        status: 'succeeded',
      },
    },
  });

  const { signatureHeader: noPromoSig } = generateWebhookSignature(noPromoWebhook, secret);
  const noPromoResult = await verifyAndProcessPaymentWebhook({
    rawBody: noPromoWebhook,
    signature: noPromoSig,
  });

  assertEqual(noPromoResult.success, true, 'No-promo webhook succeeded');
  assertEqual(noPromoResult.status, 'PAID', 'No-promo order status is PAID');

  const postNoPromoWallet = await getWalletBalance(testOrgId);
  assertEqual(
    postNoPromoWallet.paid_balance,
    preNoPromoWallet.paid_balance + 1400,
    'Paid balance increased by exactly RM1,400.00'
  );
  assertEqual(
    postNoPromoWallet.topup_credit,
    preNoPromoWallet.topup_credit,
    'Topup credit unchanged (RM0 bonus granted)'
  );

  // ----------------------------------------------------
  // TEST GROUP 9: SUCCESSFUL TIER-2 TOP-UP WITH 7% PROMO (RM10,000 -> RM700 BONUS)
  // ----------------------------------------------------
  console.log('\n--- Test Group 9: Successful Tier-2 Top-up With 7% Promo (RM10,000 -> RM700 Bonus) ---');

  const preTier2Wallet = await getWalletBalance(testOrgId);
  const orderTier2 = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 10000.0,
    currency: 'MYR',
  });

  assertEqual(orderTier2.status, 'PENDING', 'RM10,000 order created in PENDING status');
  assertEqual(orderTier2.expected_credit_amount, 700.0, 'RM10,000 order has RM700 expected bonus (7%)');

  const tier2Webhook = JSON.stringify({
    id: `evt_tier2_${Date.now()}`,
    type: 'payment.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `pay_tier2_${Date.now()}`,
        amount: 10000.0,
        currency: 'MYR',
        metadata: {
          order_id: orderTier2.id,
          organization_id: testOrgId,
        },
        status: 'succeeded',
      },
    },
  });

  const { signatureHeader: tier2Sig } = generateWebhookSignature(tier2Webhook, secret);
  const tier2Result = await verifyAndProcessPaymentWebhook({
    rawBody: tier2Webhook,
    signature: tier2Sig,
  });

  assertEqual(tier2Result.success, true, 'Tier-2 webhook succeeded');
  assertEqual(tier2Result.status, 'PAID', 'Tier-2 order status is PAID');

  const postTier2Wallet = await getWalletBalance(testOrgId);
  assertEqual(
    postTier2Wallet.paid_balance,
    preTier2Wallet.paid_balance + 10000,
    'Paid balance increased by exactly RM10,000.00'
  );
  assertEqual(
    postTier2Wallet.topup_credit,
    preTier2Wallet.topup_credit + 700,
    'Topup credit increased by exactly RM700.00'
  );

  // ----------------------------------------------------
  // TEST GROUP 10: STRIPE CENTS WEBHOOK (amount_total: 140000) & SUB-UNIT SECURITY
  // ----------------------------------------------------
  console.log('\n--- Test Group 10: Stripe Webhook in Cents & Sub-unit Security ---');

  const orderCents = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 1400.0,
    currency: 'MYR',
  });

  // Stripe standard checkout.session.completed with amount_total in cents
  const stripeCentsWebhook = JSON.stringify({
    id: `evt_cents_${Date.now()}`,
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `cs_test_${Date.now()}`,
        object: 'checkout.session',
        amount_total: 140000, // 140,000 cents = RM1,400.00
        currency: 'myr',
        payment_intent: `pi_test_${Date.now()}`,
        metadata: {
          order_id: orderCents.id,
          organization_id: testOrgId,
        },
        payment_status: 'paid',
      },
    },
  });

  const { signatureHeader: stripeCentsSig } = generateWebhookSignature(stripeCentsWebhook, secret);
  const stripeCentsResult = await verifyAndProcessPaymentWebhook({
    rawBody: stripeCentsWebhook,
    signature: stripeCentsSig,
  });

  assertEqual(stripeCentsResult.success, true, 'Stripe cents webhook processed successfully');
  assertEqual(stripeCentsResult.status, 'PAID', 'Order transitioned to PAID via Stripe cents event');

  // Verify sub-unit fraud rejection: order for RM5000, but attacker pays 5000 cents ($50.00)
  const highValueOrder = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 5000.0,
    currency: 'MYR',
  });

  const fraudSubunitWebhook = JSON.stringify({
    id: `evt_fraud_${Date.now()}`,
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `cs_fraud_${Date.now()}`,
        object: 'checkout.session',
        amount_total: 5000, // 5,000 cents = RM50.00 instead of RM5,000.00
        currency: 'myr',
        metadata: {
          order_id: highValueOrder.id,
          organization_id: testOrgId,
        },
        payment_status: 'paid',
      },
    },
  });

  const { signatureHeader: fraudSig } = generateWebhookSignature(fraudSubunitWebhook, secret);
  try {
    await verifyAndProcessPaymentWebhook({
      rawBody: fraudSubunitWebhook,
      signature: fraudSig,
    });
    console.error('  ✗ FAIL: Fraudulent sub-unit amount should have been rejected');
    failed++;
  } catch (err: any) {
    assertEqual(err.code, 'AMOUNT_MISMATCH', 'Fraudulent 5000 cents for RM5000 rejected with AMOUNT_MISMATCH');
  }

  // ----------------------------------------------------
  // TEST GROUP 11: CURRENCY MISMATCH REJECTION
  // ----------------------------------------------------
  console.log('\n--- Test Group 11: Currency Mismatch Rejection ---');

  const orderCurr = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 2000.0,
    currency: 'MYR',
  });

  const wrongCurrencyWebhook = JSON.stringify({
    id: `evt_curr_${Date.now()}`,
    type: 'payment.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `pay_curr_${Date.now()}`,
        amount: 2000.0,
        currency: 'USD', // Expected MYR
        metadata: {
          order_id: orderCurr.id,
          organization_id: testOrgId,
        },
        status: 'succeeded',
      },
    },
  });

  const { signatureHeader: wrongCurrSig } = generateWebhookSignature(wrongCurrencyWebhook, secret);
  try {
    await verifyAndProcessPaymentWebhook({
      rawBody: wrongCurrencyWebhook,
      signature: wrongCurrSig,
    });
    console.error('  ✗ FAIL: Wrong currency should have been rejected');
    failed++;
  } catch (err: any) {
    assertEqual(err.code, 'CURRENCY_MISMATCH', 'Currency USD rejected with CURRENCY_MISMATCH for MYR order');
    assertEqual(err.status, 422, 'Currency mismatch status is 422');
  }

  // ----------------------------------------------------
  // TEST GROUP 12: ALREADY-PAID ORDER STATE INTEGRITY
  // ----------------------------------------------------
  console.log('\n--- Test Group 12: Already-Paid Orders & Terminal State Protection ---');

  // Attempting to transition an already-paid order to FAILED via webhook must be rejected
  const downgradeWebhook = JSON.stringify({
    id: `evt_downgrade_${Date.now()}`,
    type: 'payment.failed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `pay_downgrade_${Date.now()}`,
        amount: 1400.0,
        currency: 'MYR',
        metadata: {
          order_id: orderNoPromo.id, // ALREADY PAID
          organization_id: testOrgId,
        },
        status: 'failed',
      },
    },
  });

  const { signatureHeader: downgradeSig } = generateWebhookSignature(downgradeWebhook, secret);
  try {
    await verifyAndProcessPaymentWebhook({
      rawBody: downgradeWebhook,
      signature: downgradeSig,
    });
    console.error('  ✗ FAIL: Downgrading PAID order to FAILED should be rejected');
    failed++;
  } catch (err: any) {
    assertEqual(err.code, 'INVALID_STATE_TRANSITION', 'Downgrade attempt rejected with INVALID_STATE_TRANSITION');
    assertEqual(err.status, 409, 'Downgrade attempt status is 409 Conflict');
  }

  // Idempotent duplicate replay of already-paid order
  const duplicatePaidWebhook = JSON.stringify({
    id: `evt_dup_paid_${Date.now()}`,
    type: 'payment.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `pay_dup_${Date.now()}`,
        amount: 1400.0,
        currency: 'MYR',
        metadata: {
          order_id: orderNoPromo.id,
          organization_id: testOrgId,
        },
        status: 'succeeded',
      },
    },
  });

  const { signatureHeader: dupPaidSig } = generateWebhookSignature(duplicatePaidWebhook, secret);
  const dupPaidResult = await verifyAndProcessPaymentWebhook({
    rawBody: duplicatePaidWebhook,
    signature: dupPaidSig,
  });

  assertEqual(dupPaidResult.success, true, 'Duplicate PAID webhook returned success');
  assertEqual(dupPaidResult.isDuplicate, true, 'Duplicate PAID webhook flagged isDuplicate = true');
  assertEqual(dupPaidResult.alreadyProcessed, true, 'Duplicate PAID webhook flagged alreadyProcessed = true');

  // ----------------------------------------------------
  // TEST GROUP 13: DATABASE FAILURE / MISSING ORDER HANDLING
  // ----------------------------------------------------
  console.log('\n--- Test Group 13: Non-existent Order Handling (Graceful 404) ---');

  const nonExistentOrderId = crypto.randomUUID();
  const nonExistentOrderWebhook = JSON.stringify({
    id: `evt_404_${Date.now()}`,
    type: 'payment.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `pay_404_${Date.now()}`,
        amount: 1400.0,
        currency: 'MYR',
        metadata: {
          order_id: nonExistentOrderId,
          organization_id: testOrgId,
        },
        status: 'succeeded',
      },
    },
  });

  const { signatureHeader: nonExistentSig } = generateWebhookSignature(nonExistentOrderWebhook, secret);
  try {
    await verifyAndProcessPaymentWebhook({
      rawBody: nonExistentOrderWebhook,
      signature: nonExistentSig,
    });
    console.error('  ✗ FAIL: Non-existent order should have thrown 404');
    failed++;
  } catch (err: any) {
    assertEqual(err.code, 'ORDER_NOT_FOUND', 'Non-existent order rejected with ORDER_NOT_FOUND');
    assertEqual(err.status, 404, 'Non-existent order status is 404');
  }

  // ----------------------------------------------------
  // TEST GROUP 14: STRIPE MINIMUM PAYMENT LOGIC (BLOCKER 1)
  // ----------------------------------------------------
  console.log('\n--- Test Group 14: Stripe Minimum Payment Logic & Evaluation ---');

  // Test 14.1: RM0.00 -> Do NOT create Checkout Session
  const zeroEval = evaluatePaymentAmount(0, 0);
  assertEqual(zeroEval.action, 'ZERO_AMOUNT', 'RM0.00 evaluates to ZERO_AMOUNT action');
  assertEqual(zeroEval.shouldCreateSession, false, 'RM0.00 shouldCreateSession is false');
  assertEqual(zeroEval.totalDue, 0, 'RM0.00 totalDue is 0');

  const zeroOrder = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 0,
    currency: 'MYR',
  });
  const zeroSession = await createPaymentSession({
    order: zeroOrder,
    payableAmount: 0,
  });
  assertEqual(zeroSession.sessionCreated, false, 'RM0.00 createPaymentSession returns sessionCreated = false');
  assertEqual(zeroSession.status, 'ZERO_AMOUNT_NO_SESSION', 'RM0.00 status is ZERO_AMOUNT_NO_SESSION');
  assertEqual(zeroSession.totalDue, 0, 'RM0.00 session totalDue is 0');
  assertEqual(zeroSession.checkoutUrl, '', 'RM0.00 has no checkoutUrl');

  // Test 14.2: RM0.50 -> Do NOT create Checkout Session. Persist as outstanding balance.
  await clearOutstandingBalance(testOrgId);
  const rm050Eval = evaluatePaymentAmount(0.50, 0);
  assertEqual(rm050Eval.action, 'PERSIST_OUTSTANDING', 'RM0.50 evaluates to PERSIST_OUTSTANDING action');
  assertEqual(rm050Eval.shouldCreateSession, false, 'RM0.50 shouldCreateSession is false');
  assertEqual(rm050Eval.totalDue, 0.50, 'RM0.50 totalDue is 0.50');

  const rm050Order = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 0.50,
    currency: 'MYR',
  });
  const rm050Session = await createPaymentSession({ order: rm050Order });
  assertEqual(rm050Session.sessionCreated, false, 'RM0.50 sessionCreated is false');
  assertEqual(rm050Session.status, 'OUTSTANDING_BALANCE_RECORDED', 'RM0.50 status is OUTSTANDING_BALANCE_RECORDED');
  assertEqual(rm050Session.totalDue, 0.50, 'RM0.50 totalDue is exactly 0.50');
  assertEqual(rm050Session.outstandingAmount, 0.50, 'RM0.50 outstandingAmount is 0.50');
  const orgBal050 = await getOutstandingBalance(testOrgId);
  assertEqual(orgBal050, 0.50, 'RM0.50 persisted to database as outstanding balance');

  // Test 14.3: RM1.00 -> Do NOT create Checkout Session. Do NOT silently round to RM2.00.
  await clearOutstandingBalance(testOrgId);
  const rm100Eval = evaluatePaymentAmount(1.00, 0);
  assertEqual(rm100Eval.action, 'PERSIST_OUTSTANDING', 'RM1.00 evaluates to PERSIST_OUTSTANDING action');
  assertEqual(rm100Eval.shouldCreateSession, false, 'RM1.00 shouldCreateSession is false');
  assertEqual(rm100Eval.totalDue, 1.00, 'RM1.00 totalDue is 1.00 (not rounded)');

  const rm100Order = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 1.00,
    currency: 'MYR',
  });
  const rm100Session = await createPaymentSession({ order: rm100Order });
  assertEqual(rm100Session.sessionCreated, false, 'RM1.00 sessionCreated is false');
  assertEqual(rm100Session.status, 'OUTSTANDING_BALANCE_RECORDED', 'RM1.00 status is OUTSTANDING_BALANCE_RECORDED');
  assertEqual(rm100Session.totalDue, 1.00, 'RM1.00 totalDue is exactly 1.00');
  assertEqual(rm100Session.outstandingAmount, 1.00, 'RM1.00 outstandingAmount is 1.00');
  const orgBal100 = await getOutstandingBalance(testOrgId);
  assertEqual(orgBal100, 1.00, 'RM1.00 persisted to database as outstanding balance');

  // Test 14.4: RM1.99 -> Do NOT create Checkout Session. Persist as outstanding balance.
  await clearOutstandingBalance(testOrgId);
  const rm199Eval = evaluatePaymentAmount(1.99, 0);
  assertEqual(rm199Eval.action, 'PERSIST_OUTSTANDING', 'RM1.99 evaluates to PERSIST_OUTSTANDING action');
  assertEqual(rm199Eval.shouldCreateSession, false, 'RM1.99 shouldCreateSession is false');
  assertEqual(rm199Eval.totalDue, 1.99, 'RM1.99 totalDue is 1.99');

  const rm199Order = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 1.99,
    currency: 'MYR',
  });
  const rm199Session = await createPaymentSession({ order: rm199Order });
  assertEqual(rm199Session.sessionCreated, false, 'RM1.99 sessionCreated is false');
  assertEqual(rm199Session.status, 'OUTSTANDING_BALANCE_RECORDED', 'RM1.99 status is OUTSTANDING_BALANCE_RECORDED');
  assertEqual(rm199Session.totalDue, 1.99, 'RM1.99 totalDue is exactly 1.99');
  const orgBal199 = await getOutstandingBalance(testOrgId);
  assertEqual(orgBal199, 1.99, 'RM1.99 persisted to database as outstanding balance');

  // Test 14.5: RM2.00 -> Create Stripe Checkout Session
  await clearOutstandingBalance(testOrgId);
  const rm200Eval = evaluatePaymentAmount(2.00, 0);
  assertEqual(rm200Eval.action, 'CREATE_SESSION', 'RM2.00 evaluates to CREATE_SESSION action');
  assertEqual(rm200Eval.shouldCreateSession, true, 'RM2.00 shouldCreateSession is true');
  assertEqual(rm200Eval.totalDue, 2.00, 'RM2.00 totalDue is 2.00');

  const rm200Order = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 2.00,
    currency: 'MYR',
  });
  const rm200Session = await createPaymentSession({ order: rm200Order });
  assertEqual(rm200Session.sessionCreated, true, 'RM2.00 sessionCreated is true');
  assertEqual(rm200Session.status, 'SESSION_CREATED', 'RM2.00 status is SESSION_CREATED');
  assertEqual(rm200Session.totalDue, 2.00, 'RM2.00 totalDue is 2.00');
  assertEqual(rm200Session.amount, 2.00, 'RM2.00 session amount is 2.00');
  assertEqual(typeof rm200Session.sessionId === 'string' && rm200Session.sessionId.length > 0, true, 'RM2.00 sessionId is generated');

  // Test 14.6: Outstanding RM1.00 + new RM0.50 -> Total RM1.50 (< RM2.00)
  await setOutstandingBalance(testOrgId, 1.00);
  const comb1Eval = evaluatePaymentAmount(0.50, 1.00);
  assertEqual(comb1Eval.action, 'PERSIST_OUTSTANDING', 'RM1.00 out + RM0.50 new evaluates to PERSIST_OUTSTANDING');
  assertEqual(comb1Eval.totalDue, 1.50, 'RM1.00 out + RM0.50 new totalDue is 1.50');

  const comb1Order = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 0.50,
    currency: 'MYR',
  });
  const comb1Session = await createPaymentSession({ order: comb1Order });
  assertEqual(comb1Session.sessionCreated, false, 'RM1.50 combined sessionCreated is false');
  assertEqual(comb1Session.status, 'OUTSTANDING_BALANCE_RECORDED', 'RM1.50 combined status is OUTSTANDING_BALANCE_RECORDED');
  assertEqual(comb1Session.totalDue, 1.50, 'RM1.50 combined totalDue is 1.50');
  const orgBalComb1 = await getOutstandingBalance(testOrgId);
  assertEqual(orgBalComb1, 1.50, 'Persisted outstanding balance updated to RM1.50');

  // Test 14.7: Outstanding RM1.00 + new RM1.00 -> Total RM2.00 (>= RM2.00) -> Create Session
  await setOutstandingBalance(testOrgId, 1.00);
  const comb2Eval = evaluatePaymentAmount(1.00, 1.00);
  assertEqual(comb2Eval.action, 'CREATE_SESSION', 'RM1.00 out + RM1.00 new evaluates to CREATE_SESSION');
  assertEqual(comb2Eval.totalDue, 2.00, 'RM1.00 out + RM1.00 new totalDue is exactly 2.00');

  const comb2Order = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 1.00,
    currency: 'MYR',
  });
  const comb2Session = await createPaymentSession({ order: comb2Order });
  assertEqual(comb2Session.sessionCreated, true, 'RM2.00 combined sessionCreated is true');
  assertEqual(comb2Session.status, 'SESSION_CREATED', 'RM2.00 combined status is SESSION_CREATED');
  assertEqual(comb2Session.totalDue, 2.00, 'RM2.00 combined totalDue is 2.00');
  assertEqual(comb2Session.payableAmount, 1.00, 'RM2.00 combined payableAmount is 1.00');
  assertEqual(comb2Session.outstandingAmount, 1.00, 'RM2.00 combined outstandingAmount is 1.00');

  // Prior to settlement, outstanding balance MUST remain in DB (never lost on checkout creation)
  const orgBalPreSettle = await getOutstandingBalance(testOrgId);
  assertEqual(orgBalPreSettle, 1.00, 'Outstanding balance remains RM1.00 in DB before settlement');

  // Test 14.8: Outstanding RM1.50 + new RM10.00 -> Total RM11.50 (>= RM2.00)
  await setOutstandingBalance(testOrgId, 1.50);
  const comb3Eval = evaluatePaymentAmount(10.00, 1.50);
  assertEqual(comb3Eval.action, 'CREATE_SESSION', 'RM1.50 out + RM10.00 new evaluates to CREATE_SESSION');
  assertEqual(comb3Eval.totalDue, 11.50, 'RM1.50 out + RM10.00 new totalDue is 11.50');

  const comb3Order = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 10.00,
    currency: 'MYR',
  });
  const comb3Session = await createPaymentSession({ order: comb3Order });
  assertEqual(comb3Session.sessionCreated, true, 'RM11.50 combined sessionCreated is true');
  assertEqual(comb3Session.totalDue, 11.50, 'RM11.50 combined totalDue is 11.50');
  assertEqual(comb3Session.outstandingAmount, 1.50, 'RM11.50 combined includes RM1.50 outstanding');

  // ----------------------------------------------------
  // TEST GROUP 15: OUTSTANDING LIFECYCLE & WEBHOOK SETTLEMENT
  // ----------------------------------------------------
  console.log('\n--- Test Group 15: Outstanding Lifecycle & Webhook Settlement ---');

  // Test 15.1: Failed / Cancelled checkout MUST leave outstanding balance intact
  await setOutstandingBalance(testOrgId, 1.00);
  const failedTestOrder = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 2.00,
    currency: 'MYR',
  });
  await createPaymentSession({ order: failedTestOrder });

  // Webhook delivers failure for this session
  const failWebhookPayload = JSON.stringify({
    id: `evt_fail_out_${Date.now()}`,
    type: 'payment.failed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `pay_fail_out_${Date.now()}`,
        amount: 300, // 300 cents = RM3.00
        currency: 'MYR',
        metadata: {
          order_id: failedTestOrder.id,
          organization_id: testOrgId,
        },
        status: 'failed',
      },
    },
  });
  const { signatureHeader: failSig } = generateWebhookSignature(failWebhookPayload, secret);
  const failResult = await verifyAndProcessPaymentWebhook({
    rawBody: failWebhookPayload,
    signature: failSig,
  });
  assertEqual(failResult.success, true, 'Failure webhook processed successfully');
  assertEqual(failResult.status, 'FAILED', 'Order marked FAILED');

  // CRITICAL: Outstanding balance must STILL be RM1.00!
  const balAfterFail = await getOutstandingBalance(testOrgId);
  assertEqual(balAfterFail, 1.00, 'Outstanding balance remains RM1.00 after failed/cancelled checkout');

  // Test 15.2: Confirmed successful payment settlement MUST clear outstanding balance
  await setOutstandingBalance(testOrgId, 1.00);
  const successTestOrder = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 2.00,
    currency: 'MYR',
  });
  const successSession = await createPaymentSession({ order: successTestOrder });
  assertEqual(successSession.totalDue, 3.00, 'Success test totalDue is RM3.00');

  const successWebhookPayload = JSON.stringify({
    id: `evt_succ_out_${Date.now()}`,
    type: 'payment.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `pay_succ_out_${Date.now()}`,
        amount: 300, // 300 cents = RM3.00 (total due)
        currency: 'MYR',
        metadata: {
          order_id: successTestOrder.id,
          organization_id: testOrgId,
        },
        status: 'succeeded',
      },
    },
  });
  const { signatureHeader: succSig } = generateWebhookSignature(successWebhookPayload, secret);
  const succResult = await verifyAndProcessPaymentWebhook({
    rawBody: successWebhookPayload,
    signature: succSig,
  });
  assertEqual(succResult.success, true, 'Success webhook processed successfully');
  assertEqual(succResult.status, 'PAID', 'Order transitioned to PAID');

  // CRITICAL: Outstanding balance must be cleared to RM0.00 upon confirmed payment settlement!
  const balAfterSuccess = await getOutstandingBalance(testOrgId);
  assertEqual(balAfterSuccess, 0, 'Outstanding balance is cleared to RM0.00 after successful settlement');

  // Test 15.3: Webhook Idempotency on Settled Order
  const dupSuccResult = await verifyAndProcessPaymentWebhook({
    rawBody: successWebhookPayload,
    signature: succSig,
  });
  assertEqual(dupSuccResult.isDuplicate, true, 'Duplicate webhook flagged isDuplicate = true');
  assertEqual(dupSuccResult.alreadyProcessed, true, 'Duplicate webhook flagged alreadyProcessed = true');
  const balAfterDup = await getOutstandingBalance(testOrgId);
  assertEqual(balAfterDup, 0, 'Outstanding balance remains RM0.00 on duplicate webhook');

  // Test 15.4: Database Persistence across sessions / wallet summary query
  await setOutstandingBalance(testOrgId, 1.75);
  const walletSummary = await getWalletBalance(testOrgId);
  assertEqual(walletSummary.outstanding_balance, 1.75, 'Wallet summary correctly reflects persistent outstanding_balance = RM1.75');

  // Summary
  console.log('\n======================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running payment webhook tests:', err);
  process.exit(1);
});
