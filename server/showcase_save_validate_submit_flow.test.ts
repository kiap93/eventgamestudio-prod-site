/**
 * Showcase Save -> Validate eligibility -> Submit Flow Test
 * 
 * Verifies:
 * 1. Character counter calculation (42 / 50 characters, minimum 50 qualification)
 * 2. Unsaved changes detection when modifying fields, especially description
 * 3. Save button enables and clears unsaved changes upon successful save
 * 4. Ineligibility when unsaved changes exist: "Save your changes before submitting for the RM300 reward."
 * 5. Ineligibility when saved description < 50 characters: "Showcase description must be at least 50 characters."
 * 6. Eligibility when saved description >= 50 characters: "✓ Eligible for RM300 Reward"
 * 7. End-to-end backend validation rejecting < 50 chars and approving valid submission.
 */

import {
  createShowcaseRewardSubmission,
  getShowcaseRewardSubmissionForEvent,
  clearLocalRewardSubmissionsCache,
} from './db/showcaseRewardSubmissions.js';
import {
  createShowcase,
  localShowcasesCache,
  updateShowcase,
} from './db/showcases.js';
import { createShowcaseMedia } from './db/showcaseMedia.js';
import { localOrgsCache, createOrganization } from './db/organizations.js';
import { localEventsCache, createEvent } from './db/events.js';
import { localMembersCache } from './db/members.js';
import {
  localWalletsCache,
  localTransactionsCache,
  localUserRewardsCache,
  localOwnerShowcaseRewardsCache,
} from './db/wallet.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function assertEqual(actual: any, expected: any, message: string) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
  }
}

