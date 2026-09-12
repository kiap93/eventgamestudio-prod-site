/**
 * Integration Test: "Customer Pays But Webhook Arrives Late" Scenario
 * 
 * Flow under test:
 *   1. Customer creates top-up order for RM6,000 (qualifies for 5% = RM300 promo credit).
 *   2. Order is created with initial status = 'PENDING'.
 *   3. Wallet balance remains RM0.00 (Zero pre-credit on PENDING creation).
 *   4. Customer pays on Stripe; Stripe redirects browser back to Event Game Studio:
 *      GET /wallet/top-up?order_id=...&session_id=...&status=success
 *   5. Webhook is delayed (10–30s in flight).
 *   6. The backend receives the redirect with status=success, BUT does NOT trust it.
 *      Order remains 'PENDING' and wallet remains RM0.00.
 *   7. Browser refresh during pending window:
 *      Customer refreshes the page. Frontend polls again with status=success.
 *      Order STILL remains 'PENDING' and wallet remains RM0.00.
 *   8. Webhook finally arrives after delay:
 *      Signed webhook payload is delivered and processed by verifyAndProcessPaymentWebhook.
 *      Order status transitions to 'PAID'.
 *      Wallet is credited with RM6,000 paid_balance and RM300 topup_credit.
 *   9. Poller / next browser refresh checks order:
 *      Backend returns 'PAID'. Frontend transitions to PAID celebration screen.
 *  10. Duplicate / replayed webhook delivery:
 *      Idempotency protects ledger; balances are NOT doubled.
 */

import crypto from 'node:crypto';
import { getSupabaseServerClient } from '../supabase.js';
import {
  createTopupOrder,
  getTopupOrderById,
  getWalletBalance,
  getWalletTransactions,
  toCents,
} from './wallet.js';
import {
  verifyAndProcessPaymentWebhook,
  syncTopupOrderExpiration,
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
      name: `Test Org Late Webhook ${orgId.slice(0, 8)}`,
      slug: `test-org-late-${orgId.slice(0, 8)}`,
    });
  }
}

