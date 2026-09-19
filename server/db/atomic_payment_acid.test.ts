import crypto from 'node:crypto';
import { getSupabaseServerClient } from '../supabase.js';
import {
  createTopup,
  grantWelcomeCredit,
  grantShowcaseCredit,
  processEventPayment,
  consumeWelcomeCredit,
  consumeShowcaseCredit,
  getWalletBalance,
  getLedgerTransactions,
  STANDARD_EVENT_PRICE,
} from './wallet.js';

async function createTestUser(): Promise<string> {
  const supabase = getSupabaseServerClient();
  const id = crypto.randomUUID();
  try {
    await supabase.from('users').insert({
      id,
      email: `test-${id.slice(0, 8)}@example.com`,
      name: `Test User ${id.slice(0, 6)}`,
    });
  } catch {}
  return id;
}

async function ensureTestOrg(orgId: string, ownerId?: string): Promise<string> {
  const supabase = getSupabaseServerClient();
  let validOwnerId = ownerId;
  if (!validOwnerId) {
    validOwnerId = await createTestUser();
  }
  try {
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
  return validOwnerId;
}

async function ensureTestEvent(eventId: string, orgId: string, ownerId?: string) {
  const supabase = getSupabaseServerClient();
  try {
    const { data: themes } = await supabase.from('game_themes').select('id').limit(1);
    const themeId = themes?.[0]?.id || '1a480be3-5313-49ba-a9c2-f5b2293576cf';
    const now = new Date().toISOString();
    const token = crypto.randomBytes(4).toString('hex').toUpperCase();
    await supabase.from('events').upsert({
      id: eventId,
      organization_id: orgId,
      game_theme_id: themeId,
      name: `Test Event ${eventId.slice(0, 8)}`,
      event_date: now.split('T')[0],
      starts_at: now,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      status: 'scheduled',
      public_token: token,
      created_by: ownerId || undefined,
      created_at: now,
      updated_at: now,
    });
  } catch {
    // Ignore in local mode
  }
}

async function runAtomicPaymentTests() {
  console.log('======================================================');
  console.log(' RUNNING ATOMIC WALLET PAYMENT & ACID INTEGRITY TESTS');
  console.log('======================================================');

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

  // --- Test Group 1: Welcome Credit Atomic Payment (-RM800 Credit + -RM600 Paid) ---
  console.log('\n--- Test Group 1: Welcome Credit Atomic Payment ---');
  const org1 = crypto.randomUUID();
  const event1 = crypto.randomUUID();
  await ensureTestOrg(org1);
  await ensureTestEvent(event1, org1);

  // Setup org1: grant RM800 welcome credit, top up RM600 paid balance
  await grantWelcomeCredit({ organizationId: org1 });
  await createTopup({ organizationId: org1, amount: 600.00, referenceId: `topup_org1_${Date.now()}` });

  const walletBefore1 = await getWalletBalance(org1);
  assert(walletBefore1.welcome_credit === 800.00, 'Org 1 initial welcome credit is RM800.00', 800, walletBefore1.welcome_credit);
  assert(walletBefore1.paid_balance === 600.00, 'Org 1 initial paid balance is RM600.00', 600, walletBefore1.paid_balance);

  const payment1 = await consumeWelcomeCredit({ organizationId: org1, eventId: event1 });
  assert(payment1.success === true, 'Atomic welcome credit payment succeeded', true, payment1.success);
  assert(payment1.creditTransaction.amount === -800.00, 'Credit transaction amount is -RM800.00', -800, payment1.creditTransaction.amount);
  assert(payment1.paidTransaction.amount === -600.00, 'Paid transaction amount is -RM600.00', -600, payment1.paidTransaction.amount);
  assert(payment1.wallet.welcome_credit === 0.00, 'Remaining welcome credit is RM0.00', 0, payment1.wallet.welcome_credit);
  assert(payment1.wallet.paid_balance === 0.00, 'Remaining paid balance is RM0.00', 0, payment1.wallet.paid_balance);

  // --- Test Group 2: Showcase Credit Atomic Payment (-RM300 Credit + -RM1,100 Paid) ---
  console.log('\n--- Test Group 2: Showcase Credit Atomic Payment ---');
  const org2 = crypto.randomUUID();
  const event2 = crypto.randomUUID();
  await ensureTestOrg(org2);
  await ensureTestEvent(event2, org2);

  await grantShowcaseCredit({ organizationId: org2 });
  await createTopup({ organizationId: org2, amount: 1100.00, referenceId: `topup_org2_${Date.now()}` });

  const walletBefore2 = await getWalletBalance(org2);
  assert(walletBefore2.showcase_credit === 300.00, 'Org 2 initial showcase credit is RM300.00', 300, walletBefore2.showcase_credit);
  assert(walletBefore2.paid_balance === 1100.00, 'Org 2 initial paid balance is RM1,100.00', 1100, walletBefore2.paid_balance);

  const payment2 = await consumeShowcaseCredit({ organizationId: org2, eventId: event2 });
  assert(payment2.success === true, 'Atomic showcase credit payment succeeded', true, payment2.success);
  assert(payment2.creditTransaction.amount === -300.00, 'Credit transaction amount is -RM300.00', -300, payment2.creditTransaction.amount);
  assert(payment2.paidTransaction.amount === -1100.00, 'Paid transaction amount is -RM1,100.00', -1100, payment2.paidTransaction.amount);
  assert(payment2.wallet.showcase_credit === 0.00, 'Remaining showcase credit is RM0.00', 0, payment2.wallet.showcase_credit);
  assert(payment2.wallet.paid_balance === 0.00, 'Remaining paid balance is RM0.00', 0, payment2.wallet.paid_balance);

  // --- Test Group 3: Top-up Credit Atomic Payment (20% cap = RM280 Credit + RM1,120 Paid) ---
  console.log('\n--- Test Group 3: Top-up Promotional Credit Atomic Payment ---');
  const org3 = crypto.randomUUID();
  const event3 = crypto.randomUUID();
  await ensureTestOrg(org3);
  await ensureTestEvent(event3, org3);

  // RM10,000 topup grants RM700 promo credit
  await createTopup({ organizationId: org3, amount: 10000.00, referenceId: `topup_org3_${Date.now()}` });
  const walletBefore3 = await getWalletBalance(org3);
  assert(walletBefore3.topup_credit === 700.00, 'Org 3 topup promotional credit is RM700.00', 700, walletBefore3.topup_credit);
  assert(walletBefore3.paid_balance === 10000.00, 'Org 3 paid balance is RM10,000.00', 10000, walletBefore3.paid_balance);

  const payment3 = await processEventPayment({
    organizationId: org3,
    eventId: event3,
    paymentMode: 'TOPUP_CREDIT',
    topupCreditRequested: 280.00,
  });

  assert(payment3.success === true, 'Atomic topup credit payment succeeded', true, payment3.success);
  const promoCreditTxn = payment3.transactions.find((t) => t.balance_type === 'TOPUP_CREDIT');
  const paidTxn3 = payment3.transactions.find((t) => t.balance_type === 'PAID_BALANCE');
  assert(promoCreditTxn?.amount === -280.00, 'Capped promo credit used is -RM280.00 (20% of RM1,400)', -280, promoCreditTxn?.amount);
  assert(paidTxn3?.amount === -1120.00, 'Paid balance used is -RM1,120.00', -1120, paidTxn3?.amount);
  assert(payment3.wallet.topup_credit === 420.00, 'Remaining topup credit is RM420.00 (700 - 280)', 420, payment3.wallet.topup_credit);
  assert(payment3.wallet.paid_balance === 8880.00, 'Remaining paid balance is RM8,880.00 (10,000 - 1,120)', 8880, payment3.wallet.paid_balance);

  // --- Test Group 4: Full Paid Balance Payment (-RM1,400.00) ---
  console.log('\n--- Test Group 4: Full Paid Balance Atomic Payment ---');
  const org4 = crypto.randomUUID();
  const event4 = crypto.randomUUID();
  await ensureTestOrg(org4);
  await ensureTestEvent(event4, org4);

  await createTopup({ organizationId: org4, amount: 2000.00, referenceId: `topup_org4_${Date.now()}` });
  const payment4 = await processEventPayment({
    organizationId: org4,
    eventId: event4,
    paymentMode: 'FULL_PAID',
  });

  assert(payment4.success === true, 'Full paid payment succeeded', true, payment4.success);
  assert(payment4.transactions.length === 1, 'Exactly one transaction inserted for FULL_PAID', 1, payment4.transactions.length);
  assert(payment4.transactions[0].amount === -1400.00, 'Transaction amount is -RM1,400.00', -1400, payment4.transactions[0].amount);
  assert(payment4.wallet.paid_balance === 600.00, 'Remaining paid balance is RM600.00 (2,000 - 1,400)', 600, payment4.wallet.paid_balance);

  // --- Test Group 5: Idempotency & Replay Protection ---
  console.log('\n--- Test Group 5: Idempotency & Replay Protection ---');
  const replayPayment = await processEventPayment({
    organizationId: org1,
    eventId: event1,
    paymentMode: 'WELCOME_CREDIT',
  });

  assert(replayPayment.success === true, 'Duplicate payment replay returns success', true, replayPayment.success);
  assert(replayPayment.transactions.length === 2, 'Returns existing transactions', 2, replayPayment.transactions.length);
  const walletAfterReplay = await getWalletBalance(org1);
  assert(walletAfterReplay.welcome_credit === 0.00, 'Welcome credit balance unaffected on replay', 0, walletAfterReplay.welcome_credit);
  assert(walletAfterReplay.paid_balance === 0.00, 'Paid balance unaffected on replay', 0, walletAfterReplay.paid_balance);

  // --- Test Group 6: ACID Rollback on Insufficient Balance ---
  console.log('\n--- Test Group 6: ACID Rollback on Insufficient Balance ---');
  const org5 = crypto.randomUUID();
  const event5 = crypto.randomUUID();
  await ensureTestOrg(org5);
  await ensureTestEvent(event5, org5);

  // Org has RM800 welcome credit but only RM200 paid balance (requires RM600 paid balance)
  await grantWelcomeCredit({ organizationId: org5 });
  await createTopup({ organizationId: org5, amount: 200.00, referenceId: `topup_org5_${Date.now()}` });

  const txnsBeforeFail = await getLedgerTransactions(org5);
  const txnCountBefore = txnsBeforeFail.length;

  let failedCleanly = false;
  try {
    await consumeWelcomeCredit({ organizationId: org5, eventId: event5 });
  } catch (err: any) {
    failedCleanly = true;
    assert(err.message.includes('Insufficient'), 'Throws clear Insufficient Balance error');
  }
  assert(failedCleanly, 'Invalid payment was rejected and prevented execution');

  // Verify that ROLLBACK was absolute: NO partial credit deduction, NO partial paid deduction!
  const walletAfterFail = await getWalletBalance(org5);
  const txnsAfterFail = await getLedgerTransactions(org5);

  assert(walletAfterFail.welcome_credit === 800.00, 'Welcome credit was NOT partially deducted (remains RM800.00)', 800, walletAfterFail.welcome_credit);
  assert(walletAfterFail.paid_balance === 200.00, 'Paid balance was NOT modified (remains RM200.00)', 200, walletAfterFail.paid_balance);
  assert(txnsAfterFail.length === txnCountBefore, 'Zero orphan transactions inserted into ledger', txnCountBefore, txnsAfterFail.length);

  console.log('======================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAtomicPaymentTests().catch((err) => {
  console.error('Fatal atomic payment test error:', err);
  process.exit(1);
});