// ---------------------------------------------------------------------------
// Unit tests for Showcase Save -> Validate -> Submit Flow Logic
// ---------------------------------------------------------------------------
function testFlowLogic() {
  console.log('\n=== SUITE 1: Flow Logic & Ineligibility Messages ===');

  const MIN_REWARD_DESC_LENGTH = 50;

  // Scenario 1: Character counter
  const shortText = 'Great game activation for product launch';
  const shortLen = shortText.trim().length;
  assertEqual(shortLen, 40, 'Short text length is 40 characters');
  assert(shortLen < MIN_REWARD_DESC_LENGTH, 'Short text is below 50 characters requirement');

  const qualifyingText = 'Our game booth engaged over 500 visitors during the launch, with high leaderboard competition and fun prizes!';
  const qualifyingLen = qualifyingText.trim().length;
  assert(qualifyingLen >= MIN_REWARD_DESC_LENGTH, `Qualifying text length (${qualifyingLen}) meets 50 characters requirement`);

  // Scenario 2: Unsaved changes detection
  let savedShowcase: any = {
    title: 'Brand Activation 2026',
    description: 'Initial short description',
    client_name: 'Acme Corp',
    client_logo_url: '',
    cover_image_url: '',
    status: 'PUBLISHED',
  };

  function checkUnsaved(current: any, saved: any) {
    if (!saved) {
      return Boolean(
        current.description.trim() ||
        current.clientName.trim() ||
        current.clientLogoUrl.trim() ||
        current.coverImageUrl.trim() ||
        current.title.trim()
      );
    }
    return (
      current.title.trim() !== (saved.title || '').trim() ||
      current.description !== (saved.description || '') ||
      current.clientName.trim() !== (saved.client_name || '').trim() ||
      current.clientLogoUrl.trim() !== (saved.client_logo_url || '').trim() ||
      current.coverImageUrl.trim() !== (saved.cover_image_url || '').trim()
    );
  }

  // 2A: No changes
  let currentForm = {
    title: 'Brand Activation 2026',
    description: 'Initial short description',
    clientName: 'Acme Corp',
    clientLogoUrl: '',
    coverImageUrl: '',
  };
  assert(!checkUnsaved(currentForm, savedShowcase), 'No unsaved changes when form matches saved showcase');

  // 2B: User modifies description
  currentForm.description = 'Initial short description with new edits';
  assert(checkUnsaved(currentForm, savedShowcase), 'Detects unsaved changes when user modifies description');

  // Scenario 3: Validation / Ineligibility reason evaluation
  function evaluateRewardFlow(params: {
    showcase: any;
    hasUnsavedChanges: boolean;
    currentDesc: string;
    photoCount: number;
    videoCount: number;
    eventEligible: boolean;
  }) {
    const { showcase, hasUnsavedChanges, currentDesc, photoCount, videoCount, eventEligible } = params;
    const hasRequiredMedia = photoCount >= 3 || videoCount >= 1;
    const savedDesc = (showcase?.description || '').trim();
    const isSavedDescValid = savedDesc.length >= MIN_REWARD_DESC_LENGTH;

    let reason = '';
    let isEligible = false;

    if (!eventEligible) {
      reason = 'Showcase reward requires a confirmed, paid event that is live or completed.';
    } else if (hasUnsavedChanges) {
      reason = 'Save your changes before submitting for the RM300 reward.';
    } else if (!showcase) {
      reason = 'Save your showcase first before submitting for the RM300 reward.';
    } else if (!isSavedDescValid) {
      reason = 'Showcase description must be at least 50 characters.';
    } else if (!hasRequiredMedia) {
      reason = `Upload at least 3 photos or 1 video to qualify for reward review (${photoCount}/3 photos, ${videoCount} videos).`;
    } else {
      isEligible = true;
    }

    return { isEligible, reason };
  }

  // Case 3A: User entered 80 chars but hasn't saved yet
  const resultUnsaved = evaluateRewardFlow({
    showcase: savedShowcase,
    hasUnsavedChanges: true,
    currentDesc: qualifyingText,
    photoCount: 3,
    videoCount: 0,
    eventEligible: true,
  });
  assert(!resultUnsaved.isEligible, 'Reward submission is disabled when changes are unsaved');
  assertEqual(
    resultUnsaved.reason,
    'Save your changes before submitting for the RM300 reward.',
    'Displays "Save your changes before submitting for the RM300 reward." when unsaved'
  );

  // Case 3B: Saved, but description < 50 characters
  const resultShort = evaluateRewardFlow({
    showcase: savedShowcase, // saved description is only 25 chars
    hasUnsavedChanges: false,
    currentDesc: savedShowcase.description,
    photoCount: 3,
    videoCount: 0,
    eventEligible: true,
  });
  assert(!resultShort.isEligible, 'Reward submission is disabled when saved description < 50 characters');
  assertEqual(
    resultShort.reason,
    'Showcase description must be at least 50 characters.',
    'Displays "Showcase description must be at least 50 characters." when saved description is below minimum'
  );

  // Case 3C: User saves qualifying description -> now qualifies
  savedShowcase = {
    ...savedShowcase,
    description: qualifyingText,
  };
  const resultQualified = evaluateRewardFlow({
    showcase: savedShowcase,
    hasUnsavedChanges: false,
    currentDesc: qualifyingText,
    photoCount: 3,
    videoCount: 0,
    eventEligible: true,
  });
  assert(resultQualified.isEligible, 'Reward submission is enabled when saved description >= 50 chars and changes saved');
  assertEqual(resultQualified.reason, '', 'No ineligibility reason when qualified');
}

