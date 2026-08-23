/**
 * Server-Side Tests for Wallet Top-up Engine & Promotional Tier Calculations
 * 
 * Test Scenarios:
 * 1. Tier Boundary Tests:
 *    - RM5,999.00 -> 0% (RM0.00)
 *    - RM6,000.00 -> 5% (RM300.00)
 *    - RM6,001.00 -> 5% (RM300.05)
 *    - RM9,999.00 -> 5% (RM499.95)
 *    - RM10,000.00 -> 7% (RM700.00)
 *    - RM10,001.00 -> 7% (RM700.07)
 * 2. Example Amounts:
 *    - RM600.00 -> RM0.00
 *    - RM2,000.00 -> RM0.00
 *    - RM8,000.00 -> RM400.00
 *    - RM20,000.00 -> RM1,400.00
 * 3. Independent Calculation / Non-aggregation Test:
 *    - RM3,000 + RM3,000 does NOT grant 5%
 * 4. Idempotency & Webhook Protection:
 *    - Duplicate reference_id does not double-credit
 * 5. Ledger Immutability & Separate Balance Types:
 *    - TOPUP (PAID_BALANCE) and TOPUP_CREDIT (TOPUP_CREDIT) recorded separately
 */

import crypto from 'node:crypto';
import { getSupabaseServerClient } from '../supabase.js';
import {
  calculateTopupCredit,
  toCents,
  fromCents,
  createTopup,
  getWalletBalance,
  recalculateWalletBalances,
  createTopupOrder,
  getTopupOrderById,
  listTopupOrdersByOrganization,
  processTopupOrderStatus,
  preparePendingTopupOrder,
  getPendingTopupOrder,
  getWalletTransactions,
} from './wallet.js';

let passed = 0;
let failed = 0;