async function runLateWebhookTests() {
  console.log('===============================================================');
  console.log('TEST SUITE: CUSTOMER PAYS BUT WEBHOOK ARRIVES LATE (10-30S)');
  console.log('===============================================================');

  const testOrgId = crypto.randomUUID();
  const testUserId = crypto.randomUUID();
  await ensureTestOrg(testOrgId);

  // -------------------------------------------------------------------------
  // STEP 1: Customer creates top-up order for RM6,000
  // -------------------------------------------------------------------------
  console.log('\n--- Step 1: Customer Creates Top-up Order (RM6,000) ---');

  const orderAmount = 6000.00;
  const expectedPromoBonus = 300.00; // 5% tier bonus

  const initialOrder = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: orderAmount,
    currency: 'MYR',
    notes: 'Order created for late webhook simulation',
  });

  assertEqual(initialOrder.status, 'PENDING', 'Initial order status is PENDING');
  assertEqual(initialOrder.top_up_amount, 6000.00, 'Order top_up_amount is RM6,000.00');
  assertEqual(initialOrder.expected_credit_amount, 300.00, 'Order expected_credit_amount is RM300.00');
  assertEqual(initialOrder.total_wallet_value, 6300.00, 'Total wallet value is RM6,300.00');

  // Verify wallet balance is 0.00 (Zero pre-credit before verified payment)
  const initialWallet = await getWalletBalance(testOrgId);
  assertEqual(initialWallet.paid_balance, 0.00, 'Wallet paid balance is RM0.00 before payment');
  assertEqual(initialWallet.topup_credit, 0.00, 'Wallet promotional credit is RM0.00 before payment');

  // -------------------------------------------------------------------------
  // STEP 2: Browser returns with status=success BEFORE webhook arrives
  // -------------------------------------------------------------------------
  console.log('\n--- Step 2: Customer Returns to EGS (Redirect status=success, Webhook In-Flight) ---');

  // Simulate endpoint syncTopupOrderExpiration with options.status = 'success'
  // as triggered by GET /api/organizations/:orgId/wallet/topup-orders/:orderId?status=success
  const syncedOrderAfterRedirect = await syncTopupOrderExpiration(initialOrder.id, {
    status: 'success',
  });

  assertEqual(syncedOrderAfterRedirect?.status, 'PENDING', 'Zero Trust: Order status remains PENDING despite status=success redirect parameter');

  // Verify wallet balance remains untouched
  const walletAfterRedirect = await getWalletBalance(testOrgId);
  assertEqual(walletAfterRedirect.paid_balance, 0.00, 'Wallet paid balance remains RM0.00 (no credit on unverified return)');
  assertEqual(walletAfterRedirect.topup_credit, 0.00, 'Wallet promotional credit remains RM0.00');

  // -------------------------------------------------------------------------
  // STEP 3: Customer refreshes the browser during the 10-30s pending window
  // -------------------------------------------------------------------------
  console.log('\n--- Step 3: Browser Refresh During Pending Period (10s later) ---');

  // Simulating F5 browser reload: frontend reads URL param status=success and queries order
  const syncedOrderAfterRefresh = await syncTopupOrderExpiration(initialOrder.id, {
    status: 'success',
  });

  assertEqual(syncedOrderAfterRefresh?.status, 'PENDING', 'Browser refresh retains PENDING status safely');

  const walletAfterRefresh = await getWalletBalance(testOrgId);
  assertEqual(walletAfterRefresh.paid_balance, 0.00, 'Wallet remains RM0.00 after page refresh');

  // -------------------------------------------------------------------------
  // STEP 4: Webhook arrives after 15-second delay
  // -------------------------------------------------------------------------
  console.log('\n--- Step 4: Webhook Arrives (Cryptographic Webhook Delivery) ---');

  const webhookSecret = 'whsec_test_secret_for_cryptographic_verification_key_12345';
  process.env.PAYMENT_WEBHOOK_SECRET = webhookSecret;

  const stripePaymentIntentId = `pi_test_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const webhookPayload = {
    id: `evt_test_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_test_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
        payment_intent: stripePaymentIntentId,
        payment_status: 'paid',
        amount_total: toCents(orderAmount),
        currency: 'myr',
        metadata: {
          order_id: initialOrder.id,
          organization_id: testOrgId,
        },
      },
    },
  };

  const rawBody = JSON.stringify(webhookPayload);
  const sigObj = generateWebhookSignature(rawBody, webhookSecret);

  const webhookResult = await verifyAndProcessPaymentWebhook({
    rawBody,
    signature: sigObj.signatureHeader,
    env: { PAYMENT_WEBHOOK_SECRET: webhookSecret },
  });

  assertEqual(webhookResult.success, true, 'Webhook processing succeeded');
  assertEqual(webhookResult.orderId, initialOrder.id, 'Webhook processed correct order ID');
  assertEqual(webhookResult.status, 'PAID', 'Webhook returned order status PAID');

  // -------------------------------------------------------------------------
  // STEP 5: Verify Wallet & Ledger are authoritatively updated
  // -------------------------------------------------------------------------
  console.log('\n--- Step 5: Authoritative Wallet Balances & Ledger Entries Post-Webhook ---');

  const settledOrder = await getTopupOrderById(initialOrder.id);
  assertEqual(settledOrder?.status, 'PAID', 'Order record in DB is now PAID');

  const walletPostWebhook = await getWalletBalance(testOrgId);
  assertEqual(walletPostWebhook.paid_balance, 6000.00, 'Wallet paid balance credited with RM6,000.00');
  assertEqual(walletPostWebhook.topup_credit, 300.00, 'Wallet topup credit credited with RM300.00 (5% bonus)');
  assertEqual(walletPostWebhook.total_balance, 6300.00, 'Total wallet balance is RM6,300.00');

  // Verify ledger transactions
  const txns = await getWalletTransactions(testOrgId);
  const paidTxn = txns.transactions.find((t) => t.balance_type === 'PAID_BALANCE' && t.transaction_type === 'TOPUP');
  const promoTxn = txns.transactions.find((t) => t.balance_type === 'TOPUP_CREDIT' && t.transaction_type === 'TOPUP_CREDIT');

  assertEqual(paidTxn !== undefined, true, 'PAID_BALANCE transaction recorded in immutable ledger');
  assertEqual(paidTxn?.amount, 6000.00, 'PAID_BALANCE transaction amount is RM6,000.00');
  assertEqual(promoTxn !== undefined, true, 'TOPUP_CREDIT transaction recorded in immutable ledger');
  assertEqual(promoTxn?.amount, 300.00, 'TOPUP_CREDIT transaction amount is RM300.00');

  // -------------------------------------------------------------------------
  // STEP 6: Customer refreshes page or poller checks status post-webhook
  // -------------------------------------------------------------------------
  console.log('\n--- Step 6: Customer Refreshes Page Post-Webhook ---');

  const orderAfterSettleRefresh = await syncTopupOrderExpiration(initialOrder.id, {
    status: 'success',
  });
  assertEqual(orderAfterSettleRefresh?.status, 'PAID', 'Page refresh post-webhook returns PAID immediately');

  // -------------------------------------------------------------------------
  // STEP 7: Duplicate / Delayed Webhook Replay Protection (Idempotency)
  // -------------------------------------------------------------------------
  console.log('\n--- Step 7: Duplicate / Replayed Webhook (Idempotency) ---');

  const duplicateResult = await verifyAndProcessPaymentWebhook({
    rawBody,
    signature: sigObj.signatureHeader,
    env: { PAYMENT_WEBHOOK_SECRET: webhookSecret },
  });

  assertEqual(duplicateResult.success, true, 'Duplicate webhook returns success');
  assertEqual(duplicateResult.status, 'PAID', 'Duplicate webhook keeps status PAID');

  const walletPostDuplicate = await getWalletBalance(testOrgId);
  assertEqual(walletPostDuplicate.paid_balance, 6000.00, 'Idempotent: Paid balance NOT duplicated (remains RM6,000.00)');
  assertEqual(walletPostDuplicate.topup_credit, 300.00, 'Idempotent: Promotional credit NOT duplicated (remains RM300.00)');

  console.log('\n===============================================================');
  console.log('ALL LATE-WEBHOOK & BROWSER REFRESH TESTS PASSED SUCCESSFULLY!');
  console.log('===============================================================');
}

runLateWebhookTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
