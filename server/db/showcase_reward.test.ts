/**
 * Server-Side Tests for Event Showcase Approval & Wallet Reward Integration
 *
 * Verification Requirements:
 * 1. Approve first time -> +RM300 to showcase_credit (paid_balance = 0)
 * 2. Approve same Showcase again -> no additional RM300 (idempotent, alreadyRewarded = true)
 * 3. Retry same API / grant request -> no additional RM300
 * 4. Different Showcase from same organization -> follows existing one-time reward rule
 * 5. Wallet ledger contains exactly one Showcase Credit transaction for the organization
 * 6. Showcase stores the transaction ID (reward_transaction_id), reward_granted_at, and reward_status = 'GRANTED'
 * 7. RM300 remains separate from paid balance (no conversion into paid_balance or topup_credit)
 * 8. Non-approval actions (create, update, media upload, publish, unpublish) do NOT grant RM300
 */

import crypto from 'node:crypto';
import { getSupabaseServerClient } from '../supabase.js';
import { getNormalizedCurrentDate, localEventsCache } from './events.js';
import {
  createShowcase,
  updateShowcase,
  submitShowcaseForReview,
  approveShowcaseReview,
  publishShowcase,
  unpublishShowcase,
  getShowcaseById,
  getShowcaseByEventId,
} from './showcases.js';
import {
  createShowcaseMedia,
} from './showcaseMedia.js';
import {
  getWalletBalance,
  grantShowcaseCredit,
  getWalletTransactions,
  SHOWCASE_CREDIT_AMOUNT,
} from './wallet.js';

let passed = 0;
let failed = 0;

