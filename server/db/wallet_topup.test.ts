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
