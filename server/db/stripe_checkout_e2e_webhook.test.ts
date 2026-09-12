/**
 * STRIPE END-TO-END CHECKOUT & CLOUDFLARE WEBHOOK TEST SUITE
 *
 * Simulates and verifies the complete real Stripe payment lifecycle:
 *
 * Stripe test payment
 *       ↓
 * Checkout (createTopupOrder -> Checkout session)
 *       ↓
 * checkout.session.completed (Real Stripe event structure)
 *       ↓
 * Cloudflare webhook (worker.fetch -> POST /api/webhooks/stripe)
 *       ↓
 * signature verified (HMAC-SHA256 with t=...,v1=... format)
 *       ↓
 * Topup Order PAID (order status transitioned atomically)
 *       ↓
 * wallet credited (paid_balance + qualifying topup_credit)
 *       ↓
 * transaction ledger created (separate audit trail entries)
 *       ↓
 * duplicate webhook sent (Stripe retry simulation)
 *       ↓
 * NO duplicate credit (strictly idempotent, zero extra balance)
 */

import crypto from 'node:crypto';
import worker from '../../worker.js';
import { getSupabaseServerClient } from '../supabase.js';
import {
  createTopupOrder,
  getTopupOrderById,
  getWalletBalance,
  getWalletTransactions,
} from './wallet.js';
import {
  generateWebhookSignature,
} from '../payment/index.js';

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

function assertTrue(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
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
      name: `Stripe Test Org ${orgId.slice(0, 8)}`,
      slug: `stripe-test-org-${orgId.slice(0, 8)}`,
      owner_id: validOwnerId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return validOwnerId;
  } catch {
    return '4c857d15-ab93-45a6-8de5-7858ab4d6bd2';
  }
}

