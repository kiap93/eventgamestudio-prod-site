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
} from './wallet.js';
import {
  createPaymentSession,
  verifyAndProcessPaymentWebhook,
  generateWebhookSignature,
  getPaymentWebhookSecret,
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

async function ensureTestOrg(orgId: string) {
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
  } catch {
    // Ignore in local mode
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log(' RUNNING PHASE 4: PAYMENT PROVIDER & WEBHOOK TEST SUITE');
  console.log('======================================================\n');

  const testOrgId = crypto.randomUUID();
  const testUserId = crypto.randomUUID();
  await ensureTestOrg(testOrgId);

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
