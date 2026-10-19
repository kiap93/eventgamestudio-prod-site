/**
 * Comprehensive Test Suite:
 * 1. Zero-Balance Credit Visibility and Exclusion
 * 2. Missing Showcase Reward Safe Repair & One-Time Lifetime Invariant
 * 3. Combined Credit Support (All Combinations) & Consistent Deduction Order
 */

import crypto from 'node:crypto';
import { getSupabaseServerClient } from '../supabase.js';
import { localOrgsCache } from './organizations.js';
import { localUsersCache } from './users.js';
import { localEventsCache } from './events.js';
import {
  createTopup,
  grantWelcomeCredit,
  grantShowcaseCredit,
  getWalletBalance,
  recalculateWalletBalances,
  calculateEventPayment,
  processEventPayment,
  repairMissingShowcaseRewardGrant,
  localTransactionsCache,
  localUserRewardsCache,
  localOwnerShowcaseRewardsCache,
  SHOWCASE_CREDIT_AMOUNT,
  STANDARD_EVENT_PRICE,
} from './wallet.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string, expected?: any, actual?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}` + (expected !== undefined ? ` (expected ${expected}, got ${actual})` : ''));
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}` + (expected !== undefined ? ` (expected ${expected}, got ${actual})` : ''));
    failed++;
  }
}

async function createTestUser(): Promise<string> {
  const supabase = getSupabaseServerClient();
  const id = crypto.randomUUID();
  const userRecord: any = {
    id,
    email: `test-${id.slice(0, 8)}@example.com`,
    name: `Test User ${id.slice(0, 6)}`,
    email_verified: true,
  };
  localUsersCache.set(id, userRecord);
  try {
    await supabase.from('users').insert(userRecord);
  } catch {}
  return id;
}

async function ensureTestOrg(orgId: string, ownerId?: string): Promise<string> {
  const supabase = getSupabaseServerClient();
  let validOwnerId = ownerId;
  if (!validOwnerId) {
    validOwnerId = await createTestUser();
  }
  const orgRecord: any = {
    id: orgId,
    name: `Test Org ${orgId.slice(0, 8)}`,
    slug: `test-org-${orgId.slice(0, 8)}`,
    owner_id: validOwnerId,
    country_code: 'MY',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  localOrgsCache.set(orgId, orgRecord);
  try {
    await supabase.from('organizations').upsert(orgRecord);
  } catch {}
  return validOwnerId;
}

async function ensureTestEvent(eventId: string, orgId: string, price: number = 1400.00) {
  const now = new Date().toISOString();
  const startDate = now.split('T')[0];
  const evRecord: any = {
    id: eventId,
    organization_id: orgId,
    game_id: 'catch-brand',
    game_theme_id: '9bfb95dc-383e-45fb-ac04-d3f75a6aa023',
    name: `Test Event ${eventId.slice(0, 8)}`,
    event_date: startDate,
    start_date: startDate,
    end_date: startDate,
    status: 'scheduled',
    event_status: 'SCHEDULED',
    payment_status: 'UNPAID',
    event_price: price,
    event_currency: 'MYR',
    created_at: now,
    updated_at: now,
  };
  localEventsCache.set(eventId, evRecord);
}

async function runTests() {
  console.log('========================================================================');
  console.log(' RUNNING CREDIT VISIBILITY & SHOWCASE REPAIR VERIFICATION SUITE');
  console.log('========================================================================');

  // -------------------------------------------------------------------------
  // Part 1: Missing Showcase Reward Safe Repair
  // -------------------------------------------------------------------------
  console.log('\n--- Part 1: Missing Showcase Reward Safe Repair ---');
  const ownerA = await createTestUser();
  const orgA1 = crypto.randomUUID();
  await ensureTestOrg(orgA1, ownerA);

  // Simulate an approved showcase entitlement existing in user_rewards, but NO transaction in wallet_transactions
  localUserRewardsCache.set(`${ownerA}:SHOWCASE_CREDIT`, {
    id: crypto.randomUUID(),
    user_id: ownerA,
    reward_type: 'SHOWCASE_CREDIT',
    organization_id: orgA1,
    amount: 300,
    created_at: new Date().toISOString(),
    metadata: {
      organization_id: orgA1,
      program: 'EVENT_SHOWCASE_APPROVED_REWARD',
    },
  });

  // Verify wallet balance BEFORE repair check
  // getWalletBalance should automatically detect the missing transaction and repair it
  const walletA1 = await getWalletBalance(orgA1);
  assert(walletA1.showcase_credit === 300.00, 'Org A1 showcase credit was safely repaired to RM300.00', 300, walletA1.showcase_credit);
  assert(walletA1.showcase_credit_granted === true, 'showcase_credit_granted flag is true', true, walletA1.showcase_credit_granted);

  // Check ledger transactions for Org A1
  const txnsA1 = Array.from(localTransactionsCache.values()).filter((t) => t.organization_id === orgA1);
  const showcaseTxnsA1 = txnsA1.filter((t) => t.transaction_type === 'SHOWCASE_CREDIT' && t.amount > 0);
  assert(showcaseTxnsA1.length === 1, 'Exactly ONE grant transaction exists for Org A1', 1, showcaseTxnsA1.length);
  assert(showcaseTxnsA1[0].balance_type === 'SHOWCASE_CREDIT', 'Grant transaction balance_type is SHOWCASE_CREDIT');
  assert(showcaseTxnsA1[0].status === 'COMPLETED', 'Grant transaction status is COMPLETED');
  assert(showcaseTxnsA1[0].amount === 300.00, 'Grant transaction amount is RM300.00', 300, showcaseTxnsA1[0].amount);

  // Idempotency: Calling recalculateWalletBalances again must not create duplicates
  const walletA1Again = await recalculateWalletBalances(orgA1);
  assert(walletA1Again.showcase_credit === 300.00, 'Showcase credit remains RM300.00 after repeated recalculation', 300, walletA1Again.showcase_credit);
  const txnsA1After = Array.from(localTransactionsCache.values()).filter((t) => t.organization_id === orgA1 && t.transaction_type === 'SHOWCASE_CREDIT' && t.amount > 0);
  assert(txnsA1After.length === 1, 'No duplicate grant transaction created on recalculation', 1, txnsA1After.length);

  // Owner-level rule: Owner A creates a SECOND organization Org A2
  console.log('\n--- Part 1B: Owner-Level Invariant - Second Org Receives RM0 ---');
  const orgA2 = crypto.randomUUID();
  await ensureTestOrg(orgA2, ownerA);

  const walletA2 = await getWalletBalance(orgA2);
  assert(walletA2.showcase_credit === 0.00, 'Second organization Org A2 receives RM0 showcase credit', 0, walletA2.showcase_credit);
  assert(walletA2.showcase_credit_granted === false, 'Org A2 showcase_credit_granted is false', false, walletA2.showcase_credit_granted);

  // Attempting manual grant on Org A2 must be rejected
  const grantA2 = await grantShowcaseCredit({ organizationId: orgA2, ownerUserId: ownerA });
  assert(grantA2.alreadyGranted === true, 'Grant to Org A2 rejected as already granted to owner', true, grantA2.alreadyGranted);
  const walletA2After = await getWalletBalance(orgA2);
  assert(walletA2After.showcase_credit === 0.00, 'Org A2 showcase credit remains RM0.00', 0, walletA2After.showcase_credit);

  // -------------------------------------------------------------------------
  // Part 2: Spending Showcase Credit & Zero-Balance Non-Resurrection
  // -------------------------------------------------------------------------
  console.log('\n--- Part 2: Spending Showcase Credit & Zero-Balance Non-Resurrection ---');
  const eventA1 = crypto.randomUUID();
  await ensureTestEvent(eventA1, orgA1, 1400.00);

  // Top up RM1,100 so Org A1 has RM300 showcase + RM1,100 paid = RM1,400
  await createTopup({ organizationId: orgA1, amount: 1100.00, referenceId: `topup_a1_${Date.now()}` });

  const payA1 = await processEventPayment({
    organizationId: orgA1,
    eventId: eventA1,
    paymentMode: 'SHOWCASE_CREDIT',
    eventPrice: 1400.00,
    createdBy: ownerA,
  });
  assert(payA1.success === true, 'Event payment with Showcase Credit succeeded', true, payA1.success);

  // Now wallet showcase_credit is RM0.00
  const walletA1Spent = await getWalletBalance(orgA1);
  assert(walletA1Spent.showcase_credit === 0.00, 'Org A1 showcase credit spent down to RM0.00', 0, walletA1Spent.showcase_credit);

  // Critical rule: Wallet having zero balance must NEVER trigger a re-grant!
  const walletA1Recheck = await recalculateWalletBalances(orgA1);
  assert(walletA1Recheck.showcase_credit === 0.00, 'Zero balance does not resurrect or trigger a second grant', 0, walletA1Recheck.showcase_credit);

  // -------------------------------------------------------------------------
  // Part 3: Zero-Balance Credit Visibility and Calculation Options
  // -------------------------------------------------------------------------
  console.log('\n--- Part 3: Zero-Balance Credit Calculation & Options ---');
  const orgEmpty = crypto.randomUUID();
  await ensureTestOrg(orgEmpty);

  // When all credits are 0:
  const quoteEmpty = await calculateEventPayment(1400.00, 'FULL_PAID', orgEmpty);
  assert(quoteEmpty.availableBalances.welcome_credit === 0, 'Quote available welcome credit is 0', 0, quoteEmpty.availableBalances.welcome_credit);
  assert(quoteEmpty.availableBalances.showcase_credit === 0, 'Quote available showcase credit is 0', 0, quoteEmpty.availableBalances.showcase_credit);
  assert(quoteEmpty.availableBalances.topup_credit === 0, 'Quote available event credit is 0', 0, quoteEmpty.availableBalances.topup_credit);

  // -------------------------------------------------------------------------
  // Part 4: Combined Credit Payment Scenarios
  // -------------------------------------------------------------------------
  console.log('\n--- Part 4: Combined Credit Payment Scenarios ---');

  // Scenario 4A: Welcome Credit (RM800) + Showcase Credit (RM300) + Paid Balance (RM300) = RM1,400
  console.log('\nScenario 4A: Welcome (RM800) + Showcase (RM300) + Paid (RM300)');
  const ownerCombo1 = await createTestUser();
  const orgCombo1 = crypto.randomUUID();
  const eventCombo1 = crypto.randomUUID();
  await ensureTestOrg(orgCombo1, ownerCombo1);
  await ensureTestEvent(eventCombo1, orgCombo1, 1400.00);

  await grantWelcomeCredit({ organizationId: orgCombo1, userId: ownerCombo1 });
  await grantShowcaseCredit({ organizationId: orgCombo1, ownerUserId: ownerCombo1 });
  await createTopup({ organizationId: orgCombo1, amount: 300.00, referenceId: `topup_c1_${Date.now()}` });

  const calcCombo1 = await calculateEventPayment(1400.00, 'COMBINED_CREDIT', orgCombo1, {
    useWelcomeCredit: true,
    useShowcaseCredit: true,
  });
  assert(calcCombo1.welcomeCreditUsed === 800.00, 'Welcome credit used is RM800.00', 800, calcCombo1.welcomeCreditUsed);
  assert(calcCombo1.showcaseCreditUsed === 300.00, 'Showcase credit used is RM300.00', 300, calcCombo1.showcaseCreditUsed);
  assert(calcCombo1.totalDiscount === 1100.00, 'Total discount is RM1,100.00', 1100, calcCombo1.totalDiscount);
  assert(calcCombo1.paidAmount === 300.00, 'Paid amount is RM300.00', 300, calcCombo1.paidAmount);
  assert(calcCombo1.isPayable === true, 'Calculation is payable', true, calcCombo1.isPayable);

  const payCombo1 = await processEventPayment({
    organizationId: orgCombo1,
    eventId: eventCombo1,
    paymentMode: 'COMBINED_CREDIT',
    useWelcomeCredit: true,
    useShowcaseCredit: true,
    eventPrice: 1400.00,
    createdBy: ownerCombo1,
  });
  assert(payCombo1.success === true, 'Combined payment (Welcome + Showcase) succeeded', true, payCombo1.success);
  assert(payCombo1.paymentCalculation.welcomeCreditUsed === 800.00, 'Payment applied RM800 welcome credit', 800, payCombo1.paymentCalculation.welcomeCreditUsed);
  assert(payCombo1.paymentCalculation.showcaseCreditUsed === 300.00, 'Payment applied RM300 showcase credit', 300, payCombo1.paymentCalculation.showcaseCreditUsed);
  assert(payCombo1.paymentCalculation.paidAmount === 300.00, 'Payment applied RM300 paid balance', 300, payCombo1.paymentCalculation.paidAmount);

  const walletPostC1 = await getWalletBalance(orgCombo1);
  assert(walletPostC1.welcome_credit === 0.00, 'Remaining welcome credit is RM0.00', 0, walletPostC1.welcome_credit);
  assert(walletPostC1.showcase_credit === 0.00, 'Remaining showcase credit is RM0.00', 0, walletPostC1.showcase_credit);
  assert(walletPostC1.paid_balance === 0.00, 'Remaining paid balance is RM0.00', 0, walletPostC1.paid_balance);

  // Scenario 4B: Showcase Credit (RM300) + Top-up Credit (RM280, 20% cap) + Paid Balance (RM820) = RM1,400
  console.log('\nScenario 4B: Showcase (RM300) + Top-up (RM280) + Paid (RM820)');
  const ownerCombo2 = await createTestUser();
  const orgCombo2 = crypto.randomUUID();
  const eventCombo2 = crypto.randomUUID();
  await ensureTestOrg(orgCombo2, ownerCombo2);
  await ensureTestEvent(eventCombo2, orgCombo2, 1400.00);

  await grantShowcaseCredit({ organizationId: orgCombo2, ownerUserId: ownerCombo2 });
  // Top-up RM6,000 gives 5% promo credit = RM300 topup_credit
  await createTopup({ organizationId: orgCombo2, amount: 6000.00, referenceId: `topup_c2_${Date.now()}` });

  const calcCombo2 = await calculateEventPayment(1400.00, 'COMBINED_CREDIT', orgCombo2, {
    useShowcaseCredit: true,
    useEventCredit: true,
  });
  assert(calcCombo2.showcaseCreditUsed === 300.00, 'Showcase credit used is RM300.00', 300, calcCombo2.showcaseCreditUsed);
  assert(calcCombo2.topupCreditUsed === 280.00, 'Top-up credit used is capped at 20% (RM280.00)', 280, calcCombo2.topupCreditUsed);
  assert(calcCombo2.totalDiscount === 580.00, 'Total discount is RM580.00', 580, calcCombo2.totalDiscount);
  assert(calcCombo2.paidAmount === 820.00, 'Paid amount is RM820.00 (1400 - 580)', 820, calcCombo2.paidAmount);

  const payCombo2 = await processEventPayment({
    organizationId: orgCombo2,
    eventId: eventCombo2,
    paymentMode: 'COMBINED_CREDIT',
    useShowcaseCredit: true,
    useEventCredit: true,
    eventPrice: 1400.00,
    createdBy: ownerCombo2,
  });
  assert(payCombo2.success === true, 'Combined payment (Showcase + Top-up) succeeded', true, payCombo2.success);
  assert(payCombo2.paymentCalculation.showcaseCreditUsed === 300.00, 'Showcase credit applied is RM300', 300, payCombo2.paymentCalculation.showcaseCreditUsed);
  assert(payCombo2.paymentCalculation.topupCreditUsed === 280.00, 'Top-up credit applied is RM280', 280, payCombo2.paymentCalculation.topupCreditUsed);
  assert(payCombo2.paymentCalculation.paidAmount === 820.00, 'Paid amount applied is RM820', 820, payCombo2.paymentCalculation.paidAmount);

  const walletPostC2 = await getWalletBalance(orgCombo2);
  assert(walletPostC2.showcase_credit === 0.00, 'Remaining showcase credit is RM0.00', 0, walletPostC2.showcase_credit);
  assert(walletPostC2.topup_credit === 20.00, 'Remaining topup credit is RM20.00 (300 - 280)', 20, walletPostC2.topup_credit);
  assert(walletPostC2.paid_balance === 5180.00, 'Remaining paid balance is RM5,180.00 (6000 - 820)', 5180, walletPostC2.paid_balance);

  // Scenario 4C: All Three Credits Combined:
  // Event Price: RM2,000 (multi-day event)
  // Welcome Credit: RM800
  // Showcase Credit: RM300
  // Top-up Credit: max 20% of RM2,000 = RM400
  // Total discount = 800 + 300 + 400 = RM1,500
  // Paid Balance required = RM500
  console.log('\nScenario 4C: All Three Credits Combined on RM2,000 Event');
  const ownerCombo3 = await createTestUser();
  const orgCombo3 = crypto.randomUUID();
  const eventCombo3 = crypto.randomUUID();
  await ensureTestOrg(orgCombo3, ownerCombo3);
  await ensureTestEvent(eventCombo3, orgCombo3, 2000.00);

  await grantWelcomeCredit({ organizationId: orgCombo3, userId: ownerCombo3 });
  await grantShowcaseCredit({ organizationId: orgCombo3, ownerUserId: ownerCombo3 });
  await createTopup({ organizationId: orgCombo3, amount: 10000.00, referenceId: `topup_c3_${Date.now()}` }); // gives RM700 topup credit

  const calcCombo3 = await calculateEventPayment(2000.00, 'COMBINED_CREDIT', orgCombo3, {
    useWelcomeCredit: true,
    useShowcaseCredit: true,
    useEventCredit: true,
  });
  assert(calcCombo3.welcomeCreditUsed === 800.00, 'Welcome credit used is RM800', 800, calcCombo3.welcomeCreditUsed);
  assert(calcCombo3.showcaseCreditUsed === 300.00, 'Showcase credit used is RM300', 300, calcCombo3.showcaseCreditUsed);
  assert(calcCombo3.topupCreditUsed === 400.00, 'Top-up credit used is RM400 (20% of RM2,000)', 400, calcCombo3.topupCreditUsed);
  assert(calcCombo3.totalDiscount === 1500.00, 'Total discount is RM1,500', 1500, calcCombo3.totalDiscount);
  assert(calcCombo3.paidAmount === 500.00, 'Paid amount is RM500', 500, calcCombo3.paidAmount);

  const payCombo3 = await processEventPayment({
    organizationId: orgCombo3,
    eventId: eventCombo3,
    paymentMode: 'COMBINED_CREDIT',
    useWelcomeCredit: true,
    useShowcaseCredit: true,
    useEventCredit: true,
    eventPrice: 2000.00,
    createdBy: ownerCombo3,
  });
  assert(payCombo3.success === true, 'All three credits combined payment succeeded', true, payCombo3.success);
  assert(payCombo3.paymentCalculation.welcomeCreditUsed === 800.00, 'Applied RM800 welcome credit', 800, payCombo3.paymentCalculation.welcomeCreditUsed);
  assert(payCombo3.paymentCalculation.showcaseCreditUsed === 300.00, 'Applied RM300 showcase credit', 300, payCombo3.paymentCalculation.showcaseCreditUsed);
  assert(payCombo3.paymentCalculation.topupCreditUsed === 400.00, 'Applied RM400 top-up credit', 400, payCombo3.paymentCalculation.topupCreditUsed);
  assert(payCombo3.paymentCalculation.paidAmount === 500.00, 'Applied RM500 paid balance', 500, payCombo3.paymentCalculation.paidAmount);

  const walletPostC3 = await getWalletBalance(orgCombo3);
  assert(walletPostC3.welcome_credit === 0.00, 'Remaining welcome credit is RM0', 0, walletPostC3.welcome_credit);
  assert(walletPostC3.showcase_credit === 0.00, 'Remaining showcase credit is RM0', 0, walletPostC3.showcase_credit);
  assert(walletPostC3.topup_credit === 300.00, 'Remaining top-up credit is RM300 (700 - 400)', 300, walletPostC3.topup_credit);
  assert(walletPostC3.paid_balance === 9500.00, 'Remaining paid balance is RM9,500 (10,000 - 500)', 9500, walletPostC3.paid_balance);

  console.log('========================================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