async function runStripeE2ETests() {
  console.log('\n======================================================');
  console.log(' STRIPE END-TO-END CHECKOUT & CLOUDFLARE WEBHOOK SUITE');
  console.log('======================================================\n');

  const testWebhookSecret = 'whsec_test_stripe_e2e_production_ready_998877';
  process.env.PAYMENT_WEBHOOK_SECRET = testWebhookSecret;

  const testEnv: Record<string, any> = {
    PAYMENT_WEBHOOK_SECRET: testWebhookSecret,
    STRIPE_SECRET_KEY: 'sk_test_mock_e2e_key',
    JWT_SECRET: 'test_jwt_secret_for_e2e_tests_1234567890',
  };

  const orgId = crypto.randomUUID();
  const userId = await ensureTestOrg(orgId);

  // Initial balance verification
  const initialBalance = await getWalletBalance(orgId, testEnv);
  const initialTxns = await getWalletTransactions(orgId, undefined, testEnv);

  console.log('--- Step 1: Verify Initial Clean State ---');
  assertEqual(initialBalance.paid_balance, 0, 'Initial paid balance is 0.00');
  assertEqual(initialBalance.topup_credit, 0, 'Initial topup credit is 0.00');
  assertEqual(initialBalance.total_balance, 0, 'Initial total balance is 0.00');
  assertEqual(initialTxns.transactions.length, 0, 'Initial transaction count is 0');

  // Step 2: Checkout - Create Pending Top-Up Order (RM 6,000.00)
  console.log('\n--- Step 2: Stripe Checkout & Pending Top-Up Order Creation ---');
  const depositAmount = 6000.0; // RM 6,000 deposits qualify for 5% bonus = RM 300.00
  const order = await createTopupOrder(
    {
      organizationId: orgId,
      userId,
      amount: depositAmount,
      currency: 'MYR',
      paymentMethod: 'card',
      notes: 'Stripe End-to-End Test Checkout',
      metadata: {
        stripe_checkout_initiated: true,
        source: 'e2e_stripe_test',
      },
    },
    testEnv
  );

  assertEqual(order.status, 'PENDING', 'Top-up order created in PENDING status');
  assertEqual(order.top_up_amount, 6000, 'Top-up amount is RM 6,000.00');
  assertEqual(order.expected_credit_amount, 300, 'Expected top-up reward is RM 300.00 (5%)');
  assertEqual(order.total_wallet_value, 6300, 'Total expected wallet value is RM 6,300.00');

  // Verify wallet is NOT credited while order is PENDING
  const prePaymentBalance = await getWalletBalance(orgId, testEnv);
  assertEqual(prePaymentBalance.paid_balance, 0, 'Wallet paid balance unchanged during PENDING checkout');
  assertEqual(prePaymentBalance.topup_credit, 0, 'Wallet topup credit unchanged during PENDING checkout');

  // Step 3: Construct Real Stripe checkout.session.completed Webhook Event
  console.log('\n--- Step 3: Construct checkout.session.completed Event ---');
  const stripeSessionId = `cs_test_${crypto.randomBytes(16).toString('hex')}`;
  const stripePaymentIntentId = `pi_test_${crypto.randomBytes(16).toString('hex')}`;
  const stripeEventId = `evt_test_${crypto.randomBytes(16).toString('hex')}`;
  const eventTimestamp = Math.floor(Date.now() / 1000);

  const stripePayload = {
    id: stripeEventId,
    object: 'event',
    api_version: '2023-10-16',
    created: eventTimestamp,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: stripeSessionId,
        object: 'checkout.session',
        amount_total: 600000, // 6,000.00 MYR in cents
        amount_subtotal: 600000,
        currency: 'myr',
        customer: 'cus_test_e2e_999',
        customer_details: {
          email: 'director@eventframe.io',
          name: 'Jane Event Director',
        },
        payment_intent: stripePaymentIntentId,
        payment_status: 'paid',
        status: 'complete',
        payment_method_types: ['card'],
        metadata: {
          order_id: order.id,
          organization_id: orgId,
          source: 'stripe_checkout',
        },
      },
    },
  };

  const rawBody = JSON.stringify(stripePayload);

  // Step 4: Generate Stripe Cryptographic Signature Header (t=...,v1=...)
  console.log('\n--- Step 4: Sign Webhook Payload with HMAC-SHA256 ---');
  const { signatureHeader } = generateWebhookSignature(rawBody, testWebhookSecret, eventTimestamp);
  assertTrue(signatureHeader.startsWith('t=') && signatureHeader.includes(',v1='), 'Signature follows Stripe t=...,v1=... format');

  // Step 5: Dispatch to Cloudflare Webhook Endpoint (POST /api/webhooks/stripe)
  console.log('\n--- Step 5: Dispatch to Cloudflare Webhook (/api/webhooks/stripe) ---');
  const webhookRequest = new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signatureHeader,
    },
    body: rawBody,
  });

  const workerResponse = await worker.fetch(webhookRequest, testEnv);
  assertEqual(workerResponse.status, 200, 'Cloudflare webhook returns HTTP 200');

  const responseJson = (await workerResponse.json()) as any;
  assertEqual(responseJson.received, true, 'Webhook acknowledged (received: true)');
  assertEqual(responseJson.success, true, 'Webhook processing succeeded (success: true)');
  assertEqual(responseJson.isDuplicate, false, 'First webhook delivery is NOT a duplicate (isDuplicate: false)');
  assertEqual(responseJson.status, 'PAID', 'Webhook response status is PAID');
  assertEqual(responseJson.orderId, order.id, 'Webhook response orderId matches target order');

  // Step 6: Verify Topup Order Status in Database
  console.log('\n--- Step 6: Verify Topup Order Transitions to PAID ---');
  const settledOrder = await getTopupOrderById(order.id, testEnv);
  assertTrue(settledOrder !== null, 'Settled order exists in database');
  assertEqual(settledOrder?.status, 'PAID', 'Order status transitioned to PAID');
  assertTrue(settledOrder?.paid_at !== null, 'Order paid_at timestamp is stamped');
  assertEqual(settledOrder?.payment_reference, stripeSessionId, 'Order payment_reference records Stripe session ID');

  // Step 7: Verify Wallet Credited
  console.log('\n--- Step 7: Verify Wallet Balances Credited ---');
  const creditedBalance = await getWalletBalance(orgId, testEnv);
  assertEqual(creditedBalance.paid_balance, 6000.0, 'Paid balance credited with exactly RM 6,000.00');
  assertEqual(creditedBalance.topup_credit, 300.0, 'Top-up reward credited with exactly RM 300.00 (5% tier)');
  assertEqual(creditedBalance.total_balance, 6300.0, 'Total wallet balance is exactly RM 6,300.00');

  // Step 8: Verify Transaction Ledger Entries Created
  console.log('\n--- Step 8: Verify Audit Trail Transaction Ledger Created ---');
  const { transactions } = await getWalletTransactions(orgId, undefined, testEnv);
  assertEqual(transactions.length, 2, 'Exactly two ledger entries created (Deposit + Bonus)');

  const paidBalanceTxn = transactions.find((t) => t.balance_type === 'PAID_BALANCE');
  assertTrue(paidBalanceTxn !== undefined, 'PAID_BALANCE transaction exists in ledger');
  assertEqual(paidBalanceTxn?.amount, 6000.0, 'PAID_BALANCE transaction amount is RM 6,000.00');
  assertEqual(paidBalanceTxn?.transaction_type, 'TOPUP', 'PAID_BALANCE transaction type is TOPUP');

  const topupCreditTxn = transactions.find((t) => t.balance_type === 'TOPUP_CREDIT');
  assertTrue(topupCreditTxn !== undefined, 'TOPUP_CREDIT transaction exists in ledger');
  assertEqual(topupCreditTxn?.amount, 300.0, 'TOPUP_CREDIT transaction amount is RM 300.00');
  assertEqual(topupCreditTxn?.transaction_type, 'TOPUP_CREDIT', 'TOPUP_CREDIT transaction type is TOPUP_CREDIT');

  // Step 9: Replay / Duplicate Webhook Sent (Stripe Retry Simulation)
  console.log('\n--- Step 9: Duplicate Webhook Sent (Stripe Retry Simulation) ---');
  const duplicateWebhookRequest = new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signatureHeader,
    },
    body: rawBody,
  });

  const duplicateResponse = await worker.fetch(duplicateWebhookRequest, testEnv);
  assertEqual(duplicateResponse.status, 200, 'Duplicate webhook returns HTTP 200 OK');

  const duplicateJson = (await duplicateResponse.json()) as any;
  assertEqual(duplicateJson.received, true, 'Duplicate acknowledged (received: true)');
  assertEqual(duplicateJson.success, true, 'Duplicate success is true');
  assertEqual(duplicateJson.isDuplicate, true, 'Duplicate webhook correctly flagged (isDuplicate: true)');
  assertEqual(duplicateJson.status, 'PAID', 'Duplicate webhook returns status PAID');
  assertTrue(
    duplicateJson.message?.includes('already PAID') || duplicateJson.message?.includes('idempotent'),
    'Duplicate message explicitly identifies idempotent replay'
  );

  // Step 10: Verify ZERO Duplicate Credit
  console.log('\n--- Step 10: Verify ZERO Duplicate Credit ---');
  const balanceAfterReplay = await getWalletBalance(orgId, testEnv);
  assertEqual(balanceAfterReplay.paid_balance, 6000.0, 'Paid balance remains strictly RM 6,000.00 after duplicate');
  assertEqual(balanceAfterReplay.topup_credit, 300.0, 'Top-up credit remains strictly RM 300.00 after duplicate');
  assertEqual(balanceAfterReplay.total_balance, 6300.0, 'Total balance remains strictly RM 6,300.00 after duplicate');

  const txnsAfterReplay = await getWalletTransactions(orgId, undefined, testEnv);
  assertEqual(txnsAfterReplay.transactions.length, 2, 'Transaction ledger count remains strictly 2 (ZERO extra transactions)');

  // Step 11: Security Edge Cases & Defense Verification
  console.log('\n--- Step 11: Security Defense Verification ---');

  // 11a: Tampered Amount (e.g. Attacker sends 100 cents instead of 600000 cents)
  const tamperedOrder = await createTopupOrder(
    {
      organizationId: orgId,
      userId,
      amount: 5000.0,
      currency: 'MYR',
    },
    testEnv
  );

  const tamperedAmountPayload = {
    ...stripePayload,
    id: `evt_tampered_${crypto.randomUUID()}`,
    data: {
      object: {
        ...stripePayload.data.object,
        id: `cs_tampered_${crypto.randomUUID()}`,
        amount_total: 100, // 1.00 MYR instead of 5,000.00 MYR
        metadata: {
          order_id: tamperedOrder.id,
          organization_id: orgId,
        },
      },
    },
  };
  const tamperedAmountBody = JSON.stringify(tamperedAmountPayload);
  const { signatureHeader: tamperedAmountSig } = generateWebhookSignature(tamperedAmountBody, testWebhookSecret);

  const tamperedAmountReq = new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': tamperedAmountSig,
    },
    body: tamperedAmountBody,
  });
  const tamperedAmountRes = await worker.fetch(tamperedAmountReq, testEnv);
  assertEqual(tamperedAmountRes.status, 422, 'Amount tampering strictly rejected with HTTP 422');
  const tamperedAmountData = (await tamperedAmountRes.json()) as any;
  assertEqual(tamperedAmountData.code, 'AMOUNT_MISMATCH', 'Error code is AMOUNT_MISMATCH');

  // 11b: Forged Signature Rejection
  const forgedSigReq = new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': `t=${eventTimestamp},v1=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbad`,
    },
    body: rawBody,
  });
  const forgedSigRes = await worker.fetch(forgedSigReq, testEnv);
  assertEqual(forgedSigRes.status, 400, 'Forged signature strictly rejected with HTTP 400');
  const forgedSigData = (await forgedSigRes.json()) as any;
  assertEqual(forgedSigData.code, 'INVALID_SIGNATURE', 'Error code is INVALID_SIGNATURE');

  // 11c: Missing Secret Rejection (Configuration Safety)
  const noSecretEnv = { ...testEnv, PAYMENT_WEBHOOK_SECRET: undefined };
  // Temporarily clear process.env as well
  const savedSecret = process.env.PAYMENT_WEBHOOK_SECRET;
  delete process.env.PAYMENT_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;

  const noSecretReq = new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signatureHeader,
    },
    body: rawBody,
  });
  const noSecretRes = await worker.fetch(noSecretReq, noSecretEnv);
  assertEqual(noSecretRes.status, 500, 'Missing PAYMENT_WEBHOOK_SECRET strictly returns HTTP 500');
  const noSecretData = (await noSecretRes.json()) as any;
  assertEqual(noSecretData.code, 'MISSING_WEBHOOK_SECRET', 'Error code is MISSING_WEBHOOK_SECRET');

  // Restore process.env
  process.env.PAYMENT_WEBHOOK_SECRET = savedSecret;

  // 11d: Stale Timestamp Rejection (> 300 seconds tolerance)
  const staleTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
  const { signatureHeader: staleSig } = generateWebhookSignature(rawBody, testWebhookSecret, staleTimestamp);
  const staleReq = new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': staleSig,
    },
    body: rawBody,
  });
  const staleRes = await worker.fetch(staleReq, testEnv);
  assertEqual(staleRes.status, 400, 'Stale webhook timestamp (> 300s) strictly rejected with HTTP 400');
  const staleData = (await staleRes.json()) as any;
  assertEqual(staleData.code, 'INVALID_SIGNATURE', 'Stale signature returns INVALID_SIGNATURE');

  // 11e: Currency Mismatch Rejection
  const badCurrencyOrder = await createTopupOrder(
    {
      organizationId: orgId,
      userId,
      amount: 1000.0,
      currency: 'MYR',
    },
    testEnv
  );
  const badCurrencyPayload = {
    ...stripePayload,
    id: `evt_bad_curr_${crypto.randomUUID()}`,
    data: {
      object: {
        ...stripePayload.data.object,
        id: `cs_bad_curr_${crypto.randomUUID()}`,
        currency: 'usd', // Attacker sent USD instead of MYR
        amount_total: 100000,
        metadata: {
          order_id: badCurrencyOrder.id,
          organization_id: orgId,
        },
      },
    },
  };
  const badCurrencyBody = JSON.stringify(badCurrencyPayload);
  const { signatureHeader: badCurrencySig } = generateWebhookSignature(badCurrencyBody, testWebhookSecret);
  const badCurrencyReq = new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': badCurrencySig,
    },
    body: badCurrencyBody,
  });
  const badCurrencyRes = await worker.fetch(badCurrencyReq, testEnv);
  assertEqual(badCurrencyRes.status, 422, 'Currency mismatch strictly rejected with HTTP 422');
  const badCurrencyData = (await badCurrencyRes.json()) as any;
  assertEqual(badCurrencyData.code, 'CURRENCY_MISMATCH', 'Error code is CURRENCY_MISMATCH');

  // 11f: Organization Mismatch Rejection
  const otherOrgId = crypto.randomUUID();
  const badOrgPayload = {
    ...stripePayload,
    id: `evt_bad_org_${crypto.randomUUID()}`,
    data: {
      object: {
        ...stripePayload.data.object,
        id: `cs_bad_org_${crypto.randomUUID()}`,
        amount_total: 100000,
        metadata: {
          order_id: badCurrencyOrder.id,
          organization_id: otherOrgId, // Cross-tenant spoof attempt
        },
      },
    },
  };
  const badOrgBody = JSON.stringify(badOrgPayload);
  const { signatureHeader: badOrgSig } = generateWebhookSignature(badOrgBody, testWebhookSecret);
  const badOrgReq = new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': badOrgSig,
    },
    body: badOrgBody,
  });
  const badOrgRes = await worker.fetch(badOrgReq, testEnv);
  assertEqual(badOrgRes.status, 403, 'Organization mismatch strictly rejected with HTTP 403');
  const badOrgData = (await badOrgRes.json()) as any;
  assertEqual(badOrgData.code, 'ORGANIZATION_MISMATCH', 'Error code is ORGANIZATION_MISMATCH');

  console.log('\n======================================================');
  console.log(` STRIPE E2E RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    throw new Error(`Stripe E2E Test Suite failed with ${failed} failure(s)`);
  }
}

runStripeE2ETests().catch((err) => {
  console.error('Fatal test failure:', err);
  process.exit(1);
});