async function ensureTestOrg(orgId: string) {
  const supabase = getSupabaseServerClient();
  try {
    const { data: users } = await supabase.from('users').select('id').limit(1);
    const validOwnerId = users?.[0]?.id || '4c857d15-ab93-45a6-8de5-7858ab4d6bd2';
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
}

async function ensureTestEvent(eventId: string, orgId: string) {
  const supabase = getSupabaseServerClient();
  try {
    const { data: themes } = await supabase.from('game_themes').select('id').limit(1);
    const themeId = themes?.[0]?.id || '1a480be3-5313-49ba-a9c2-f5b2293576cf';
    const now = new Date().toISOString();
    const pastDate = '2026-09-01';
    const pastEndDate = '2026-09-02';
    const token = crypto.randomBytes(4).toString('hex').toUpperCase();

    // Cache the complete modern record
    localEventsCache.set(eventId, {
      id: eventId,
      organization_id: orgId,
      game_id: null,
      game_theme_id: themeId,
      name: `Test Event ${eventId.slice(0, 8)}`,
      event_date: pastDate,
      start_date: pastDate,
      end_date: pastEndDate,
      starts_at: '2026-09-01T00:00:00.000Z',
      expires_at: '2026-09-02T23:59:59.000Z',
      status: 'COMPLETED' as any,
      event_status: 'COMPLETED' as any,
      payment_status: 'PAID' as any,
      public_token: token,
      created_by: '4c857d15-ab93-45a6-8de5-7858ab4d6bd2',
      created_at: now,
      updated_at: now,
    });

    // Try upserting to remote database with fallback if columns do not exist
    const { error } = await supabase.from('events').upsert({
      id: eventId,
      organization_id: orgId,
      game_theme_id: themeId,
      name: `Test Event ${eventId.slice(0, 8)}`,
      event_date: pastDate,
      starts_at: '2026-09-01T00:00:00.000Z',
      expires_at: '2026-09-02T23:59:59.000Z',
      status: 'COMPLETED',
      public_token: token,
      created_by: '4c857d15-ab93-45a6-8de5-7858ab4d6bd2',
      created_at: now,
      updated_at: now,
    });
    if (error) {
      console.warn('Notice inserting test event into Supabase:', error.message);
    }
  } catch (err) {
    console.error('ensureTestEvent exception:', err);
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

function assertTrue(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - Condition was false`);
    failed++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log(' RUNNING SHOWCASE APPROVAL & WALLET REWARD TEST SUITE');
  console.log('======================================================\n');

  const adminUserId = '4c857d15-ab93-45a6-8de5-7858ab4d6bd2';

  // ----------------------------------------------------
  // TEST GROUP 1: NON-APPROVAL ACTIONS DO NOT GRANT REWARD
  // ----------------------------------------------------
  console.log('--- Test Group 1: Non-approval actions DO NOT grant reward ---');
  const org1Id = crypto.randomUUID();
  const event1Id = crypto.randomUUID();
  await ensureTestOrg(org1Id);
  await ensureTestEvent(event1Id, org1Id);

  // 1. Initial wallet is 0
  const initialWallet = await getWalletBalance(org1Id);
  assertEqual(initialWallet.showcase_credit, 0.00, 'Initial showcase_credit is RM0.00');
  assertEqual(initialWallet.paid_balance, 0.00, 'Initial paid_balance is RM0.00');

  // 2. Creating a Showcase does NOT grant reward
  const showcase1 = await createShowcase({
    event_id: event1Id,
    organization_id: org1Id,
    title: 'Festival 2026 Showcase',
    description: 'A great brand activation',
    client_name: 'Acme Beverages',
  });
  assertEqual(showcase1.review_status, 'DRAFT', 'Created showcase has review_status DRAFT');
  assertEqual(showcase1.reward_status, 'PENDING', 'Created showcase has reward_status PENDING');
  assertEqual(showcase1.reward_transaction_id, null, 'No reward transaction ID on creation');

  const walletAfterCreate = await getWalletBalance(org1Id);
  assertEqual(walletAfterCreate.showcase_credit, 0.00, 'Showcase creation does NOT grant RM300');

  // 3. Uploading Media does NOT grant reward
  await createShowcaseMedia({
    showcase_id: showcase1.id,
    organization_id: org1Id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/booth1.jpg',
    file_name: 'booth1.jpg',
    file_size: 102400,
    mime_type: 'image/jpeg',
    sort_order: 0,
  });
  await createShowcaseMedia({
    showcase_id: showcase1.id,
    organization_id: org1Id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/booth2.jpg',
    file_name: 'booth2.jpg',
    file_size: 102400,
    mime_type: 'image/jpeg',
    sort_order: 1,
  });
  await createShowcaseMedia({
    showcase_id: showcase1.id,
    organization_id: org1Id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/booth3.jpg',
    file_name: 'booth3.jpg',
    file_size: 102400,
    mime_type: 'image/jpeg',
    sort_order: 2,
  });

  const walletAfterMedia = await getWalletBalance(org1Id);
  assertEqual(walletAfterMedia.showcase_credit, 0.00, 'Media upload does NOT grant RM300');

  // 4. Updating Showcase content does NOT grant reward
  await updateShowcase(event1Id, {
    description: 'Updated comprehensive description for summer festival activation with interactive game booths and live leaderboards.',
  });
  const walletAfterUpdate = await getWalletBalance(org1Id);
  assertEqual(walletAfterUpdate.showcase_credit, 0.00, 'Updating showcase details does NOT grant RM300');

  // 5. Publishing / Unpublishing Showcase directly does NOT grant reward
  await publishShowcase(event1Id);
  const walletAfterPub = await getWalletBalance(org1Id);
  assertEqual(walletAfterPub.showcase_credit, 0.00, 'Direct publish does NOT grant RM300');

  await unpublishShowcase(event1Id);
  const walletAfterUnpub = await getWalletBalance(org1Id);
  assertEqual(walletAfterUnpub.showcase_credit, 0.00, 'Unpublishing showcase does NOT grant RM300');

  // ----------------------------------------------------
  // TEST GROUP 2: SUBMIT & APPROVE FIRST TIME -> +RM300
  // ----------------------------------------------------
  console.log('\n--- Test Group 2: Submit & Approve First Time -> +RM300 ---');

  // Submit showcase for review (must be published to meet eligibility criteria)
  await publishShowcase(event1Id);
  const submittedShowcase = await submitShowcaseForReview(event1Id);
  assertEqual(submittedShowcase.review_status, 'SUBMITTED', 'Showcase status is now SUBMITTED');
  assertTrue(!!submittedShowcase.submitted_at, 'submitted_at is set');

  const walletAfterSubmit = await getWalletBalance(org1Id);
  assertEqual(walletAfterSubmit.showcase_credit, 0.00, 'Submission does NOT grant RM300 (approval required)');

  // Admin APPROVES Showcase
  const approvalResult1 = await approveShowcaseReview(showcase1.id, adminUserId);
  assertEqual(approvalResult1.alreadyRewarded, false, 'First approval marks alreadyRewarded as false');
  assertEqual(approvalResult1.showcase.review_status, 'APPROVED', 'Showcase review_status is APPROVED');
  assertEqual(approvalResult1.showcase.status, 'PUBLISHED', 'Showcase status is PUBLISHED');
  assertEqual(approvalResult1.showcase.publication_status, 'PUBLISHED', 'Publication status is PUBLISHED');
  assertEqual(approvalResult1.showcase.reward_status, 'REWARDED', 'Showcase reward_status is REWARDED');
  assertTrue(!!approvalResult1.showcase.reward_granted_at, 'reward_granted_at timestamp is populated');
  assertTrue(!!approvalResult1.showcase.reward_transaction_id, 'reward_transaction_id is populated');
  assertEqual(approvalResult1.showcase.reviewed_by, adminUserId, 'reviewed_by is recorded');

  // Verify wallet balance
  const walletAfterApproval = await getWalletBalance(org1Id);
  assertEqual(walletAfterApproval.showcase_credit, 300.00, 'Wallet showcase_credit is exactly RM300.00');
  assertEqual(walletAfterApproval.paid_balance, 0.00, 'Wallet paid_balance remains RM0.00 (not mixed)');
  assertEqual(walletAfterApproval.topup_credit, 0.00, 'Wallet topup_credit remains RM0.00 (not mixed)');
  assertEqual(walletAfterApproval.welcome_credit, 0.00, 'Wallet welcome_credit remains RM0.00 (not mixed)');

  // Verify ledger entry
  const { transactions: txnsOrg1 } = await getWalletTransactions(org1Id);
  const showcaseTxns = txnsOrg1.filter((t) => t.transaction_type === 'SHOWCASE_CREDIT');
  assertEqual(showcaseTxns.length, 1, 'Exactly one SHOWCASE_CREDIT transaction exists in ledger');
  assertEqual(showcaseTxns[0].amount, 300.00, 'Transaction amount is RM300.00');
  assertEqual(showcaseTxns[0].balance_type, 'SHOWCASE_CREDIT', 'Transaction balance_type is SHOWCASE_CREDIT');
  assertEqual(showcaseTxns[0].id, approvalResult1.showcase.reward_transaction_id, 'Showcase reward_transaction_id matches ledger transaction ID');

  // ----------------------------------------------------
  // TEST GROUP 3: APPROVE SAME SHOWCASE AGAIN (IDEMPOTENCY)
  // ----------------------------------------------------
  console.log('\n--- Test Group 3: Approve Same Showcase Again (Idempotency) ---');

  const approvalResult2 = await approveShowcaseReview(showcase1.id, adminUserId);
  assertEqual(approvalResult2.alreadyRewarded, true, 'Subsequent approval returns alreadyRewarded = true');
  assertEqual(approvalResult2.showcase.review_status, 'APPROVED', 'Showcase remains APPROVED');
  assertEqual(approvalResult2.showcase.reward_status, 'REWARDED', 'Showcase reward_status remains REWARDED');
  assertEqual(approvalResult2.showcase.reward_transaction_id, approvalResult1.showcase.reward_transaction_id, 'reward_transaction_id remains unchanged');

  // Wallet balance must NOT increase
  const walletAfterDuplicateApprove = await getWalletBalance(org1Id);
  assertEqual(walletAfterDuplicateApprove.showcase_credit, 300.00, 'Wallet showcase_credit remains RM300.00 (not doubled to RM600)');
  assertEqual(walletAfterDuplicateApprove.paid_balance, 0.00, 'Wallet paid_balance remains RM0.00');

  const { transactions: txnsOrg1AfterDup } = await getWalletTransactions(org1Id);
  const showcaseTxnsAfterDup = txnsOrg1AfterDup.filter((t) => t.transaction_type === 'SHOWCASE_CREDIT');
  assertEqual(showcaseTxnsAfterDup.length, 1, 'Ledger still contains exactly ONE SHOWCASE_CREDIT transaction');

  // ----------------------------------------------------
  // TEST GROUP 4: RETRY API / GRANT REQUEST (IDEMPOTENCY)
  // ----------------------------------------------------
  console.log('\n--- Test Group 4: Direct Grant Retry / Reference ID Idempotency ---');

  const directGrantRetry = await grantShowcaseCredit({
    organizationId: org1Id,
    eventId: event1Id,
    createdBy: adminUserId,
    referenceId: `showcase_${showcase1.id}`,
  });
  assertEqual(directGrantRetry.alreadyGranted, true, 'grantShowcaseCredit reports alreadyGranted = true');
  assertEqual(directGrantRetry.wallet.showcase_credit, 300.00, 'Wallet showcase_credit remains RM300.00');

  // ----------------------------------------------------
  // TEST GROUP 5: SECOND SHOWCASE FOR SAME ORG (ONE-TIME RULE)
  // ----------------------------------------------------
  console.log('\n--- Test Group 5: Second Showcase for Same Organization (One-Time Rule) ---');
  const event2Id = crypto.randomUUID();
  await ensureTestEvent(event2Id, org1Id);

  const showcase2 = await createShowcase({
    event_id: event2Id,
    organization_id: org1Id,
    title: 'Winter Gala 2026 Showcase',
    description: 'Second event showcase for Acme brand activation with full interactive photo wall and game arcade leaderboards.',
    client_name: 'Acme Beverages',
  });

  await createShowcaseMedia({
    showcase_id: showcase2.id,
    organization_id: org1Id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/gala1.jpg',
    file_name: 'gala1.jpg',
    file_size: 204800,
    mime_type: 'image/jpeg',
    sort_order: 0,
  });
  await createShowcaseMedia({
    showcase_id: showcase2.id,
    organization_id: org1Id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/gala2.jpg',
    file_name: 'gala2.jpg',
    file_size: 204800,
    mime_type: 'image/jpeg',
    sort_order: 1,
  });
  await createShowcaseMedia({
    showcase_id: showcase2.id,
    organization_id: org1Id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/gala3.jpg',
    file_name: 'gala3.jpg',
    file_size: 204800,
    mime_type: 'image/jpeg',
    sort_order: 2,
  });

  await publishShowcase(event2Id);
  await submitShowcaseForReview(event2Id);

  // Admin approves second showcase
  const approvalResultOrg1Sc2 = await approveShowcaseReview(showcase2.id, adminUserId);
  assertEqual(approvalResultOrg1Sc2.showcase.review_status, 'APPROVED', 'Second showcase review_status is APPROVED');
  assertEqual(approvalResultOrg1Sc2.showcase.status, 'PUBLISHED', 'Second showcase is PUBLISHED');
  assertEqual(approvalResultOrg1Sc2.showcase.reward_status, 'REWARDED', 'Second showcase reward_status is marked REWARDED');
  assertEqual(approvalResultOrg1Sc2.alreadyRewarded, true, 'One-time rule: alreadyRewarded is true for org that already received reward');

  // Wallet must still only have RM300.00 from the one-time grant
  const walletAfterSecondSc = await getWalletBalance(org1Id);
  assertEqual(walletAfterSecondSc.showcase_credit, 300.00, 'Wallet showcase_credit remains RM300.00 (one-time reward per organization)');

  const { transactions: txnsAfterSecondSc } = await getWalletTransactions(org1Id);
  const totalShowcaseTxns = txnsAfterSecondSc.filter((t) => t.transaction_type === 'SHOWCASE_CREDIT');
  assertEqual(totalShowcaseTxns.length, 1, 'Exactly one SHOWCASE_CREDIT ledger entry exists for the organization across all showcases');

  // ----------------------------------------------------
  // TEST GROUP 6: DIFFERENT ORGANIZATION RECEIVES REWARD
  // ----------------------------------------------------
  console.log('\n--- Test Group 6: Different Organization Receives Reward ---');
  const org2Id = crypto.randomUUID();
  const event3Id = crypto.randomUUID();
  await ensureTestOrg(org2Id);
  await ensureTestEvent(event3Id, org2Id);

  const org2Showcase = await createShowcase({
    event_id: event3Id,
    organization_id: org2Id,
    title: 'Org 2 Launch Showcase',
    description: 'Beta Corp interactive product launch game arcade event showcase with live attendee leaderboards and real-time custom themes.',
    client_name: 'Beta Corp',
  });

  await createShowcaseMedia({
    showcase_id: org2Showcase.id,
    organization_id: org2Id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/beta1.jpg',
    file_name: 'beta1.jpg',
    file_size: 150000,
    mime_type: 'image/jpeg',
    sort_order: 0,
  });
  await createShowcaseMedia({
    showcase_id: org2Showcase.id,
    organization_id: org2Id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/beta2.jpg',
    file_name: 'beta2.jpg',
    file_size: 150000,
    mime_type: 'image/jpeg',
    sort_order: 1,
  });
  await createShowcaseMedia({
    showcase_id: org2Showcase.id,
    organization_id: org2Id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/beta3.jpg',
    file_name: 'beta3.jpg',
    file_size: 150000,
    mime_type: 'image/jpeg',
    sort_order: 2,
  });

  await publishShowcase(event3Id);
  await submitShowcaseForReview(event3Id);

  const org2Approval = await approveShowcaseReview(org2Showcase.id, adminUserId);
  assertEqual(org2Approval.alreadyRewarded, false, 'New organization first approval is rewarded');
  assertEqual(org2Approval.showcase.review_status, 'APPROVED', 'Org 2 showcase is APPROVED');

  const org2Wallet = await getWalletBalance(org2Id);
  assertEqual(org2Wallet.showcase_credit, 300.00, 'Org 2 wallet receives RM300.00 showcase credit');
  assertEqual(org2Wallet.paid_balance, 0.00, 'Org 2 paid_balance remains RM0.00');

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
