/**
 * REGRESSION TEST: EVENT CREATION ROLLBACK ON SETUP DAY
 *
 * Specifically verifies that:
 * When an event is being created on its Setup Day (or starting tomorrow/today)
 * and payment processing fails:
 * 1. Internal rollback mechanism successfully removes the newly inserted event record
 *    without being blocked by the "Setup Day has started" deletion protection trigger.
 * 2. NO orphan event record remains in the database or cache.
 * 3. NO wallet balance deduction occurs (balances remain completely intact).
 * 4. NO orphan payment or credit ledger transactions exist.
 * 5. Normal event deletion protection remains strictly enforced (users cannot delete
 *    an existing event on or after Setup Day).
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  createEvent,
  createEventWithAtomicPayment,
  getEventById,
  deleteEvent,
  canDeleteEvent,
  localEventsCache,
  rollbackFailedEventCreation,
} from './events.js';
import {
  createOrganization,
} from './organizations.js';
import {
  ensureDefaultGame,
} from './games.js';
import {
  createTheme,
} from './themes.js';
import {
  createTopup,
  getWalletBalance,
  getLedgerTransactions,
  localWalletsCache,
  localTransactionsCache,
} from './wallet.js';
import { getSupabaseServerClient } from '../supabase.js';

let passed = 0;
let failed = 0;

function assertCondition(condition: boolean, message: string, expected?: any, actual?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}` + (expected !== undefined ? ` (expected ${expected}, got ${actual})` : ''));
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}` + (expected !== undefined ? ` (expected ${expected}, got ${actual})` : ''));
    failed++;
  }
}

async function runRegressionTests() {
  console.log('========================================================================');
  console.log(' REGRESSION TEST: EVENT CREATION ROLLBACK ON SETUP DAY + PAYMENT FAILURE');
  console.log('========================================================================\n');

  const supabase = getSupabaseServerClient();

  // Calculate dates so that TODAY is precisely Setup Day:
  // Setup Day = start_date - 1 calendar day
  // Therefore, start_date = tomorrow!
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dayAfterTomorrow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const pad = (n: number) => String(n).padStart(2, '0');
  const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const startDate = formatDate(tomorrow);
  const endDate = formatDate(dayAfterTomorrow);

  console.log(`Test Context:`);
  console.log(`  Today (Evaluation Date) : ${formatDate(now)}`);
  console.log(`  Event Start Date        : ${startDate} (Tomorrow)`);
  console.log(`  Event End Date          : ${endDate}`);
  console.log(`  Calculated Setup Day    : ${formatDate(now)} (TODAY IS SETUP DAY!)\n`);

  // --------------------------------------------------------------------------
  // TEST SCENARIO 1: Setup Day + createEvent() + Payment Failure
  // = NO orphan event + NO wallet deduction + NO payment transaction
  // --------------------------------------------------------------------------
  console.log('--- Test Scenario 1: Setup Day Event Creation with Payment Failure ---');

  const orgId = (await createOrganization({ name: 'Setup Day Rollback Org', owner_id: crypto.randomUUID() })).id;
  const game = await ensureDefaultGame(orgId, 'Test Catch Brand Game');
  const theme = (await createTheme({ organization_id: orgId, game_id: game.id, name: 'Setup Day Theme' })).id;

  // Fund wallet with RM 3,000
  const initialTopupAmount = 3000.0;
  await createTopup({
    organizationId: orgId,
    amount: initialTopupAmount,
    referenceId: `topup_rollback_test_${Date.now()}`,
  });

  const walletBefore = await getWalletBalance(orgId);
  assertCondition(
    walletBefore.paid_balance === initialTopupAmount,
    `Initial wallet balance is RM${initialTopupAmount}`,
    initialTopupAmount,
    walletBefore.paid_balance
  );

  const txnsBefore = await getLedgerTransactions(orgId);
  const initialTxnCount = txnsBefore.length;

  // Simulate payment processing failure during atomic creation
  // We mock processEventPayment via env.__processEventPayment
  let caughtError: any = null;
  let interceptedEventId: string | null = null;

  const mockPaymentEnv = {
    ...process.env,
    __processEventPayment: async (params: any, env?: any) => {
      interceptedEventId = params.eventId;
      console.log(`  [SIMULATION] Intercepting payment for event ${params.eventId} on Setup Day... Simulating payment gateway crash!`);

      // Simulate a partial operation: create a temporary failed transaction before crashing
      localTransactionsCache.set(`tx_sim_${Date.now()}`, {
        id: `tx_sim_${Date.now()}`,
        organization_id: params.organizationId,
        event_id: params.eventId,
        transaction_type: 'EVENT_PAYMENT',
        balance_type: 'PAID_BALANCE',
        amount: -1400.0,
        currency: 'MYR',
        status: 'PENDING',
        reference_id: `ref_sim_${Date.now()}`,
        description: 'Simulated pending deduction',
        metadata: {},
        created_by: params.createdBy || null,
        created_at: new Date().toISOString(),
      } as any);

      // Deduct wallet balance locally to simulate partial financial step before crash
      const w = localWalletsCache.get(params.organizationId);
      if (w) {
        w.paid_balance -= 1400.0;
        localWalletsCache.set(params.organizationId, w);
      }

      const simErr: any = new Error('Simulated payment gateway timeout during ledger write');
      simErr.code = 'PAYMENT_GATEWAY_TIMEOUT';
      simErr.status = 502;
      throw simErr;
    },
  };

  try {
    await createEventWithAtomicPayment(
      {
        organization_id: orgId,
        game_theme_id: theme,
        name: 'Setup Day Crash Event',
        start_date: startDate,
        end_date: endDate,
        starts_at: `${startDate}T00:00:00.000Z`,
        expires_at: `${endDate}T23:59:59.999Z`,
        payment_mode: 'FULL_PAID',
      },
      mockPaymentEnv
    );
  } catch (err: any) {
    caughtError = err;
    console.log(`  [CAUGHT] Creation threw expected error: "${err.message}" (code: ${err.code})`);
  }

  // 1. Verify that the creation call rejected
  assertCondition(
    caughtError !== null && caughtError.message.includes('Simulated payment gateway timeout'),
    'createEventWithAtomicPayment threw the payment failure error'
  );

  // 2. Verify: NO orphan event record in database or cache
  assertCondition(interceptedEventId !== null, 'An event ID was generated and intercepted');

  if (interceptedEventId) {
    const orphanInCache = localEventsCache.has(interceptedEventId);
    assertCondition(
      !orphanInCache,
      'NO orphan event in localEventsCache after rollback'
    );

    const fetchedOrphan = await getEventById(interceptedEventId);
    assertCondition(
      fetchedOrphan === null || fetchedOrphan === undefined,
      'NO orphan event retrieved via getEventById'
    );

    const { data: dbEvents } = await supabase
      .from('events')
      .select('id')
      .eq('id', interceptedEventId);

    assertCondition(
      !dbEvents || dbEvents.length === 0,
      'NO orphan event record exists in Supabase events table'
    );
  }

  // 3. Verify: NO wallet deduction occurred (balance is 100% restored)
  const walletAfter = await getWalletBalance(orgId);
  assertCondition(
    walletAfter.paid_balance === initialTopupAmount,
    `NO wallet deduction: Wallet paid balance remained RM${initialTopupAmount}`,
    initialTopupAmount,
    walletAfter.paid_balance
  );

  // 4. Verify: NO lingering payment transaction for the rolled back event
  const txnsAfter = await getLedgerTransactions(orgId);
  const eventTxns = txnsAfter.filter((t) => t.event_id === interceptedEventId);
  assertCondition(
    eventTxns.length === 0,
    `NO payment transaction: Zero transactions found for event ${interceptedEventId}`,
    0,
    eventTxns.length
  );
  assertCondition(
    txnsAfter.length === initialTxnCount,
    `Total transaction count unchanged at ${initialTxnCount}`,
    initialTxnCount,
    txnsAfter.length
  );

  // --------------------------------------------------------------------------
  // TEST SCENARIO 2: Public Deletion Protection Still Strictly Blocks Setup Day
  // --------------------------------------------------------------------------
  console.log('\n--- Test Scenario 2: Public Deletion Protection Remains Enforced on Setup Day ---');

  // Create a regular event that starts tomorrow (today = Setup Day)
  const setupDayEvent = await createEvent({
    organization_id: orgId,
    game_theme_id: theme,
    name: 'Existing Setup Day Event',
    start_date: startDate,
    end_date: endDate,
    starts_at: `${startDate}T00:00:00.000Z`,
    expires_at: `${endDate}T23:59:59.999Z`,
    status: 'draft',
    event_status: 'DRAFT',
    payment_status: 'UNPAID',
    paid_amount: 0,
  });

  // Verify canDeleteEvent reports false on Setup Day
  const eligibility = canDeleteEvent(setupDayEvent, now);
  assertCondition(
    eligibility.canDelete === false,
    'canDeleteEvent strictly returns false on Setup Day',
    false,
    eligibility.canDelete
  );
  assertCondition(
    eligibility.code === 'SETUP_DAY_STARTED',
    'canDeleteEvent code is SETUP_DAY_STARTED',
    'SETUP_DAY_STARTED',
    eligibility.code
  );

  // Verify normal deleteEvent rejects this deletion
  let deleteRejected = false;
  try {
    await deleteEvent(setupDayEvent.id, { now });
  } catch (delErr: any) {
    deleteRejected = true;
    assertCondition(
      delErr.message.includes('Setup Day has started') || delErr.code === 'SETUP_DAY_STARTED',
      `deleteEvent rejected with message: "${delErr.message}"`
    );
  }
  assertCondition(
    deleteRejected,
    'Normal deleteEvent strictly rejected deletion on Setup Day'
  );

  // Verify event is STILL in the database (was not deleted)
  const stillExists = await getEventById(setupDayEvent.id);
  assertCondition(
    stillExists !== null && stillExists !== undefined,
    'Existing event was protected and remains in database'
  );

  // --------------------------------------------------------------------------
  // TEST SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
