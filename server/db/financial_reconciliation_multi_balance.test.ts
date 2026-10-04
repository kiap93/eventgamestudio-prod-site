import assert from 'node:assert';
import {
  createEvent,
  getEventById,
  cancelEvent,
  canCancelEvent,
  determineEventRefund,
} from './events.js';
import {
  createOrganization,
} from './organizations.js';
import {
  createUser,
} from './users.js';
import {
  ensureDefaultGame,
} from './games.js';
import {
  createTheme,
} from './themes.js';
import {
  createTopup,
  processEventPayment,
  refundEventPayment,
  getWalletBalance,
  appendLedgerTransaction,
  getLedgerTransactions,
  recalculateWalletBalances,
  toCents,
  fromCents,
} from './wallet.js';

let passed = 0;
let failed = 0;

async function test(desc: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${desc}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${desc}`);
    console.error(err);
    failed++;
  }
}

async function runFinancialReconciliationAudit() {
  console.log('================================================================');
  console.log('Financial Model Reconciliation & Multi-Balance Refund Audit');
  console.log('22 Comprehensive Test Scenarios for ACID Wallet Balances');
  console.log('================================================================\n');

  const env: Record<string, any> = {
    JWT_SECRET: 'test_financial_audit_jwt_secret_32_bytes_min!!',
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder_key',
    RATE_LIMIT_DISABLED: 'true',
  };

  const user = await createUser({
    email: `finance_auditor_${Date.now()}@example.com`,
    name: 'Chief Financial Auditor',
  }, env);

  const org = await createOrganization({
    name: 'Multi-Balance Financial Audit Org',
    owner_id: user.id,
  }, env);

  const game = await ensureDefaultGame(org.id, 'Audit Mini Game', env);
  const theme = await createTheme({
    organization_id: org.id,
    game_id: game.id,
    name: 'Audit Theme',
    slug: `audit-theme-${Date.now()}`,
  }, env);

  const dateBeforeSetup = new Date('2026-11-01T10:00:00.000Z');
  const dateOnSetup = new Date('2026-11-09T08:00:00.000Z');
  const dateDuringLive = new Date('2026-11-10T12:00:00.000Z');
  const dateAfterEnd = new Date('2026-11-13T10:00:00.000Z');

  // Helper to create an event with standard dates
  async function makeEvent(name: string, price: number = 1400, days: number = 1) {
    const endDay = days === 1 ? '10' : (9 + days).toString().padStart(2, '0');
    return await createEvent({
      organization_id: org.id,
      game_id: game.id,
      game_theme_id: theme.id,
      name,
      event_date: '2026-11-10',
      start_date: '2026-11-10',
      end_date: `2026-11-${endDay}`,
      startDate: '2026-11-10',
      endDate: `2026-11-${endDay}`,
      starts_at: '2026-11-10T00:00:00.000Z',
      expires_at: `2026-11-${endDay}T23:59:59.999Z`,
      status: 'scheduled',
      event_status: 'PENDING_PAYMENT',
      payment_status: 'UNPAID',
      created_by: user.id,
      event_price: price,
      event_currency: 'MYR',
      event_timezone: 'Asia/Singapore',
    }, env);
  }

  // --------------------------------------------------------------------------
  // TEST 1: User Request Core Scenario: RM1,400 Event + RM1,000 Paid + RM400 Promo/Event Credit
  // --------------------------------------------------------------------------
  await test('Scenario 1: RM1,400 event + RM1,000 paid balance + RM400 promotional/event credit cancelled before Setup Day', async () => {
    // Top up paid balance by RM2,000 and grant RM500 topup promo credit
    await appendLedgerTransaction({
      organization_id: org.id,
      transaction_type: 'TOPUP',
      balance_type: 'PAID_BALANCE',
      amount: 2000,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `topup_sc1_${Date.now()}`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      transaction_type: 'TOPUP_CREDIT',
      balance_type: 'TOPUP_CREDIT',
      amount: 500,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `promo_sc1_${Date.now()}`,
    }, env);

    const initialWallet = await getWalletBalance(org.id, env);
    const initialPaid = initialWallet.paid_balance;
    const initialTopup = initialWallet.topup_credit;
    const initialTotal = initialWallet.total_balance;

    const ev = await makeEvent('Scenario 1 RM1400 Event', 1400);

    // Explicitly pay using RM1,000 paid balance + RM400 topup/event credit
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'EVENT_PAYMENT',
      balance_type: 'PAID_BALANCE',
      amount: -1000,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc1_${ev.id}_paid`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'TOPUP_CREDIT',
      amount: -400,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc1_${ev.id}_credit`,
    }, env);

    const postPayWallet = await recalculateWalletBalances(org.id, env);
    assert.strictEqual(postPayWallet.paid_balance, initialPaid - 1000, 'Paid balance must decrease by exactly 1000');
    assert.strictEqual(postPayWallet.topup_credit, initialTopup - 400, 'Topup credit must decrease by exactly 400');
    assert.strictEqual(postPayWallet.total_balance, initialTotal - 1400, 'Total wallet balance must decrease by 1400');

    // Update event record to PAID status
    const { localEventsCache } = await import('./events.js');
    ev.payment_status = 'PAID';
    ev.paid_amount = 1000;
    ev.discount_amount = 400;
    ev.payment_mode = 'TOPUP_CREDIT';
    localEventsCache.set(ev.id, ev);

    // Cancel before Setup Day
    const cancelRes = await cancelEvent(ev.id, { now: dateBeforeSetup, reason: 'Customer requested cancellation' }, env);

    assert.strictEqual(cancelRes.status, 'cancelled');
    assert.strictEqual(cancelRes.payment_status, 'REFUNDED');

    const restoredWallet = await getWalletBalance(org.id, env);
    assert.strictEqual(restoredWallet.paid_balance, initialPaid, 'Paid balance restored exactly RM1,000');
    assert.strictEqual(restoredWallet.topup_credit, initialTopup, 'Topup credit restored exactly RM400');
    assert.strictEqual(restoredWallet.total_balance, initialTotal, 'Total financial position is exactly original state');
  });

  // --------------------------------------------------------------------------
  // TEST 2: RM1,400 Event + RM800 Welcome Credit + RM600 Paid Balance
  // --------------------------------------------------------------------------
  await test('Scenario 2: RM1,400 event + RM800 Welcome Credit + RM600 Paid Balance cancelled before Setup Day', async () => {
    await appendLedgerTransaction({
      organization_id: org.id,
      transaction_type: 'WELCOME_CREDIT',
      balance_type: 'WELCOME_CREDIT',
      amount: 800,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `welcome_sc2_${Date.now()}`,
    }, env);

    const initialWallet = await recalculateWalletBalances(org.id, env);
    const initialPaid = initialWallet.paid_balance;
    const initialWelcome = initialWallet.welcome_credit;
    const initialTotal = initialWallet.total_balance;

    const ev = await makeEvent('Scenario 2 RM1400 Event', 1400);

    // Deduct RM800 welcome credit and RM600 paid balance
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'WELCOME_CREDIT',
      amount: -800,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc2_${ev.id}_welcome`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'EVENT_PAYMENT',
      balance_type: 'PAID_BALANCE',
      amount: -600,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc2_${ev.id}_paid`,
    }, env);

    const { localEventsCache } = await import('./events.js');
    ev.payment_status = 'PAID';
    ev.paid_amount = 600;
    ev.discount_amount = 800;
    ev.payment_mode = 'WELCOME_CREDIT';
    localEventsCache.set(ev.id, ev);

    // Cancel before Setup Day
    await cancelEvent(ev.id, { now: dateBeforeSetup }, env);

    const restoredWallet = await getWalletBalance(org.id, env);
    assert.strictEqual(restoredWallet.paid_balance, initialPaid, 'Paid balance restored exactly RM600');
    assert.strictEqual(restoredWallet.welcome_credit, initialWelcome, 'Welcome credit restored exactly RM800');
    assert.strictEqual(restoredWallet.total_balance, initialTotal, 'Total financial position is exactly original state');
  });

  // --------------------------------------------------------------------------
  // TEST 3: RM1,400 Event + RM300 Showcase Credit + RM1,100 Paid Balance
  // --------------------------------------------------------------------------
  await test('Scenario 3: RM1,400 event + RM300 Showcase Credit + RM1,100 Paid Balance cancelled before Setup Day', async () => {
    await appendLedgerTransaction({
      organization_id: org.id,
      transaction_type: 'SHOWCASE_CREDIT',
      balance_type: 'SHOWCASE_CREDIT',
      amount: 300,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `showcase_sc3_${Date.now()}`,
    }, env);

    const initialWallet = await recalculateWalletBalances(org.id, env);
    const initialPaid = initialWallet.paid_balance;
    const initialShowcase = initialWallet.showcase_credit;
    const initialTotal = initialWallet.total_balance;

    const ev = await makeEvent('Scenario 3 RM1400 Event', 1400);

    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'SHOWCASE_CREDIT',
      amount: -300,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc3_${ev.id}_showcase`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'EVENT_PAYMENT',
      balance_type: 'PAID_BALANCE',
      amount: -1100,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc3_${ev.id}_paid`,
    }, env);

    const { localEventsCache } = await import('./events.js');
    ev.payment_status = 'PAID';
    ev.paid_amount = 1100;
    ev.discount_amount = 300;
    ev.payment_mode = 'SHOWCASE_CREDIT';
    localEventsCache.set(ev.id, ev);

    await cancelEvent(ev.id, { now: dateBeforeSetup }, env);

    const restoredWallet = await getWalletBalance(org.id, env);
    assert.strictEqual(restoredWallet.paid_balance, initialPaid, 'Paid balance restored exactly RM1,100');
    assert.strictEqual(restoredWallet.showcase_credit, initialShowcase, 'Showcase credit restored exactly RM300');
    assert.strictEqual(restoredWallet.total_balance, initialTotal, 'Total financial position is exactly original state');
  });

  // --------------------------------------------------------------------------
  // TEST 4: RM1,400 Event Paid 100% from Paid Balance
  // --------------------------------------------------------------------------
  await test('Scenario 4: RM1,400 event paid 100% from Paid Balance restored completely upon cancellation', async () => {
    const initialWallet = await getWalletBalance(org.id, env);
    const initialPaid = initialWallet.paid_balance;

    const ev = await makeEvent('Scenario 4 100% Paid Event', 1400);

    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'EVENT_PAYMENT',
      balance_type: 'PAID_BALANCE',
      amount: -1400,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc4_${ev.id}_paid`,
    }, env);

    const { localEventsCache } = await import('./events.js');
    ev.payment_status = 'PAID';
    ev.paid_amount = 1400;
    ev.discount_amount = 0;
    ev.payment_mode = 'FULL_PAID';
    localEventsCache.set(ev.id, ev);

    await cancelEvent(ev.id, { now: dateBeforeSetup }, env);

    const restoredWallet = await getWalletBalance(org.id, env);
    assert.strictEqual(restoredWallet.paid_balance, initialPaid, 'Paid balance restored exactly RM1,400');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Triple Split: RM800 Welcome Credit + RM300 Showcase Credit + RM300 Paid Balance
  // --------------------------------------------------------------------------
  await test('Scenario 5: Multi-credit split: RM800 Welcome + RM300 Showcase + RM300 Paid Balance restored to original types', async () => {
    const initialWallet = await getWalletBalance(org.id, env);
    const initialPaid = initialWallet.paid_balance;
    const initialWelcome = initialWallet.welcome_credit;
    const initialShowcase = initialWallet.showcase_credit;
    const initialTotal = initialWallet.total_balance;

    const ev = await makeEvent('Scenario 5 Triple Split', 1400);

    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'WELCOME_CREDIT',
      amount: -800,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc5_${ev.id}_welcome`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'SHOWCASE_CREDIT',
      amount: -300,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc5_${ev.id}_showcase`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'EVENT_PAYMENT',
      balance_type: 'PAID_BALANCE',
      amount: -300,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc5_${ev.id}_paid`,
    }, env);

    const { localEventsCache } = await import('./events.js');
    ev.payment_status = 'PAID';
    ev.paid_amount = 300;
    ev.discount_amount = 1100;
    ev.payment_mode = 'COMBINED_CREDIT';
    localEventsCache.set(ev.id, ev);

    await cancelEvent(ev.id, { now: dateBeforeSetup }, env);

    const restoredWallet = await getWalletBalance(org.id, env);
    assert.strictEqual(restoredWallet.welcome_credit, initialWelcome, 'Welcome credit restored RM800');
    assert.strictEqual(restoredWallet.showcase_credit, initialShowcase, 'Showcase credit restored RM300');
    assert.strictEqual(restoredWallet.paid_balance, initialPaid, 'Paid balance restored RM300');
    assert.strictEqual(restoredWallet.total_balance, initialTotal, 'Total position exactly original state');
  });

  // --------------------------------------------------------------------------
  // TEST 6: Multi-Credit Split: RM800 Welcome Credit + RM200 Top-up Credit + RM400 Paid Balance
  // --------------------------------------------------------------------------
  await test('Scenario 6: Multi-credit split: RM800 Welcome + RM200 Topup + RM400 Paid Balance restored', async () => {
    const initialWallet = await getWalletBalance(org.id, env);
    const initialPaid = initialWallet.paid_balance;
    const initialWelcome = initialWallet.welcome_credit;
    const initialTopup = initialWallet.topup_credit;
    const initialTotal = initialWallet.total_balance;

    const ev = await makeEvent('Scenario 6 Welcome + Topup', 1400);

    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'WELCOME_CREDIT',
      amount: -800,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc6_${ev.id}_welcome`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'TOPUP_CREDIT',
      amount: -200,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc6_${ev.id}_topup`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'EVENT_PAYMENT',
      balance_type: 'PAID_BALANCE',
      amount: -400,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc6_${ev.id}_paid`,
    }, env);

    const { localEventsCache } = await import('./events.js');
    ev.payment_status = 'PAID';
    ev.paid_amount = 400;
    ev.discount_amount = 1000;
    ev.payment_mode = 'COMBINED_CREDIT';
    localEventsCache.set(ev.id, ev);

    await cancelEvent(ev.id, { now: dateBeforeSetup }, env);

    const restoredWallet = await getWalletBalance(org.id, env);
    assert.strictEqual(restoredWallet.welcome_credit, initialWelcome, 'Welcome credit restored RM800');
    assert.strictEqual(restoredWallet.topup_credit, initialTopup, 'Topup credit restored RM200');
    assert.strictEqual(restoredWallet.paid_balance, initialPaid, 'Paid balance restored RM400');
    assert.strictEqual(restoredWallet.total_balance, initialTotal, 'Total position exactly original state');
  });

  // --------------------------------------------------------------------------
  // TEST 7: Multi-Credit Split: RM300 Showcase Credit + RM200 Top-up Credit + RM900 Paid Balance
  // --------------------------------------------------------------------------
  await test('Scenario 7: Multi-credit split: RM300 Showcase + RM200 Topup + RM900 Paid Balance restored', async () => {
    const initialWallet = await getWalletBalance(org.id, env);
    const initialPaid = initialWallet.paid_balance;
    const initialShowcase = initialWallet.showcase_credit;
    const initialTopup = initialWallet.topup_credit;
    const initialTotal = initialWallet.total_balance;

    const ev = await makeEvent('Scenario 7 Showcase + Topup', 1400);

    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'SHOWCASE_CREDIT',
      amount: -300,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc7_${ev.id}_showcase`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'TOPUP_CREDIT',
      amount: -200,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc7_${ev.id}_topup`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'EVENT_PAYMENT',
      balance_type: 'PAID_BALANCE',
      amount: -900,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc7_${ev.id}_paid`,
    }, env);

    const { localEventsCache } = await import('./events.js');
    ev.payment_status = 'PAID';
    ev.paid_amount = 900;
    ev.discount_amount = 500;
    ev.payment_mode = 'COMBINED_CREDIT';
    localEventsCache.set(ev.id, ev);

    await cancelEvent(ev.id, { now: dateBeforeSetup }, env);

    const restoredWallet = await getWalletBalance(org.id, env);
    assert.strictEqual(restoredWallet.showcase_credit, initialShowcase, 'Showcase credit restored RM300');
    assert.strictEqual(restoredWallet.topup_credit, initialTopup, 'Topup credit restored RM200');
    assert.strictEqual(restoredWallet.paid_balance, initialPaid, 'Paid balance restored RM900');
    assert.strictEqual(restoredWallet.total_balance, initialTotal, 'Total position exactly original state');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Quadruple Balance Split (All 4 balance types active and restored)
  // --------------------------------------------------------------------------
  await test('Scenario 8: Quadruple balance split (Welcome + Showcase + Topup + Paid) fully restored', async () => {
    const initialWallet = await getWalletBalance(org.id, env);
    const initialPaid = initialWallet.paid_balance;
    const initialWelcome = initialWallet.welcome_credit;
    const initialShowcase = initialWallet.showcase_credit;
    const initialTopup = initialWallet.topup_credit;
    const initialTotal = initialWallet.total_balance;

    const ev = await makeEvent('Scenario 8 Quad Split', 1400);

    // Pay: RM800 welcome + RM300 showcase + RM200 topup + RM100 paid = RM1,400
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'WELCOME_CREDIT',
      amount: -800,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc8_${ev.id}_welcome`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'SHOWCASE_CREDIT',
      amount: -300,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc8_${ev.id}_showcase`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'TOPUP_CREDIT',
      amount: -200,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc8_${ev.id}_topup`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'EVENT_PAYMENT',
      balance_type: 'PAID_BALANCE',
      amount: -100,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc8_${ev.id}_paid`,
    }, env);

    const { localEventsCache } = await import('./events.js');
    ev.payment_status = 'PAID';
    ev.paid_amount = 100;
    ev.discount_amount = 1300;
    ev.payment_mode = 'COMBINED_CREDIT';
    localEventsCache.set(ev.id, ev);

    await cancelEvent(ev.id, { now: dateBeforeSetup }, env);

    const restoredWallet = await getWalletBalance(org.id, env);
    assert.strictEqual(restoredWallet.welcome_credit, initialWelcome, 'Welcome credit restored RM800');
    assert.strictEqual(restoredWallet.showcase_credit, initialShowcase, 'Showcase credit restored RM300');
    assert.strictEqual(restoredWallet.topup_credit, initialTopup, 'Topup credit restored RM200');
    assert.strictEqual(restoredWallet.paid_balance, initialPaid, 'Paid balance restored RM100');
    assert.strictEqual(restoredWallet.total_balance, initialTotal, 'Total financial position is 100% restored');
  });

  // --------------------------------------------------------------------------
  // TEST 9: Wallet Top-Up Followed by Event Payment and Cancellation
  // --------------------------------------------------------------------------
  await test('Scenario 9: Wallet top-up with qualifying promo tier, event payment, and cancellation returns to post-topup state', async () => {
    const freshOrg = await createOrganization({
      name: `Topup Audit Org ${Date.now()}`,
      owner_id: user.id,
    }, env);

    // Top-up RM6,000 via createTopup (qualifies for 5% topup bonus = RM300)
    const topupResult = await createTopup({
      organizationId: freshOrg.id,
      amount: 6000,
      currency: 'MYR',
      referenceId: `topup_sc9_${Date.now()}`,
    }, env);

    const postTopupWallet = topupResult.wallet;
    assert.strictEqual(postTopupWallet.paid_balance, 6000, 'Paid balance must be RM6,000');
    assert.strictEqual(postTopupWallet.topup_credit, 300, 'Top-up promo credit must be RM300 (5%)');

    const ev = await createEvent({
      organization_id: freshOrg.id,
      game_id: game.id,
      game_theme_id: theme.id,
      name: 'Event After Top-up',
      event_date: '2026-11-10',
      start_date: '2026-11-10',
      end_date: '2026-11-10',
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      starts_at: '2026-11-10T00:00:00.000Z',
      expires_at: '2026-11-10T23:59:59.999Z',
      status: 'scheduled',
      event_status: 'PENDING_PAYMENT',
      payment_status: 'UNPAID',
      created_by: user.id,
      event_price: 1400,
      event_currency: 'MYR',
    }, env);

    // Pay using processEventPayment with topup credit (max 20% = RM280) + paid balance (RM1,120)
    const payResult = await processEventPayment({
      organizationId: freshOrg.id,
      eventId: ev.id,
      paymentMode: 'TOPUP_CREDIT',
      useTopupCredit: true,
      topupCreditRequested: 280,
    }, env);

    assert.strictEqual(payResult.paymentCalculation.topupCreditUsed, 280, 'Topup credit used: RM280');
    assert.strictEqual(payResult.paymentCalculation.paidAmount, 1120, 'Paid balance used: RM1,120');

    // Cancel event before Setup Day
    await cancelEvent(ev.id, { now: dateBeforeSetup }, env);

    const finalWallet = await getWalletBalance(freshOrg.id, env);
    assert.strictEqual(finalWallet.paid_balance, postTopupWallet.paid_balance, 'Paid balance restored to RM6,000');
    assert.strictEqual(finalWallet.topup_credit, postTopupWallet.topup_credit, 'Topup credit restored to RM300');
    assert.strictEqual(finalWallet.total_balance, postTopupWallet.total_balance, 'Total financial position matches post-topup state');
  });

  // --------------------------------------------------------------------------
  // TEST 10: 2-Day Event Tier (RM1,900) with Welcome Credit & Paid Balance
  // --------------------------------------------------------------------------
  await test('Scenario 10: 2-day event (RM1,900) paid with Welcome Credit RM800 + Paid RM1,100 restored', async () => {
    const initialWallet = await getWalletBalance(org.id, env);
    const initialPaid = initialWallet.paid_balance;
    const initialWelcome = initialWallet.welcome_credit;

    const ev = await makeEvent('2-Day Event RM1900', 1900, 2);

    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'WELCOME_CREDIT',
      amount: -800,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc10_${ev.id}_welcome`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'EVENT_PAYMENT',
      balance_type: 'PAID_BALANCE',
      amount: -1100,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc10_${ev.id}_paid`,
    }, env);

    const { localEventsCache } = await import('./events.js');
    ev.payment_status = 'PAID';
    ev.paid_amount = 1100;
    ev.discount_amount = 800;
    ev.payment_mode = 'WELCOME_CREDIT';
    localEventsCache.set(ev.id, ev);

    await cancelEvent(ev.id, { now: dateBeforeSetup }, env);

    const restoredWallet = await getWalletBalance(org.id, env);
    assert.strictEqual(restoredWallet.welcome_credit, initialWelcome, 'Welcome credit restored RM800');
    assert.strictEqual(restoredWallet.paid_balance, initialPaid, 'Paid balance restored RM1,100');
  });

  // --------------------------------------------------------------------------
  // TEST 11: 7-Day Multi-Day Event Tier (RM2,800) with Multi-Balance Split
  // --------------------------------------------------------------------------
  await test('Scenario 11: 7-day event (RM2,800) paid with multi-balance split restored cleanly', async () => {
    const initialWallet = await getWalletBalance(org.id, env);
    const initialPaid = initialWallet.paid_balance;
    const initialWelcome = initialWallet.welcome_credit;
    const initialShowcase = initialWallet.showcase_credit;
    const initialTopup = initialWallet.topup_credit;

    const ev = await makeEvent('7-Day Event RM2800', 2800, 7);

    // Paid: RM800 welcome + RM300 showcase + RM500 topup + RM1200 paid = RM2,800
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'WELCOME_CREDIT',
      amount: -800,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc11_${ev.id}_welcome`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'SHOWCASE_CREDIT',
      amount: -300,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc11_${ev.id}_showcase`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'TOPUP_CREDIT',
      amount: -500,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc11_${ev.id}_topup`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'EVENT_PAYMENT',
      balance_type: 'PAID_BALANCE',
      amount: -1200,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc11_${ev.id}_paid`,
    }, env);

    const { localEventsCache } = await import('./events.js');
    ev.payment_status = 'PAID';
    ev.paid_amount = 1200;
    ev.discount_amount = 1600;
    ev.payment_mode = 'COMBINED_CREDIT';
    localEventsCache.set(ev.id, ev);

    await cancelEvent(ev.id, { now: dateBeforeSetup }, env);

    const restoredWallet = await getWalletBalance(org.id, env);
    assert.strictEqual(restoredWallet.welcome_credit, initialWelcome, 'Welcome credit restored RM800');
    assert.strictEqual(restoredWallet.showcase_credit, initialShowcase, 'Showcase credit restored RM300');
    assert.strictEqual(restoredWallet.topup_credit, initialTopup, 'Topup credit restored RM500');
    assert.strictEqual(restoredWallet.paid_balance, initialPaid, 'Paid balance restored RM1,200');
  });

  // --------------------------------------------------------------------------
  // TEST 12: 100% Credit Event (RM800 Price Paid Entirely by Welcome Credit)
  // --------------------------------------------------------------------------
  await test('Scenario 12: 100% credit event (RM800 paid by Welcome Credit) restored with RM0 paid balance touch', async () => {
    const initialWallet = await getWalletBalance(org.id, env);
    const initialPaid = initialWallet.paid_balance;
    const initialWelcome = initialWallet.welcome_credit;

    const ev = await makeEvent('100% Credit Promo Event', 800, 1);

    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'WELCOME_CREDIT',
      amount: -800,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc12_${ev.id}_welcome`,
    }, env);

    const { localEventsCache } = await import('./events.js');
    ev.payment_status = 'PAID';
    ev.paid_amount = 0;
    ev.discount_amount = 800;
    ev.payment_mode = 'WELCOME_CREDIT';
    localEventsCache.set(ev.id, ev);

    await cancelEvent(ev.id, { now: dateBeforeSetup }, env);

    const restoredWallet = await getWalletBalance(org.id, env);
    assert.strictEqual(restoredWallet.welcome_credit, initialWelcome, 'Welcome credit restored exactly RM800');
    assert.strictEqual(restoredWallet.paid_balance, initialPaid, 'Paid balance remained completely untouched');
  });

  // --------------------------------------------------------------------------
  // TEST 13: Sequential Events — Event A and Event B paid, only Event A cancelled
  // --------------------------------------------------------------------------
  await test('Scenario 13: Sequential events: Event A and Event B paid, cancelling only Event A refunds only Event A', async () => {
    const initialWallet = await getWalletBalance(org.id, env);
    const initialPaid = initialWallet.paid_balance;

    const evA = await makeEvent('Event A', 1400);
    const evB = await makeEvent('Event B', 1400);

    // Pay both from Paid Balance
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: evA.id,
      transaction_type: 'EVENT_PAYMENT',
      balance_type: 'PAID_BALANCE',
      amount: -1400,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc13_${evA.id}_paid`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: evB.id,
      transaction_type: 'EVENT_PAYMENT',
      balance_type: 'PAID_BALANCE',
      amount: -1400,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc13_${evB.id}_paid`,
    }, env);

    const { localEventsCache } = await import('./events.js');
    evA.payment_status = 'PAID';
    evA.paid_amount = 1400;
    localEventsCache.set(evA.id, evA);

    evB.payment_status = 'PAID';
    evB.paid_amount = 1400;
    localEventsCache.set(evB.id, evB);

    // Cancel ONLY Event A
    await cancelEvent(evA.id, { now: dateBeforeSetup }, env);

    const midWallet = await getWalletBalance(org.id, env);
    assert.strictEqual(midWallet.paid_balance, initialPaid - 1400, 'Paid balance must reflect Event B still paid');

    const updatedEvA = await getEventById(evA.id, env);
    const updatedEvB = await getEventById(evB.id, env);
    assert.strictEqual(updatedEvA?.payment_status, 'REFUNDED');
    assert.strictEqual(updatedEvB?.payment_status, 'PAID');
  });

  // --------------------------------------------------------------------------
  // TEST 14: Sequential Events — Event A and Event B both cancelled sequentially
  // --------------------------------------------------------------------------
  await test('Scenario 14: Sequential events: Cancelling remaining Event B restores full original balance', async () => {
    const initialWallet = await getWalletBalance(org.id, env);
    // There is an Event B from Scenario 13 currently paid
    const existingEvents = Array.from((await import('./events.js')).localEventsCache.values());
    const evB = existingEvents.find((e) => e.name === 'Event B' && e.payment_status === 'PAID');
    assert.ok(evB, 'Event B must exist');

    await cancelEvent(evB.id, { now: dateBeforeSetup }, env);

    const finalWallet = await getWalletBalance(org.id, env);
    assert.strictEqual(finalWallet.paid_balance, initialWallet.paid_balance + 1400, 'Paid balance returned 100% to initial state');
  });

  // --------------------------------------------------------------------------
  // TEST 15: Setup Day Cutoff Enforcement — NO Refund Allowed
  // --------------------------------------------------------------------------
  await test('Scenario 15: Cancellation on Setup Day is strictly rejected and zero refunds/reversals are issued', async () => {
    const preWallet = await getWalletBalance(org.id, env);

    const ev = await makeEvent('Setup Day Event', 1400);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'EVENT_PAYMENT',
      balance_type: 'PAID_BALANCE',
      amount: -1000,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc15_${ev.id}_paid`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'TOPUP_CREDIT',
      amount: -400,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc15_${ev.id}_credit`,
    }, env);

    const { localEventsCache } = await import('./events.js');
    ev.payment_status = 'PAID';
    ev.paid_amount = 1000;
    ev.discount_amount = 400;
    localEventsCache.set(ev.id, ev);

    const walletAfterPay = await recalculateWalletBalances(org.id, env);

    let threw = false;
    try {
      await cancelEvent(ev.id, { now: dateOnSetup }, env);
    } catch (err: any) {
      threw = true;
      assert.strictEqual(err.code, 'SETUP_DAY_STARTED');
    }
    assert.strictEqual(threw, true, 'Must throw SETUP_DAY_STARTED error');

    // Balances must remain unchanged
    const postAttemptWallet = await getWalletBalance(org.id, env);
    assert.strictEqual(postAttemptWallet.paid_balance, walletAfterPay.paid_balance, 'Paid balance must not change');
    assert.strictEqual(postAttemptWallet.topup_credit, walletAfterPay.topup_credit, 'Topup credit must not change');
    assert.strictEqual(postAttemptWallet.total_balance, walletAfterPay.total_balance, 'Total financial position must not change');

    // Clean up event for next tests by cancelling with force beforeSetup
    await cancelEvent(ev.id, { now: dateBeforeSetup, force: true }, env);
  });

  // --------------------------------------------------------------------------
  // TEST 16: Live Window Cutoff Enforcement — NO Refund Allowed
  // --------------------------------------------------------------------------
  await test('Scenario 16: Cancellation during Live Window is strictly rejected with zero balance change', async () => {
    const ev = await makeEvent('Live Event', 1400);
    const { localEventsCache } = await import('./events.js');
    ev.payment_status = 'PAID';
    ev.paid_amount = 1400;
    localEventsCache.set(ev.id, ev);

    const walletBefore = await getWalletBalance(org.id, env);

    let threw = false;
    try {
      await cancelEvent(ev.id, { now: dateDuringLive }, env);
    } catch (err: any) {
      threw = true;
      assert.strictEqual(err.code, 'EVENT_LIVE');
    }
    assert.strictEqual(threw, true, 'Must throw EVENT_LIVE error');

    const walletAfter = await getWalletBalance(org.id, env);
    assert.strictEqual(walletAfter.total_balance, walletBefore.total_balance, 'Balances unchanged');
  });

  // --------------------------------------------------------------------------
  // TEST 17: Post-Event Ended Cutoff Enforcement — NO Refund Allowed
  // --------------------------------------------------------------------------
  await test('Scenario 17: Cancellation after event ended is strictly rejected with zero balance change', async () => {
    const ev = await makeEvent('Ended Event', 1400);
    const { localEventsCache } = await import('./events.js');
    ev.payment_status = 'PAID';
    ev.paid_amount = 1400;
    localEventsCache.set(ev.id, ev);

    const walletBefore = await getWalletBalance(org.id, env);

    let threw = false;
    try {
      await cancelEvent(ev.id, { now: dateAfterEnd }, env);
    } catch (err: any) {
      threw = true;
      assert.strictEqual(err.code, 'EVENT_ENDED');
    }
    assert.strictEqual(threw, true, 'Must throw EVENT_ENDED error');

    const walletAfter = await getWalletBalance(org.id, env);
    assert.strictEqual(walletAfter.total_balance, walletBefore.total_balance, 'Balances unchanged');
  });

  // --------------------------------------------------------------------------
  // TEST 18: Idempotency Protection — Repeated Refund Call returns same state without double crediting
  // --------------------------------------------------------------------------
  await test('Scenario 18: Idempotent refundEventPayment execution prevents double-crediting balances', async () => {
    const ev = await makeEvent('Idempotency Event', 1400);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'EVENT_PAYMENT',
      balance_type: 'PAID_BALANCE',
      amount: -1000,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc18_${ev.id}_paid`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'TOPUP_CREDIT',
      amount: -400,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc18_${ev.id}_credit`,
    }, env);

    const { localEventsCache } = await import('./events.js');
    ev.payment_status = 'PAID';
    ev.paid_amount = 1000;
    ev.discount_amount = 400;
    localEventsCache.set(ev.id, ev);

    // First refund
    const refund1 = await refundEventPayment({
      organizationId: org.id,
      eventId: ev.id,
      now: dateBeforeSetup,
    }, env);
    assert.strictEqual(refund1.success, true);
    const balanceAfterFirstRefund = refund1.wallet.total_balance;

    // Second refund call directly
    const refund2 = await refundEventPayment({
      organizationId: org.id,
      eventId: ev.id,
      now: dateBeforeSetup,
    }, env);
    assert.strictEqual(refund2.success, true);
    assert.strictEqual(refund2.wallet.total_balance, balanceAfterFirstRefund, 'Balance must NOT increase on repeated refund call');
  });

  // --------------------------------------------------------------------------
  // TEST 19: Concurrency Race Condition — Concurrent cancelEvent calls
  // --------------------------------------------------------------------------
  await test('Scenario 19: Concurrent cancelEvent calls are serialized by organization lock and processed exactly once', async () => {
    const ev = await makeEvent('Race Condition Event', 1400);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'EVENT_PAYMENT',
      balance_type: 'PAID_BALANCE',
      amount: -1000,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc19_${ev.id}_paid`,
    }, env);
    await appendLedgerTransaction({
      organization_id: org.id,
      event_id: ev.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'TOPUP_CREDIT',
      amount: -400,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: `pay_sc19_${ev.id}_credit`,
    }, env);

    const { localEventsCache } = await import('./events.js');
    ev.payment_status = 'PAID';
    ev.paid_amount = 1000;
    ev.discount_amount = 400;
    localEventsCache.set(ev.id, ev);

    const preBalance = (await recalculateWalletBalances(org.id, env)).total_balance;

    // Fire 2 concurrent cancellations
    const results = await Promise.allSettled([
      cancelEvent(ev.id, { now: dateBeforeSetup, reason: 'Concurrent Attempt 1' }, env),
      cancelEvent(ev.id, { now: dateBeforeSetup, reason: 'Concurrent Attempt 2' }, env),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exactly one concurrent cancellation must succeed');
    assert.strictEqual(rejected.length, 1, 'Exactly one concurrent cancellation must be rejected');

    const postBalance = (await getWalletBalance(org.id, env)).total_balance;
    assert.strictEqual(postBalance, preBalance + 1400, 'Total wallet balance increased by exactly one event refund');
  });

  // --------------------------------------------------------------------------
  // TEST 20: Unpaid Event Cancellation — Zero Balance Impact
  // --------------------------------------------------------------------------
  await test('Scenario 20: Unpaid event cancellation successfully cancels event with zero balance changes', async () => {
    const initialWallet = await getWalletBalance(org.id, env);

    const ev = await makeEvent('Unpaid Event For Cancellation', 1400);
    const cancelRes = await cancelEvent(ev.id, { now: dateBeforeSetup }, env);

    assert.strictEqual(cancelRes.status, 'cancelled');
    assert.strictEqual(cancelRes.payment_status, 'UNPAID');

    const postWallet = await getWalletBalance(org.id, env);
    assert.strictEqual(postWallet.paid_balance, initialWallet.paid_balance, 'Paid balance unchanged');
    assert.strictEqual(postWallet.welcome_credit, initialWallet.welcome_credit, 'Welcome credit unchanged');
    assert.strictEqual(postWallet.showcase_credit, initialWallet.showcase_credit, 'Showcase credit unchanged');
    assert.strictEqual(postWallet.topup_credit, initialWallet.topup_credit, 'Topup credit unchanged');
    assert.strictEqual(postWallet.total_balance, initialWallet.total_balance, 'Total financial position unchanged');
  });

  // --------------------------------------------------------------------------
  // TEST 21: Full Ledger Audit Trail Reconciliation
  // --------------------------------------------------------------------------
  await test('Scenario 21: Ledger integrity: Sum of all completed transactions matches total wallet balance', async () => {
    const txns = await getLedgerTransactions(org.id, env);
    const wallet = await getWalletBalance(org.id, env);

    let sumPaidCents = 0;
    let sumWelcomeCents = 0;
    let sumShowcaseCents = 0;
    let sumTopupCents = 0;

    for (const t of txns) {
      assert.strictEqual(t.status, 'COMPLETED', 'All ledger transactions must be COMPLETED');
      const cents = toCents(t.amount);
      if (t.balance_type === 'PAID_BALANCE') sumPaidCents += cents;
      else if (t.balance_type === 'WELCOME_CREDIT') sumWelcomeCents += cents;
      else if (t.balance_type === 'SHOWCASE_CREDIT') sumShowcaseCents += cents;
      else if (t.balance_type === 'TOPUP_CREDIT') sumTopupCents += cents;
    }

    assert.strictEqual(fromCents(sumPaidCents), wallet.paid_balance, 'Sum of PAID_BALANCE ledger transactions matches wallet');
    assert.strictEqual(fromCents(sumWelcomeCents), wallet.welcome_credit, 'Sum of WELCOME_CREDIT ledger transactions matches wallet');
    assert.strictEqual(fromCents(sumShowcaseCents), wallet.showcase_credit, 'Sum of SHOWCASE_CREDIT ledger transactions matches wallet');
    assert.strictEqual(fromCents(sumTopupCents), wallet.topup_credit, 'Sum of TOPUP_CREDIT ledger transactions matches wallet');
    assert.strictEqual(fromCents(sumPaidCents + sumWelcomeCents + sumShowcaseCents + sumTopupCents), wallet.total_balance, 'Total ledger matches total wallet balance');
  });

  // --------------------------------------------------------------------------
  // TEST 22: High-Precision Cents Math Validation (No Floating Point Drift)
  // --------------------------------------------------------------------------
  await test('Scenario 22: High-precision cents conversion math avoids floating-point anomalies', () => {
    assert.strictEqual(toCents(1400), 140000);
    assert.strictEqual(fromCents(140000), 1400);

    assert.strictEqual(toCents(1900.55), 190055);
    assert.strictEqual(fromCents(190055), 1900.55);

    // Test 0.1 + 0.2 standard float precision trap
    const floatSum = 0.1 + 0.2;
    assert.notStrictEqual(floatSum, 0.3); // standard JS float trap
    assert.strictEqual(fromCents(toCents(0.1) + toCents(0.2)), 0.3); // integer cents math fixes it!

    // Verify 20% cap calculation
    const eventPrice = 1400;
    const maxCreditCents = Math.round(toCents(eventPrice) * 0.2);
    assert.strictEqual(fromCents(maxCreditCents), 280.00);
  });

  console.log('\n================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed (Total: ${passed + failed})`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runFinancialReconciliationAudit().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