async function ensureTestOrg(orgId: string) {
  const supabase = getSupabaseServerClient();
  try {
    await supabase.from('organizations').upsert({
      id: orgId,
      name: `Test Org ${orgId.slice(0, 8)}`,
      slug: `test-org-${orgId.slice(0, 8)}`,
      owner_id: '6de8515d-cd56-4ef8-80f0-3d5f34fa291e',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Ignore in local mode
  }
}

function assertEqual(actual: any, expected: any, testName: string) {
  if (actual === expected) {
    console.log(`  ✓ PASS: ${testName} (expected ${expected}, got ${actual})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - Expected ${expected}, got ${actual}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log(' RUNNING WALLET TOP-UP ENGINE TEST SUITE');
  console.log('======================================================\n');

  // ----------------------------------------------------
  // TEST GROUP 1: CENTS MONEY ARITHMETIC PRECISION
  // ----------------------------------------------------
  console.log('--- Test Group 1: Decimal & Cents Math Precision ---');
  assertEqual(toCents(1400.00), 140000, 'toCents(1400.00) = 140000');
  assertEqual(toCents(5999.00), 599900, 'toCents(5999.00) = 599900');
  assertEqual(toCents(6000.00), 600000, 'toCents(6000.00) = 600000');
  assertEqual(toCents(6001.00), 600100, 'toCents(6001.00) = 600100');
  assertEqual(toCents(9999.00), 999900, 'toCents(9999.00) = 999900');
  assertEqual(toCents(10000.00), 1000000, 'toCents(10000.00) = 1000000');
  assertEqual(toCents(10001.00), 1000100, 'toCents(10001.00) = 1000100');
  assertEqual(fromCents(30005), 300.05, 'fromCents(30005) = 300.05');
  assertEqual(fromCents(70007), 700.07, 'fromCents(70007) = 700.07');

  // ----------------------------------------------------
  // TEST GROUP 2: TIER BOUNDARY CALCULATIONS
  // ----------------------------------------------------
  console.log('\n--- Test Group 2: Mandatory Tier Boundary Tests ---');

  // RM5,999.00 -> 0%
  assertEqual(
    calculateTopupCredit(5999.00),
    0.00,
    'RM5,999.00 -> 0% promo credit (RM0.00)'
  );

  // RM6,000.00 -> 5%
  assertEqual(
    calculateTopupCredit(6000.00),
    300.00,
    'RM6,000.00 -> 5% promo credit (RM300.00)'
  );

  // RM6,001.00 -> 5%
  assertEqual(
    calculateTopupCredit(6001.00),
    300.05,
    'RM6,001.00 -> 5% promo credit (RM300.05)'
  );

  // RM9,999.00 -> 5%
  assertEqual(
    calculateTopupCredit(9999.00),
    499.95,
    'RM9,999.00 -> 5% promo credit (RM499.95)'
  );

  // RM10,000.00 -> 7%
  assertEqual(
    calculateTopupCredit(10000.00),
    700.00,
    'RM10,000.00 -> 7% promo credit (RM700.00)'
  );

  // RM10,001.00 -> 7%
  assertEqual(
    calculateTopupCredit(10001.00),
    700.07,
    'RM10,001.00 -> 7% promo credit (RM700.07)'
  );

  // ----------------------------------------------------
  // TEST GROUP 3: BUSINESS EXAMPLES
  // ----------------------------------------------------
  console.log('\n--- Test Group 3: Business Model Specified Examples ---');

  assertEqual(calculateTopupCredit(600.00), 0.00, 'RM600 -> RM0 credit');
  assertEqual(calculateTopupCredit(2000.00), 0.00, 'RM2,000 -> RM0 credit');
  assertEqual(calculateTopupCredit(8000.00), 400.00, 'RM8,000 -> RM400 credit');
  assertEqual(calculateTopupCredit(20000.00), 1400.00, 'RM20,000 -> RM1,400 credit');

  // ----------------------------------------------------
  // TEST GROUP 4: NON-AGGREGATION & INDEPENDENT TOP-UPS
  // ----------------------------------------------------
  console.log('\n--- Test Group 4: Non-Aggregation & Independence Test ---');

  const testOrgId = crypto.randomUUID();
  await ensureTestOrg(testOrgId);

  // Top up 1: RM3,000
  const topup1 = await createTopup({
    organizationId: testOrgId,
    amount: 3000.00,
    referenceId: `ref_sub_1_${Date.now()}`,
    description: 'First split top-up of RM3,000',
  });
  assertEqual(topup1.topupTransaction.amount, 3000.00, 'Top-up 1 paid amount is RM3,000');
  assertEqual(topup1.promoCreditTransaction, null, 'Top-up 1 qualifies for RM0 promo credit');

  // Top up 2: RM3,000
  const topup2 = await createTopup({
    organizationId: testOrgId,
    amount: 3000.00,
    referenceId: `ref_sub_2_${Date.now()}`,
    description: 'Second split top-up of RM3,000',
  });
  assertEqual(topup2.topupTransaction.amount, 3000.00, 'Top-up 2 paid amount is RM3,000');
  assertEqual(topup2.promoCreditTransaction, null, 'Top-up 2 qualifies for RM0 promo credit');

  // Check resulting wallet: Paid Balance = 6000, Topup Credit = 0 (NOT 300!)
  const walletAfterSplit = await getWalletBalance(testOrgId);
  assertEqual(walletAfterSplit.paid_balance, 6000.00, 'Cumulative Paid Balance = RM6,000.00');
  assertEqual(walletAfterSplit.topup_credit, 0.00, 'Top-up credit remains RM0.00 (No aggregation)');

  // ----------------------------------------------------
  // TEST GROUP 5: FULL TIER-2 TOP-UP & IDEMPOTENCY
  // ----------------------------------------------------
  console.log('\n--- Test Group 5: Tier-2 Top-up & Webhook Idempotency ---');

  const testOrgTier2 = crypto.randomUUID();
  await ensureTestOrg(testOrgTier2);
  const webhookRef = `wh_stripe_charge_${Date.now()}`;

  // Process RM10,000 topup
  const initialTopupResult = await createTopup({
    organizationId: testOrgTier2,
    amount: 10000.00,
    referenceId: webhookRef,
    description: 'Stripe Checkout RM10,000',
  });

  assertEqual(initialTopupResult.topupTransaction.amount, 10000.00, 'Paid balance record = RM10,000');
  assertEqual(initialTopupResult.topupTransaction.balance_type, 'PAID_BALANCE', 'Balance type is PAID_BALANCE');
  assertEqual(initialTopupResult.promoCreditTransaction?.amount, 700.00, 'Promotional credit record = RM700');
  assertEqual(initialTopupResult.promoCreditTransaction?.balance_type, 'TOPUP_CREDIT', 'Balance type is TOPUP_CREDIT');
  assertEqual(initialTopupResult.wallet.paid_balance, 10000.00, 'Wallet paid balance = RM10,000');
  assertEqual(initialTopupResult.wallet.topup_credit, 700.00, 'Wallet topup credit = RM700');

  // Duplicate webhook / repeat request with same referenceId
  const duplicateWebhookResult = await createTopup({
    organizationId: testOrgTier2,
    amount: 10000.00,
    referenceId: webhookRef,
    description: 'Duplicate Webhook Delivery',
  });

  assertEqual(
    duplicateWebhookResult.topupTransaction.id,
    initialTopupResult.topupTransaction.id,
    'Idempotent: Duplicate webhook returns original transaction ID'
  );
  assertEqual(
    duplicateWebhookResult.wallet.paid_balance,
    10000.00,
    'Idempotent: Paid balance NOT duplicated (remains RM10,000)'
  );
  assertEqual(
    duplicateWebhookResult.wallet.topup_credit,
    700.00,
    'Idempotent: Promotional credit NOT duplicated (remains RM700)'
  );

  // ----------------------------------------------------
  // TEST GROUP 6: TOP-UP ORDER CREATION (PENDING) & ZERO PRE-CREDIT
  // ----------------------------------------------------
  console.log('\n--- Test Group 6: Top-up Order Creation & Zero Pre-Credit ---');

  const testOrgPhase3 = crypto.randomUUID();
  await ensureTestOrg(testOrgPhase3);
  const testUserId = '6de8515d-cd56-4ef8-80f0-3d5f34fa291e';

  // 1. Create RM6,000 order (Qualifies for 5% = RM300 expected credit)
  const order6k = await createTopupOrder({
    organizationId: testOrgPhase3,
    userId: testUserId,
    amount: 6000.00,
    currency: 'MYR',
    notes: 'Order for 6k topup',
  });

  assertEqual(order6k.status, 'PENDING', 'Order 6k initial status is PENDING');
  assertEqual(order6k.top_up_amount, 6000.00, 'Order 6k top_up_amount is RM6,000.00');
  assertEqual(order6k.expected_credit_amount, 300.00, 'Order 6k expected_credit_amount is RM300.00');
  assertEqual(order6k.bonus_percentage, 5.00, 'Order 6k bonus_percentage is 5%');
  assertEqual(order6k.total_wallet_value, 6300.00, 'Order 6k total_wallet_value is RM6,300.00');

  // Verify wallet is still 0 (No pre-credit on PENDING!)
  const walletBeforePaid = await getWalletBalance(testOrgPhase3);
  assertEqual(walletBeforePaid.paid_balance, 0.00, 'Wallet paid balance remains RM0.00 on PENDING creation');
  assertEqual(walletBeforePaid.topup_credit, 0.00, 'Wallet topup credit remains RM0.00 on PENDING creation');

  // ----------------------------------------------------
  // TEST GROUP 7: TOP-UP ORDER ATOMIC SETTLEMENT (PENDING -> PAID)
  // ----------------------------------------------------
  console.log('\n--- Test Group 7: Top-up Order Settlement (PENDING -> PAID) ---');

  const settle6kResult = await processTopupOrderStatus({
    orderId: order6k.id,
    newStatus: 'PAID',
    paymentReference: 'PAY_REF_6K_001',
    paymentMethod: 'fpx',
    reason: 'Payment gateway confirmation',
    isTrustedSettlement: true,
  });

  assertEqual(settle6kResult.order.status, 'PAID', 'Order status transitioned to PAID');
  assertEqual(settle6kResult.alreadyProcessed, false, 'First-time settlement alreadyProcessed is false');
  assertEqual(settle6kResult.ledgerResult?.wallet.paid_balance, 6000.00, 'Wallet paid balance credited with RM6,000.00');
  assertEqual(settle6kResult.ledgerResult?.wallet.topup_credit, 300.00, 'Wallet topup credit credited with RM300.00');

  // Verify ledger transactions
  const txnsAfter6k = await getWalletTransactions(testOrgPhase3);
  const paidTxn = txnsAfter6k.transactions.find((t) => t.balance_type === 'PAID_BALANCE' && t.transaction_type === 'TOPUP');
  const promoTxn = txnsAfter6k.transactions.find((t) => t.balance_type === 'TOPUP_CREDIT' && t.transaction_type === 'TOPUP_CREDIT');

  assertEqual(paidTxn !== undefined, true, 'Paid balance transaction recorded in ledger');
  assertEqual(paidTxn?.amount, 6000.00, 'Paid balance transaction amount is RM6,000.00');
  assertEqual(promoTxn !== undefined, true, 'Promotional credit transaction recorded in ledger');
  assertEqual(promoTxn?.amount, 300.00, 'Promotional credit transaction amount is RM300.00');

  // ----------------------------------------------------
  // TEST GROUP 8: IDEMPOTENCY OF PAID ORDER REPROCESSING
  // ----------------------------------------------------
  console.log('\n--- Test Group 8: Idempotency of Paid Order Reprocessing ---');

  const replayResult = await processTopupOrderStatus({
    orderId: order6k.id,
    newStatus: 'PAID',
    paymentReference: 'PAY_REF_6K_001_DUPLICATE',
    reason: 'Duplicate webhook event',
    isTrustedSettlement: true,
  });

  assertEqual(replayResult.alreadyProcessed, true, 'Replay of PAID order returns alreadyProcessed = true');
  assertEqual(replayResult.order.status, 'PAID', 'Replay keeps status as PAID');

  const walletAfterReplay = await getWalletBalance(testOrgPhase3);
  assertEqual(walletAfterReplay.paid_balance, 6000.00, 'Wallet paid balance NOT doubled (remains RM6,000.00)');
  assertEqual(walletAfterReplay.topup_credit, 300.00, 'Wallet topup credit NOT doubled (remains RM300.00)');

  // ----------------------------------------------------
  // TEST GROUP 9: NON-PAID TRANSITIONS (FAILED, EXPIRED, CANCELLED)
  // ----------------------------------------------------
  console.log('\n--- Test Group 9: Non-PAID Status Transitions ---');

  // A. Failed Order
  const orderFailed = await createTopupOrder({
    organizationId: testOrgPhase3,
    userId: testUserId,
    amount: 1000.00,
    currency: 'MYR',
    notes: 'Will fail',
  });
  const failResult = await processTopupOrderStatus({
    orderId: orderFailed.id,
    newStatus: 'FAILED',
    reason: 'Insufficient funds on user card',
  });
  assertEqual(failResult.order.status, 'FAILED', 'Order successfully marked as FAILED');
  assertEqual(failResult.alreadyProcessed, false, 'Failed processing flag is false');

  // B. Expired Order
  const orderExpired = await createTopupOrder({
    organizationId: testOrgPhase3,
    userId: testUserId,
    amount: 2000.00,
    currency: 'MYR',
    notes: 'Will expire',
  });
  const expireResult = await processTopupOrderStatus({
    orderId: orderExpired.id,
    newStatus: 'EXPIRED',
    reason: '24-hour checkout window elapsed',
  });
  assertEqual(expireResult.order.status, 'EXPIRED', 'Order successfully marked as EXPIRED');

  // C. Cancelled Order
  const orderCancelled = await createTopupOrder({
    organizationId: testOrgPhase3,
    userId: testUserId,
    amount: 3000.00,
    currency: 'MYR',
    notes: 'Will cancel',
  });
  const cancelResult = await processTopupOrderStatus({
    orderId: orderCancelled.id,
    newStatus: 'CANCELLED',
    reason: 'User cancelled at checkout',
  });
  assertEqual(cancelResult.order.status, 'CANCELLED', 'Order successfully marked as CANCELLED');

  // Verify wallet balances were untouched by FAILED, EXPIRED, CANCELLED
  const walletAfterNonPaid = await getWalletBalance(testOrgPhase3);
  assertEqual(walletAfterNonPaid.paid_balance, 6000.00, 'Wallet paid balance unchanged after failed/expired/cancelled orders');
  assertEqual(walletAfterNonPaid.topup_credit, 300.00, 'Wallet topup credit unchanged after failed/expired/cancelled orders');

  // ----------------------------------------------------
  // TEST GROUP 10: STATE MACHINE TERMINAL STATE PROTECTION
  // ----------------------------------------------------
  console.log('\n--- Test Group 10: State Machine Terminal State Protection ---');

  // 1. Cannot transition PAID order to CANCELLED
  let paidToCancelledError = false;
  try {
    await processTopupOrderStatus({
      orderId: order6k.id,
      newStatus: 'CANCELLED',
    });
  } catch (err: any) {
    paidToCancelledError = true;
    assertEqual(err.message.includes('Cannot change status of an already PAID'), true, 'Error message identifies invalid transition from PAID');
  }
  assertEqual(paidToCancelledError, true, 'PAID -> CANCELLED transition strictly rejected');

  // 2. Cannot transition FAILED order to PAID
  let failedToPaidError = false;
  try {
    await processTopupOrderStatus({
      orderId: orderFailed.id,
      newStatus: 'PAID',
      isTrustedSettlement: true,
    });
  } catch (err: any) {
    failedToPaidError = true;
    assertEqual(err.message.includes('Cannot change status of a FAILED'), true, 'Error message identifies invalid transition from FAILED');
  }
  assertEqual(failedToPaidError, true, 'FAILED -> PAID transition strictly rejected');

  // 3. Cannot transition EXPIRED order to PAID
  let expiredToPaidError = false;
  try {
    await processTopupOrderStatus({
      orderId: orderExpired.id,
      newStatus: 'PAID',
      isTrustedSettlement: true,
    });
  } catch (err: any) {
    expiredToPaidError = true;
    assertEqual(err.message.includes('Cannot change status of a EXPIRED'), true, 'Error message identifies invalid transition from EXPIRED');
  }
  assertEqual(expiredToPaidError, true, 'EXPIRED -> PAID transition strictly rejected');

  // 4. Cannot transition CANCELLED order to PAID
  let cancelledToPaidError = false;
  try {
    await processTopupOrderStatus({
      orderId: orderCancelled.id,
      newStatus: 'PAID',
      isTrustedSettlement: true,
    });
  } catch (err: any) {
    cancelledToPaidError = true;
    assertEqual(err.message.includes('Cannot change status of a CANCELLED'), true, 'Error message identifies invalid transition from CANCELLED');
  }
  assertEqual(cancelledToPaidError, true, 'CANCELLED -> PAID transition strictly rejected');

  // ----------------------------------------------------
  // TEST GROUP 11: LIST & RETRIEVE TOP-UP ORDERS
  // ----------------------------------------------------
  console.log('\n--- Test Group 11: List and Retrieve Top-up Orders ---');

  const fetchedOrder = await getTopupOrderById(order6k.id);
  assertEqual(fetchedOrder?.id, order6k.id, 'getTopupOrderById retrieves correct order');
  assertEqual(fetchedOrder?.status, 'PAID', 'Retrieved order has correct status');

  const allOrgOrders = await listTopupOrdersByOrganization(testOrgPhase3);
  assertEqual(allOrgOrders.length >= 4, true, 'listTopupOrdersByOrganization returns all created orders');

  console.log('\n======================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
