import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  grantShowcaseCredit,
  getWalletBalance,
  getWalletTransactions,
  SHOWCASE_CREDIT_AMOUNT,
} from './wallet.js';
import {
  createShowcase,
  publishShowcase,
  approveShowcaseReward,
} from './showcases.js';
import { createShowcaseMedia } from './showcaseMedia.js';
import { localEventsCache } from './events.js';

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
    console.error(`  ✗ FAIL: ${testName} - Condition was false`);
    failed++;
  }
}

export async function runShowcaseRewardConcurrencyTests() {
  console.log('--- STARTING SHOWCASE REWARD CONCURRENCY & RACE CONDITION TESTS ---');

  const orgId = crypto.randomUUID();
  const eventId1 = crypto.randomUUID();
  const eventId2 = crypto.randomUUID();
  const adminA = crypto.randomUUID();
  const adminB = crypto.randomUUID();

  // Test 1: Verify wallet starts with 0 showcase_credit
  const initialWallet = await getWalletBalance(orgId);
  assertEqual(initialWallet.showcase_credit, 0, 'Initial showcase credit must be 0');

  // Test 2: Concurrent execution of grantShowcaseCredit by Admin A and Admin B
  // Admin A has reference "showcase_A", Admin B has reference "showcase_B"
  console.log('Simulating simultaneous grantShowcaseCredit requests from Admin A and Admin B...');
  const [resultA, resultB] = await Promise.all([
    grantShowcaseCredit({
      organizationId: orgId,
      eventId: eventId1,
      createdBy: adminA,
      referenceId: `showcase_${crypto.randomUUID()}`,
      metadata: { admin: 'Admin A', eventId: eventId1 },
    }),
    grantShowcaseCredit({
      organizationId: orgId,
      eventId: eventId2,
      createdBy: adminB,
      referenceId: `showcase_${crypto.randomUUID()}`,
      metadata: { admin: 'Admin B', eventId: eventId2 },
    }),
  ]);

  console.log('Result A alreadyGranted:', resultA.alreadyGranted);
  console.log('Result B alreadyGranted:', resultB.alreadyGranted);

  // Exactly one must have granted the credit, and the other must have received alreadyGranted: true
  const grantedCount = [resultA, resultB].filter((r) => !r.alreadyGranted).length;
  const alreadyGrantedCount = [resultA, resultB].filter((r) => r.alreadyGranted).length;

  assertEqual(grantedCount, 1, 'Exactly one concurrent request granted the reward');
  assertEqual(alreadyGrantedCount, 1, 'Exactly one concurrent request recognized reward was already granted');

  // Both results must reference the exact same transaction ID
  assertEqual(resultA.transaction.id, resultB.transaction.id, 'Both results reference the same transaction ID');

  // Check wallet balance
  const walletAfterConcurrent = await getWalletBalance(orgId);
  assertEqual(
    walletAfterConcurrent.showcase_credit,
    SHOWCASE_CREDIT_AMOUNT,
    `Showcase credit must be exactly RM${SHOWCASE_CREDIT_AMOUNT} (never doubled to RM${SHOWCASE_CREDIT_AMOUNT * 2})`
  );

  // Check ledger transactions for organization
  const { transactions: txns } = await getWalletTransactions(orgId);
  const showcaseTxns = txns.filter(
    (t) => t.transaction_type === 'SHOWCASE_CREDIT' && t.status === 'COMPLETED'
  );
  assertEqual(showcaseTxns.length, 1, 'Exactly 1 SHOWCASE_CREDIT transaction exists in ledger');

  // Test 3: Concurrent approveShowcaseReward on two different showcases from same org
  const orgId2 = crypto.randomUUID();
  const eventIdShowcase1 = crypto.randomUUID();
  const eventIdShowcase2 = crypto.randomUUID();

  localEventsCache.set(eventIdShowcase1, {
    id: eventIdShowcase1,
    organization_id: orgId2,
    game_id: null,
    game_theme_id: '1a480be3-5313-49ba-a9c2-f5b2293576cf',
    name: 'Concurrent Event 1',
    event_date: '2026-09-01',
    start_date: '2026-09-01',
    end_date: '2026-09-02',
    starts_at: '2026-09-01T00:00:00.000Z',
    expires_at: '2026-09-02T23:59:59.000Z',
    status: 'COMPLETED' as any,
    event_status: 'COMPLETED' as any,
    payment_status: 'PAID' as any,
    public_token: 'TOK1',
    created_by: adminA,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  localEventsCache.set(eventIdShowcase2, {
    id: eventIdShowcase2,
    organization_id: orgId2,
    game_id: null,
    game_theme_id: '1a480be3-5313-49ba-a9c2-f5b2293576cf',
    name: 'Concurrent Event 2',
    event_date: '2026-09-01',
    start_date: '2026-09-01',
    end_date: '2026-09-02',
    starts_at: '2026-09-01T00:00:00.000Z',
    expires_at: '2026-09-02T23:59:59.000Z',
    status: 'COMPLETED' as any,
    event_status: 'COMPLETED' as any,
    payment_status: 'PAID' as any,
    public_token: 'TOK2',
    created_by: adminB,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const showcase1 = await createShowcase({
    event_id: eventIdShowcase1,
    organization_id: orgId2,
    title: 'Concurrent Showcase 1',
    description: 'This is a comprehensive and detailed event showcase description with more than fifty characters.',
  });

  const showcase2 = await createShowcase({
    event_id: eventIdShowcase2,
    organization_id: orgId2,
    title: 'Concurrent Showcase 2',
    description: 'This is another comprehensive and detailed event showcase description with more than fifty characters.',
  });

  // Add 3 media items to showcase 1
  for (let i = 1; i <= 3; i++) {
    await createShowcaseMedia({
      showcase_id: showcase1.id,
      organization_id: orgId2,
      media_type: 'IMAGE',
      media_url: `https://example.com/img1_${i}.jpg`,
      file_name: `img1_${i}.jpg`,
      file_size: 102400,
      mime_type: 'image/jpeg',
      sort_order: i,
    });
  }

  // Add 3 media items to showcase 2
  for (let i = 1; i <= 3; i++) {
    await createShowcaseMedia({
      showcase_id: showcase2.id,
      organization_id: orgId2,
      media_type: 'IMAGE',
      media_url: `https://example.com/img2_${i}.jpg`,
      file_name: `img2_${i}.jpg`,
      file_size: 102400,
      mime_type: 'image/jpeg',
      sort_order: i,
    });
  }

  await publishShowcase(eventIdShowcase1);
  await publishShowcase(eventIdShowcase2);

  console.log('Triggering concurrent approveShowcaseReward on Showcase 1 and Showcase 2...');
  const [approval1, approval2] = await Promise.all([
    approveShowcaseReward(showcase1.id, adminA),
    approveShowcaseReward(showcase2.id, adminB),
  ]);

  console.log('Showcase 1 alreadyRewarded:', approval1.alreadyRewarded);
  console.log('Showcase 2 alreadyRewarded:', approval2.alreadyRewarded);

  // Total granted count across both showcase approvals must be 1
  const approvalsNewReward = [approval1, approval2].filter((a) => !a.alreadyRewarded).length;
  assertEqual(approvalsNewReward, 1, 'Only one showcase approval granted new reward credit');

  const walletOrg2 = await getWalletBalance(orgId2);
  assertEqual(
    walletOrg2.showcase_credit,
    SHOWCASE_CREDIT_AMOUNT,
    `Organization 2 showcase credit must be exactly RM${SHOWCASE_CREDIT_AMOUNT}`
  );

  console.log(`\nConcurrency Tests Completed: ${passed} passed, ${failed} failed.`);
  assert.strictEqual(failed, 0, `All concurrency tests must pass (failed: ${failed})`);
}

// Run test directly if executed via tsx
runShowcaseRewardConcurrencyTests().catch((err) => {
  console.error('Showcase reward concurrency test failed:', err);
  process.exit(1);
});
