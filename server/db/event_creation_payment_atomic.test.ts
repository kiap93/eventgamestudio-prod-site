/**
 * EVENT CREATION PAYMENT ENFORCEMENT & ATOMIC ACID INTEGRITY TEST SUITE
 *
 * Verifies that:
 * 1. Event creation is strictly blocked if the organization has insufficient funds.
 * 2. Event creation and ledger deduction occur as a single atomic operation.
 * 3. Welcome Credit, Showcase Credit, Topup Credit, and Full Paid modes correctly calculate deductions.
 * 4. Events are stamped with PAID status, payment mode, paid amount, and discount amount.
 * 5. If payment fails or rolls back, no orphan event record remains in the database.
 */

import crypto from 'node:crypto';
import {
  createEventWithAtomicPayment,
  getEventById,
  deleteEvent,
} from './events.js';
import {
  getWalletBalance,
  createTopup,
  grantWelcomeCredit,
  grantShowcaseCredit,
  calculateEventPayment,
  STANDARD_EVENT_PRICE,
} from './wallet.js';
import { getSupabaseServerClient } from '../supabase.js';

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

async function runTests() {
  console.log('======================================================');
  console.log(' RUNNING EVENT CREATION PAYMENT ENFORCEMENT ACID TESTS');
  console.log('======================================================\n');

  const supabase = getSupabaseServerClient();

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Insufficient Balance Rejection (Zero Event Created)
  // --------------------------------------------------------------------------
  console.log('--- Test Group 1: Insufficient Balance Rejection ---');
  
  const org99 = crypto.randomUUID();
  const theme99 = '8463ed7c-2b78-4285-8fdf-c0b18383fb3d';

  // Only RM200 paid balance, need RM1,400
  await createTopup({ organizationId: org99, amount: 200.0, referenceId: `topup_test_99_${Date.now()}` });

  let rejected = false;
  try {
    await createEventWithAtomicPayment({
      organization_id: org99,
      game_theme_id: theme99,
      name: 'Unfunded Event Should Fail',
      starts_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      payment_mode: 'FULL_PAID',
    });
  } catch (err: any) {
    rejected = true;
    assert(
      err.message.includes('Insufficient wallet balance'),
      `Rejected with clear Insufficient Balance error message: "${err.message}"`
    );
  }

  assert(rejected, 'Unfunded event creation was blocked successfully');

  // Verify no event was created in database for Org 99
  const { data: orphanEvents } = await supabase
    .from('events')
    .select('*')
    .eq('organization_id', org99)
    .eq('name', 'Unfunded Event Should Fail');

  assert(
    !orphanEvents || orphanEvents.length === 0,
    'Zero orphan event records created in database when payment fails'
  );

  // --------------------------------------------------------------------------
  // TEST GROUP 2: Full Paid Event Creation & Atomic Deduction
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 2: Full Paid Event Creation & Atomic Deduction ---');

  const orgFullPaid = crypto.randomUUID();
  const themeFullPaid = '8463ed7c-2b78-4285-8fdf-c0b18383fb3d';

  await createTopup({ organizationId: orgFullPaid, amount: 3000.0, referenceId: `topup_fp_${Date.now()}` });

  const fullPaidResult = await createEventWithAtomicPayment({
    organization_id: orgFullPaid,
    game_theme_id: themeFullPaid,
    name: 'Mega Tech Launch 2026',
    starts_at: new Date(Date.now() + 3600000).toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    payment_mode: 'FULL_PAID',
  });

  assert(fullPaidResult.payment.success === true, 'Atomic payment succeeded for full paid event');
  assert(fullPaidResult.event.name === 'Mega Tech Launch 2026', 'Event record created with correct name');
  assert(fullPaidResult.event.payment_status === 'PAID', 'Event record stamped with payment_status: PAID');
  assert(fullPaidResult.event.payment_mode === 'FULL_PAID', 'Event record stamped with payment_mode: FULL_PAID');
  assert(fullPaidResult.event.paid_amount === 1400.0, 'Event record stamped with paid_amount: 1400.00');

  // Verify wallet balance is RM1,600 (3,000 - 1,400)
  const walletAfterFullPaid = await getWalletBalance(orgFullPaid);
  assert(
    walletAfterFullPaid.paid_balance === 1600.0,
    `Wallet paid balance correctly deducted: RM${walletAfterFullPaid.paid_balance}`,
    1600.0,
    walletAfterFullPaid.paid_balance
  );

  // --------------------------------------------------------------------------
  // TEST GROUP 3: Welcome Credit Event Creation & Atomic Split Deduction
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 3: Welcome Credit Event Creation & Atomic Split ---');

  const orgWelcome = crypto.randomUUID();
  const themeWelcome = '8463ed7c-2b78-4285-8fdf-c0b18383fb3d';

  await grantWelcomeCredit({ organizationId: orgWelcome });
  await createTopup({ organizationId: orgWelcome, amount: 1000.0, referenceId: `topup_w_${Date.now()}` });

  const welcomeResult = await createEventWithAtomicPayment({
    organization_id: orgWelcome,
    game_theme_id: themeWelcome,
    name: 'Agency Roadshow Kickoff',
    starts_at: new Date(Date.now() + 3600000).toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    payment_mode: 'WELCOME_CREDIT',
  });

  assert(welcomeResult.payment.success === true, 'Atomic payment succeeded with Welcome Credit');
  assert(welcomeResult.event.payment_mode === 'WELCOME_CREDIT', 'Event record payment_mode is WELCOME_CREDIT');
  assert(welcomeResult.event.paid_amount === 600.0, 'Event record paid_amount is RM600.00');
  assert(welcomeResult.event.discount_amount === 800.0, 'Event record discount_amount is RM800.00');

  const walletAfterWelcome = await getWalletBalance(orgWelcome);
  assert(
    walletAfterWelcome.welcome_credit === 0.0,
    `Welcome credit consumed to RM0.00`,
    0.0,
    walletAfterWelcome.welcome_credit
  );
  assert(
    walletAfterWelcome.paid_balance === 400.0,
    `Paid balance deducted by RM600 to RM400.00`,
    400.0,
    walletAfterWelcome.paid_balance
  );

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Showcase Credit Event Creation
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 4: Showcase Credit Event Creation ---');

  const orgShowcase = crypto.randomUUID();
  const themeShowcase = '8463ed7c-2b78-4285-8fdf-c0b18383fb3d';

  await grantShowcaseCredit({ organizationId: orgShowcase });
  await createTopup({ organizationId: orgShowcase, amount: 1500.0, referenceId: `topup_sc_${Date.now()}` });

  const showcaseResult = await createEventWithAtomicPayment({
    organization_id: orgShowcase,
    game_theme_id: themeShowcase,
    name: 'Showcase Rewarded Event',
    starts_at: new Date(Date.now() + 3600000).toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    payment_mode: 'SHOWCASE_CREDIT',
  });

  assert(showcaseResult.payment.success === true, 'Atomic payment succeeded with Showcase Credit');
  assert(showcaseResult.event.paid_amount === 1100.0, 'Paid amount is RM1,100.00');
  assert(showcaseResult.event.discount_amount === 300.0, 'Discount amount is RM300.00');

  const walletAfterShowcase = await getWalletBalance(orgShowcase);
  assert(
    walletAfterShowcase.showcase_credit === 0.0,
    `Showcase credit consumed to RM0.00`,
    0.0,
    walletAfterShowcase.showcase_credit
  );
  assert(
    walletAfterShowcase.paid_balance === 400.0,
    `Paid balance deducted to RM400.00`,
    400.0,
    walletAfterShowcase.paid_balance
  );

  // --------------------------------------------------------------------------
  // TEST SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
