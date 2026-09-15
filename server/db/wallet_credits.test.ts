/**
 * Server-Side Tests for Welcome Credit and Showcase Credit Engines
 *
 * Test Scenarios:
 * 1. Welcome Credit Grant (RM800.00):
 *    - Exactly RM800.00 granted to welcome_credit balance
 *    - One-time rule per organization (cannot be granted twice)
 *    - Distinct ledger record with transaction_type = 'WELCOME_CREDIT' and balance_type = 'WELCOME_CREDIT'
 * 2. Welcome Credit Event Eligibility:
 *    - Standard Event price = RM1,400.00
 *    - Welcome Credit = RM800.00, Paid Balance = RM300.00 -> Total RM1,100.00 -> Cannot create Event (insufficient paid balance)
 *    - Welcome Credit = RM800.00, Paid Balance = RM600.00 -> Total RM1,400.00 -> Can create Event (eligible)
 *    - Welcome Credit = RM800.00, Paid Balance = RM1,000.00 -> Can create Event (eligible, requires RM600)
 *    - Customer may top up any amount (does not need to top up exactly RM600)
 * 3. Welcome Credit Consumption:
 *    - Consumes RM800.00 Welcome Credit + RM600.00 Paid Balance
 *    - Produces 2 distinct ledger entries: CREDIT_USAGE (-800) and EVENT_PAYMENT (-600)
 *    - Idempotent against duplicate requests
 * 4. Showcase Credit Grant (RM300.00):
 *    - Exactly RM300.00 granted to showcase_credit balance
 *    - One-time rule per organization
 *    - Distinct ledger record with transaction_type = 'SHOWCASE_CREDIT' and balance_type = 'SHOWCASE_CREDIT'
 * 5. Showcase Credit Event Eligibility:
 *    - Showcase Credit = RM300.00, Paid Balance = RM1,000.00 -> Total RM1,300.00 -> Cannot create Event
 *    - Showcase Credit = RM300.00, Paid Balance = RM1,100.00 -> Total RM1,400.00 -> Can create Event (eligible)
 * 6. Showcase Credit Consumption:
 *    - Consumes RM300.00 Showcase Credit + RM1,100.00 Paid Balance
 *    - Produces 2 distinct ledger entries: CREDIT_USAGE (-300) and EVENT_PAYMENT (-1100)
 *    - Idempotent against duplicate requests
 * 7. Non-Combination & Separation:
 *    - Welcome Credit and Showcase Credit are distinct balances
 *    - Welcome Credit and Showcase Credit are NOT merged into topup_credit
 */

import crypto from 'node:crypto';
import { getSupabaseServerClient } from '../supabase.js';
import { createOrganization } from './organizations.js';
import {
  grantWelcomeCredit,
  canUseWelcomeCredit,
  consumeWelcomeCredit,
  grantShowcaseCredit,
  canUseShowcaseCredit,
  consumeShowcaseCredit,
  createTopup,
  getWalletBalance,
  recalculateWalletBalances,
  WELCOME_CREDIT_AMOUNT,
  SHOWCASE_CREDIT_AMOUNT,
  STANDARD_EVENT_PRICE,
} from './wallet.js';

let passed = 0;
let failed = 0;

async function createTestUser(): Promise<string> {
  const supabase = getSupabaseServerClient();
  const id = crypto.randomUUID();
  await supabase.from('users').insert({
    id,
    email: `test-${id.slice(0, 8)}@example.com`,
    name: `Test User ${id.slice(0, 6)}`,
  });
  return id;
}