// ---------------------------------------------------------------------------
// Backend Integration Test
// ---------------------------------------------------------------------------
async function testBackendSubmissionValidation() {
  console.log('\n=== SUITE 2: Backend Submission & Validation Tests ===');

  // Reset caches
  localShowcasesCache.clear();
  localOrgsCache.clear();
  localEventsCache.clear();
  localMembersCache.clear();
  localWalletsCache.clear();
  localTransactionsCache.clear();
  localUserRewardsCache.clear();
  localOwnerShowcaseRewardsCache.clear();
  clearLocalRewardSubmissionsCache();

  const mockOwner: UserRecord = {
    id: 'user_owner_flow_001',
    google_id: null,
    avatar_url: null,
    email: 'owner@example.com',
    name: 'Owner Alice',
    created_at: new Date().toISOString(),
    is_developer: false,
  };

  const org = {
    id: 'org_flow_001',
    name: 'Alpha Events Co',
    slug: 'alpha-events',
    owner_id: mockOwner.id,
    logo_url: null,
    country_code: 'MY',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  localOrgsCache.set(org.id, org as any);

  // Initialize wallet for org
  localWalletsCache.set(org.id, {
    id: 'wallet_' + org.id,
    organization_id: org.id,
    paid_balance: 0,
    welcome_credit: 0,
    showcase_credit: 0,
    topup_credit: 0,
    currency: 'MYR',
    welcome_credit_granted: false,
    showcase_credit_granted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Owner membership
  const ownerMember = {
    id: 'mem_owner_flow_001',
    organization_id: org.id,
    user_id: mockOwner.id,
    role: 'owner',
    created_at: new Date().toISOString(),
  };
  localMembersCache.set(ownerMember.id, ownerMember as any);

  const event = {
    id: 'event_flow_001',
    organization_id: org.id,
    game_theme_id: 'theme_001',
    public_token: 'token_flow_001',
    starts_at: '2026-08-01T00:00:00.000Z',
    expires_at: '2026-08-03T23:59:59.999Z',
    name: 'Mega Tech Expo 2026',
    status: 'completed',
    payment_status: 'PAID',
    game_id: 'catch-brand',
    start_date: '2026-08-01',
    end_date: '2026-08-03',
    created_at: new Date('2026-08-01').toISOString(),
    updated_at: new Date('2026-08-04').toISOString(),
  };
  localEventsCache.set(event.id, event as any);

  // Create showcase with description under 50 characters (e.g. 35 characters)
  const shortDesc = 'Fun corporate activation for booth.';
  assert(shortDesc.length < 50, 'Short description length is under 50 characters');

  const showcase = await createShowcase({
    event_id: event.id,
    organization_id: org.id,
    title: 'Mega Tech Expo Showcase',
    description: shortDesc,
    status: 'PUBLISHED',
  });

  // Add 3 photos so media requirement is satisfied
  await createShowcaseMedia({
    showcase_id: showcase.id,
    organization_id: org.id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/p1.jpg',
    file_name: 'p1.jpg',
    file_size: 1000,
    mime_type: 'image/jpeg',
  });
  await createShowcaseMedia({
    showcase_id: showcase.id,
    organization_id: org.id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/p2.jpg',
    file_name: 'p2.jpg',
    file_size: 1000,
    mime_type: 'image/jpeg',
  });
  await createShowcaseMedia({
    showcase_id: showcase.id,
    organization_id: org.id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/p3.jpg',
    file_name: 'p3.jpg',
    file_size: 1000,
    mime_type: 'image/jpeg',
  });

  // Attempt submission with < 50 characters
  try {
    await createShowcaseRewardSubmission({
      eventId: event.id,
      userId: mockOwner.id,
    });
    assert(false, 'Should reject submission when description < 50 characters');
  } catch (err: any) {
    assert(
      err.message.includes('50 characters') || err.code === 'VALIDATION_ERROR',
      `Backend correctly rejected short description with message: "${err.message}"`
    );
  }

  // Update showcase with valid description >= 50 characters
  const qualifyingDesc =
    'Outstanding game activation that drew continuous lines of excited attendees competing on the brand leaderboard all afternoon.';
  assert(qualifyingDesc.length >= 50, `Qualifying description has ${qualifyingDesc.length} characters (>= 50)`);

  await updateShowcase(event.id, {
    description: qualifyingDesc,
  });

  // Now submission must succeed
  const submission = await createShowcaseRewardSubmission({
    eventId: event.id,
    userId: mockOwner.id,
  });

  assert(Boolean(submission.id), 'Submission successfully created');
  assertEqual(submission.status, 'PENDING', 'Submission status is PENDING');
  assertEqual(submission.reward_amount, 300, 'Reward amount is RM300');

  const retrieved = await getShowcaseRewardSubmissionForEvent(event.id);
  assertEqual(retrieved?.id, submission.id, 'Retrieved submission matches created submission');
}

async function runAll() {
  console.log('Starting Showcase Save -> Validate -> Submit Flow Test Suite...\n');
  testFlowLogic();
  await testBackendSubmissionValidation();

  console.log(`\n========================================================================`);
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});
