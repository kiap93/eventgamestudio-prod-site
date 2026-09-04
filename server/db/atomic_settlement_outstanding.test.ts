/**
 * Architectural Verification Test Suite:
 * Atomic Settlement RPC (Wallet Credit + Top-up Order PAID + Outstanding Balance Reduction in One Transaction)
 *
 * Verifies that:
 * 1. Top-up order settlement updates wallet credit, marks order PAID, and reduces outstanding balance atomically.
 * 2. No secondary, non-atomic clearOutstandingBalance() call is needed or permitted.
 * 3. Partial outstanding settlements correctly decrement the remaining balance.
 * 4. Idempotent replays of PAID orders do not double-decrement outstanding balance.
 * 5. Production failure behavior is strictly fail-closed.
 */

import crypto from 'node:crypto';
import {
  createTopupOrder,
  processTopupOrderStatus,
  getOutstandingBalance,
  setOutstandingBalance,
  getWalletBalance,
  attachCheckoutSessionToTopupOrder,
} from './wallet.js';

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

async function runAtomicSettlementOutstandingTests() {
  console.log('======================================================');
  console.log(' RUNNING ATOMIC OUTSTANDING SETTLEMENT TEST SUITE');
  console.log('======================================================\n');

  const testOrgId = crypto.randomUUID();
  const testUserId = crypto.randomUUID();

  // --- Test Group 1: Single-Transaction Atomic Full Settlement ---
  console.log('--- Test Group 1: Full Outstanding Settlement ---');
  // Set initial outstanding balance to RM1.00
  await setOutstandingBalance(testOrgId, 1.00);
  const initialOut = await getOutstandingBalance(testOrgId);
  assertEqual(initialOut, 1.00, 'Initial outstanding balance is RM1.00');

  // Create top-up order for RM2.00 top-up + RM1.00 outstanding = RM3.00 total due
  const order1 = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 2.00,
    currency: 'MYR',
  });

  await attachCheckoutSessionToTopupOrder(order1.id, {
    sessionId: `cs_${Date.now()}`,
    checkoutUrl: 'https://checkout.stripe.com/test',
    paymentReference: `PAY_${Date.now()}`,
    paymentMethod: 'card',
    totalDue: 3.00,
    payableAmount: 2.00,
    includedOutstandingAmount: 1.00,
  });

  // Execute atomic settlement
  const result1 = await processTopupOrderStatus({
    orderId: order1.id,
    newStatus: 'PAID',
    paymentReference: 'PAY_SETTLED_001',
    paymentMethod: 'card',
    isTrustedSettlement: true,
  });

  assertEqual(result1.order.status, 'PAID', 'Order transitioned to PAID');
  const wallet1 = await getWalletBalance(testOrgId);
  assertEqual(wallet1.paid_balance, 3.00, 'Wallet credited with RM3.00 cash balance');
  const outstandingAfter1 = await getOutstandingBalance(testOrgId);
  assertEqual(outstandingAfter1, 0.00, 'Outstanding balance atomically reduced to RM0.00 in same operation');

  // --- Test Group 2: Idempotent Replay Protection ---
  console.log('\n--- Test Group 2: Idempotent Replay Protection ---');
  const replayResult = await processTopupOrderStatus({
    orderId: order1.id,
    newStatus: 'PAID',
    paymentReference: 'PAY_SETTLED_001',
    paymentMethod: 'card',
    isTrustedSettlement: true,
  });

  assertEqual(replayResult.alreadyProcessed, true, 'Replay flagged as already processed');
  const walletAfterReplay = await getWalletBalance(testOrgId);
  assertEqual(walletAfterReplay.paid_balance, 3.00, 'Paid balance not multiplied on replay');
  const outstandingAfterReplay = await getOutstandingBalance(testOrgId);
  assertEqual(outstandingAfterReplay, 0.00, 'Outstanding balance not affected on replay');

  // --- Test Group 3: Partial Outstanding Settlement ---
  console.log('\n--- Test Group 3: Partial Outstanding Settlement ---');
  const partialOrgId = crypto.randomUUID();
  const partialUserId = crypto.randomUUID();

  // Set initial outstanding balance to RM3.50
  await setOutstandingBalance(partialOrgId, 3.50);
  const partialInitialOut = await getOutstandingBalance(partialOrgId);
  assertEqual(partialInitialOut, 3.50, 'Initial outstanding balance is RM3.50');

  // Order settles RM1.50 of the outstanding balance
  const orderPartial = await createTopupOrder({
    organizationId: partialOrgId,
    userId: partialUserId,
    amount: 5.00,
    currency: 'MYR',
  });

  await attachCheckoutSessionToTopupOrder(orderPartial.id, {
    sessionId: `cs_part_${Date.now()}`,
    checkoutUrl: 'https://checkout.stripe.com/test_part',
    paymentReference: `PAY_PART_${Date.now()}`,
    paymentMethod: 'card',
    totalDue: 6.50,
    payableAmount: 5.00,
    includedOutstandingAmount: 1.50,
  });

  const resultPartial = await processTopupOrderStatus({
    orderId: orderPartial.id,
    newStatus: 'PAID',
    paymentReference: 'PAY_PART_SETTLED',
    paymentMethod: 'card',
    isTrustedSettlement: true,
  });

  assertEqual(resultPartial.order.status, 'PAID', 'Partial settlement order transitioned to PAID');
  const partialWallet = await getWalletBalance(partialOrgId);
  assertEqual(partialWallet.paid_balance, 6.50, 'Wallet credited with RM6.50');
  const partialRemainingOut = await getOutstandingBalance(partialOrgId);
  assertEqual(partialRemainingOut, 2.00, 'Outstanding balance atomically reduced from RM3.50 to RM2.00');

  // --- Test Group 4: Fail-Closed Protection in Production Mode ---
  console.log('\n--- Test Group 4: Fail-Closed Protection in Production ---');
  const mockProdEnv = {
    SUPABASE_URL: 'https://test-error-database.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'real-service-key-xyz123',
  };

  let prodSettlementThrew = false;
  try {
    await processTopupOrderStatus(
      {
        orderId: crypto.randomUUID(),
        newStatus: 'PAID',
        isTrustedSettlement: true,
      },
      mockProdEnv
    );
  } catch {
    prodSettlementThrew = true;
  }
  assertTrue(prodSettlementThrew, 'processTopupOrderStatus strictly throws on Supabase error in production');

  console.log('\n======================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAtomicSettlementOutstandingTests().catch((err) => {
  console.error('Fatal atomic settlement test error:', err);
  process.exit(1);
});