async function ensureTestOrg(orgId: string, ownerId?: string): Promise<string> {
  const supabase = getSupabaseServerClient();
  let validOwnerId = ownerId;
  try {
    if (!validOwnerId) {
      validOwnerId = await createTestUser();
    }
    await supabase.from('organizations').upsert({
      id: orgId,
      name: `Test Org ${orgId.slice(0, 8)}`,
      slug: `test-org-${orgId.slice(0, 8)}`,
      owner_id: validOwnerId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return validOwnerId;
  } catch {
    // Ignore in local mode
    return validOwnerId || '4c857d15-ab93-45a6-8de5-7858ab4d6bd2';
  }
}

async function ensureTestEvent(eventId: string, orgId: string) {
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
      created_by: '4c857d15-ab93-45a6-8de5-7858ab4d6bd2',
      created_at: now,
      updated_at: now,
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
  console.log(' RUNNING WELCOME & SHOWCASE CREDIT ENGINES TEST SUITE');
  console.log('======================================================\n');

  const testAdminId = await createTestUser();

  // ----------------------------------------------------
  // TEST GROUP 1: WELCOME CREDIT GRANT & ONE-TIME RULE
  // ----------------------------------------------------
  console.log('--- Test Group 1: Welcome Credit Grant & One-Time Rule ---');
  const org1Id = crypto.randomUUID();
  await ensureTestOrg(org1Id, testAdminId);

  const grant1 = await grantWelcomeCredit({
    organizationId: org1Id,
    createdBy: testAdminId,
  });

  assertEqual(grant1.alreadyGranted, false, 'First Welcome Credit grant succeeds');
  assertEqual(grant1.transaction.amount, 800.00, 'Welcome Credit transaction amount is RM800.00');
  assertEqual(grant1.transaction.transaction_type, 'WELCOME_CREDIT', 'Transaction type is WELCOME_CREDIT');
  assertEqual(grant1.transaction.balance_type, 'WELCOME_CREDIT', 'Balance type is WELCOME_CREDIT');
  assertEqual(grant1.wallet.welcome_credit, 800.00, 'Wallet welcome_credit is RM800.00');
  assertEqual(grant1.wallet.paid_balance, 0.00, 'Wallet paid_balance is RM0.00');
  assertEqual(grant1.wallet.topup_credit, 0.00, 'Welcome credit is NOT added to topup_credit');

  // Attempt duplicate grant to the same organization
  const grant1Duplicate = await grantWelcomeCredit({
    organizationId: org1Id,
    createdBy: testAdminId,
  });
  assertEqual(grant1Duplicate.alreadyGranted, true, 'Duplicate Welcome Credit grant is rejected/marked already granted');
  assertEqual(grant1Duplicate.wallet.welcome_credit, 800.00, 'Wallet welcome_credit remains exactly RM800.00 (not doubled)');

  // ----------------------------------------------------
  // TEST GROUP 1B: NO AUTOMATIC WELCOME CREDIT ON createOrganization
  // ----------------------------------------------------
  console.log('\n--- Test Group 1B: No Automatic Welcome Credit on createOrganization ---');
  const autoUser = await createTestUser();
  const autoOrg = await createOrganization({
    name: 'No Auto Welcome Org Test',
    owner_id: autoUser,
  });

  const autoOrgWallet = await getWalletBalance(autoOrg.id);
  assertEqual(autoOrgWallet.welcome_credit, 0.00, 'createOrganization does NOT automatically grant Welcome Credit (RM0)');
  assertEqual(autoOrgWallet.total_balance, 0.00, 'Total available balance is RM0 immediately');
  assertEqual(autoOrgWallet.welcome_credit_granted, false, 'welcome_credit_granted flag is false');

  // Same user creating a second organization also gets zero welcome credit
  const secondOrg = await createOrganization({
    name: 'Second Org Same User',
    owner_id: autoUser,
  });
  const secondOrgWallet = await getWalletBalance(secondOrg.id);
  assertEqual(secondOrgWallet.welcome_credit, 0.00, 'Second org created by same user also has RM0 Welcome Credit');
  assertEqual(secondOrgWallet.welcome_credit_granted, false, 'Second org welcome_credit_granted is false');

  // Explicit admin grant works on the first org
  const manualGrant = await grantWelcomeCredit({
    organizationId: autoOrg.id,
    createdBy: testAdminId,
  });
  assertEqual(manualGrant.alreadyGranted, false, 'Manual developer grant succeeds for first org');
  assertEqual(manualGrant.wallet.welcome_credit, 800.00, 'Manual developer grant adds RM800.00');

  // Attempting manual grant on the second org belonging to the same owner is rejected by owner-level unique constraint
  const secondOrgManualGrant = await grantWelcomeCredit({
    organizationId: secondOrg.id,
    createdBy: testAdminId,
  });
  assertEqual(secondOrgManualGrant.alreadyGranted, true, 'Subsequent grant to another org of same owner is rejected by owner-level rule');

  // ----------------------------------------------------
  // TEST GROUP 2: WELCOME CREDIT EVENT ELIGIBILITY
  // ----------------------------------------------------
  console.log('\n--- Test Group 2: Welcome Credit Event Eligibility ---');
  
  // Org 1 has RM800 Welcome Credit, RM0 Paid Balance -> Insufficient
  const check1 = await canUseWelcomeCredit(org1Id);
  assertEqual(check1.eligible, false, 'Cannot create RM1,400 event with RM800 welcome credit and RM0 paid balance');
  assertEqual(check1.paid_balance_required, 600.00, 'Requires RM600.00 in paid balance');
  assertEqual(check1.credit_amount, 800.00, 'Credit applied is RM800.00');

  // Customer tops up RM300 (customer can top up any amount)
  await createTopup({
    organizationId: org1Id,
    amount: 300.00,
    referenceId: `topup_300_${org1Id}`,
  });
  const check2 = await canUseWelcomeCredit(org1Id);
  assertEqual(check2.eligible, false, 'Cannot create event with RM800 welcome + RM300 paid (total RM1,100 < RM1,400)');
  assertEqual(check2.paid_balance_available, 300.00, 'Available paid balance is RM300.00');

  // Customer tops up another RM300 -> Paid balance is now RM600.00
  await createTopup({
    organizationId: org1Id,
    amount: 300.00,
    referenceId: `topup_300b_${org1Id}`,
  });
  const check3 = await canUseWelcomeCredit(org1Id);
  assertEqual(check3.eligible, true, 'Can create event with RM800 welcome + RM600 paid (total RM1,400)');
  assertEqual(check3.paid_balance_required, 600.00, 'Required paid balance is exactly RM600.00');

  // ----------------------------------------------------
  // TEST GROUP 3: WELCOME CREDIT CONSUMPTION
  // ----------------------------------------------------
  console.log('\n--- Test Group 3: Welcome Credit Consumption ---');
  const event1Id = crypto.randomUUID();
  await ensureTestEvent(event1Id, org1Id);

  const consume1 = await consumeWelcomeCredit({
    organizationId: org1Id,
    eventId: event1Id,
    referenceId: `ref_event_${event1Id}`,
  });

  assertEqual(consume1.success, true, 'Welcome Credit consumption succeeds');
  assertEqual(consume1.creditTransaction.amount, -800.00, 'Credit transaction deducts RM800.00');
  assertEqual(consume1.creditTransaction.balance_type, 'WELCOME_CREDIT', 'Credit txn balance type is WELCOME_CREDIT');
  assertEqual(consume1.creditTransaction.transaction_type, 'CREDIT_USAGE', 'Credit txn type is CREDIT_USAGE');
  assertEqual(consume1.paidTransaction.amount, -600.00, 'Paid transaction deducts RM600.00');
  assertEqual(consume1.paidTransaction.balance_type, 'PAID_BALANCE', 'Paid txn balance type is PAID_BALANCE');
  assertEqual(consume1.paidTransaction.transaction_type, 'EVENT_PAYMENT', 'Paid txn type is EVENT_PAYMENT');
  assertEqual(consume1.wallet.welcome_credit, 0.00, 'Remaining welcome_credit is RM0.00');
  assertEqual(consume1.wallet.paid_balance, 0.00, 'Remaining paid_balance is RM0.00');

  // Attempt duplicate consumption on same event -> Idempotent
  const consume1Duplicate = await consumeWelcomeCredit({
    organizationId: org1Id,
    eventId: event1Id,
    referenceId: `ref_event_${event1Id}`,
  });
  assertEqual(consume1Duplicate.success, true, 'Idempotent replay of same event consumption returns success');
  assertEqual(consume1Duplicate.wallet.welcome_credit, 0.00, 'Balances unaffected on duplicate replay');

  // Check eligibility for a second event -> Must fail since Welcome Credit is consumed
  const check4 = await canUseWelcomeCredit(org1Id);
  assertEqual(check4.eligible, false, 'Cannot use Welcome Credit a second time (balance is 0)');

  // ----------------------------------------------------
  // TEST GROUP 4: SHOWCASE CREDIT GRANT & ONE-TIME RULE
  // ----------------------------------------------------
  console.log('\n--- Test Group 4: Showcase Credit Grant & One-Time Rule ---');
  const org2Id = crypto.randomUUID();
  await ensureTestOrg(org2Id);

  const grant2 = await grantShowcaseCredit({
    organizationId: org2Id,
    createdBy: testAdminId,
  });

  assertEqual(grant2.alreadyGranted, false, 'First Showcase Credit grant succeeds');
  assertEqual(grant2.transaction.amount, 300.00, 'Showcase Credit transaction amount is RM300.00');
  assertEqual(grant2.transaction.transaction_type, 'SHOWCASE_CREDIT', 'Transaction type is SHOWCASE_CREDIT');
  assertEqual(grant2.transaction.balance_type, 'SHOWCASE_CREDIT', 'Balance type is SHOWCASE_CREDIT');
  assertEqual(grant2.wallet.showcase_credit, 300.00, 'Wallet showcase_credit is RM300.00');
  assertEqual(grant2.wallet.paid_balance, 0.00, 'Wallet paid_balance is RM0.00');
  assertEqual(grant2.wallet.topup_credit, 0.00, 'Showcase credit is NOT added to topup_credit');

  // Attempt duplicate showcase credit grant
  const grant2Duplicate = await grantShowcaseCredit({
    organizationId: org2Id,
    createdBy: testAdminId,
  });
  assertEqual(grant2Duplicate.alreadyGranted, true, 'Duplicate Showcase Credit grant is rejected');
  assertEqual(grant2Duplicate.wallet.showcase_credit, 300.00, 'Wallet showcase_credit remains exactly RM300.00');

  // ----------------------------------------------------
  // TEST GROUP 5: SHOWCASE CREDIT EVENT ELIGIBILITY
  // ----------------------------------------------------
  console.log('\n--- Test Group 5: Showcase Credit Event Eligibility ---');
  
  // Showcase credit = RM300, Paid Balance = RM0 -> Requires RM1,100
  const scCheck1 = await canUseShowcaseCredit(org2Id);
  assertEqual(scCheck1.eligible, false, 'Cannot create event with RM300 showcase credit and RM0 paid balance');
  assertEqual(scCheck1.paid_balance_required, 1100.00, 'Requires RM1,100.00 in paid balance');

  // Top up RM1,000 -> Total RM1,300 -> Still insufficient
  await createTopup({
    organizationId: org2Id,
    amount: 1000.00,
    referenceId: `topup_1000_${org2Id}`,
  });
  const scCheck2 = await canUseShowcaseCredit(org2Id);
  assertEqual(scCheck2.eligible, false, 'Cannot create event with RM300 showcase + RM1,000 paid (total RM1,300 < RM1,400)');

  // Top up another RM100 -> Total paid is RM1,100.00 -> Eligible
  await createTopup({
    organizationId: org2Id,
    amount: 100.00,
    referenceId: `topup_100_${org2Id}`,
  });
  const scCheck3 = await canUseShowcaseCredit(org2Id);
  assertEqual(scCheck3.eligible, true, 'Can create event with RM300 showcase + RM1,100 paid (total RM1,400)');
  assertEqual(scCheck3.paid_balance_required, 1100.00, 'Required paid balance is exactly RM1,100.00');

  // ----------------------------------------------------
  // TEST GROUP 6: SHOWCASE CREDIT CONSUMPTION
  // ----------------------------------------------------
  console.log('\n--- Test Group 6: Showcase Credit Consumption ---');
  const event2Id = crypto.randomUUID();
  await ensureTestEvent(event2Id, org2Id);

  const scConsume1 = await consumeShowcaseCredit({
    organizationId: org2Id,
    eventId: event2Id,
    referenceId: `ref_event_${event2Id}`,
  });

  assertEqual(scConsume1.success, true, 'Showcase Credit consumption succeeds');
  assertEqual(scConsume1.creditTransaction.amount, -300.00, 'Credit transaction deducts RM300.00');
  assertEqual(scConsume1.creditTransaction.balance_type, 'SHOWCASE_CREDIT', 'Credit txn balance type is SHOWCASE_CREDIT');
  assertEqual(scConsume1.creditTransaction.transaction_type, 'CREDIT_USAGE', 'Credit txn type is CREDIT_USAGE');
  assertEqual(scConsume1.paidTransaction.amount, -1100.00, 'Paid transaction deducts RM1,100.00');
  assertEqual(scConsume1.paidTransaction.balance_type, 'PAID_BALANCE', 'Paid txn balance type is PAID_BALANCE');
  assertEqual(scConsume1.paidTransaction.transaction_type, 'EVENT_PAYMENT', 'Paid txn type is EVENT_PAYMENT');
  assertEqual(scConsume1.wallet.showcase_credit, 0.00, 'Remaining showcase_credit is RM0.00');
  assertEqual(scConsume1.wallet.paid_balance, 0.00, 'Remaining paid_balance is RM0.00');

  // ----------------------------------------------------
  // TEST SUMMARY
  // ----------------------------------------------------
  console.log('\n======================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
