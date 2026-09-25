import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  createShowcase,
  updateShowcase,
  getShowcaseByEventId,
  localShowcasesCache,
} from './db/showcases.js';
import {
  createShowcaseRewardSubmission,
  getPendingRewardSubmissions,
  clearLocalRewardSubmissionsCache,
} from './db/showcaseRewardSubmissions.js';
import { createShowcaseMedia } from './db/showcaseMedia.js';
import { localEventsCache } from './db/events.js';
import { localOrgsCache } from './db/organizations.js';
import {
  localWalletsCache,
  localTransactionsCache,
  localUserRewardsCache,
  localOwnerShowcaseRewardsCache,
} from './db/wallet.js';

console.log('========================================================================');
console.log('Running Showcase Autosave on Reward Submission Tests');
console.log('========================================================================\n');

// Clean caches
localEventsCache.clear();
localShowcasesCache.clear();
clearLocalRewardSubmissionsCache();
localOrgsCache.clear();
localWalletsCache.clear();
localTransactionsCache.clear();
localUserRewardsCache.clear();
localOwnerShowcaseRewardsCache.clear();

const testOrgId = 'org-autosave-' + crypto.randomUUID();
const testOwnerId = 'usr-owner-' + crypto.randomUUID();
const testEventId = 'evt-autosave-' + crypto.randomUUID();

localOrgsCache.set(testOrgId, {
  id: testOrgId,
  name: 'Autosave Test Org',
  owner_id: testOwnerId,
} as any);

localEventsCache.set(testEventId, {
  id: testEventId,
  organization_id: testOrgId,
  name: 'Autosave Annual Showcase Event',
  start_date: '2026-09-20',
  end_date: '2026-09-25',
  status: 'live',
  event_status: 'live',
  payment_status: 'PAID',
} as any);

// Setup mock client-side handler simulation matching EventShowcasePage logic
interface MockClientState {
  showcase: any | null;
  title: string;
  description: string;
  clientName: string;
  clientLogoUrl: string;
  coverImageUrl: string;
  saving: boolean;
  submittingReward: boolean;
  error: string | null;
  successMsg: string | null;
  rewardSubmission: any | null;
}

const createMockClient = (initialShowcase: any | null) => {
  const state: MockClientState = {
    showcase: initialShowcase,
    title: initialShowcase?.title || 'Autosave Showcase',
    description: initialShowcase?.description || '',
    clientName: initialShowcase?.client_name || '',
    clientLogoUrl: initialShowcase?.client_logo_url || '',
    coverImageUrl: initialShowcase?.cover_image_url || '',
    saving: false,
    submittingReward: false,
    error: null,
    successMsg: null,
    rewardSubmission: null,
  };

  const savingRef = { current: false };
  const submittingRewardRef = { current: false };
  const callLog: string[] = [];

  const hasUnsavedChanges = (): boolean => {
    if (!state.showcase) return true;

    const currentTitle = (state.title.trim() || 'Event Showcase').trim();
    const savedTitle = (state.showcase.title || 'Event Showcase').trim();
    if (currentTitle !== savedTitle) return true;

    const currentDesc = (state.description || '').trim();
    const savedDesc = (state.showcase.description || '').trim();
    if (currentDesc !== savedDesc) return true;

    const currentClientName = (state.clientName || '').trim();
    const savedClientName = (state.showcase.client_name || '').trim();
    if (currentClientName !== savedClientName) return true;

    const currentClientLogo = (state.clientLogoUrl || '').trim();
    const savedClientLogo = (state.showcase.client_logo_url || '').trim();
    if (currentClientLogo !== savedClientLogo) return true;

    const currentCoverImage = (state.coverImageUrl || '').trim();
    const savedCoverImage = (state.showcase.cover_image_url || '').trim();
    if (currentCoverImage !== savedCoverImage) return true;

    return false;
  };

  const handleSave = async (mockFail = false, options?: { silentSuccess?: boolean }): Promise<any | null> => {
    if (state.saving || savingRef.current) return null;
    savingRef.current = true;
    state.saving = true;
    state.error = null;
    if (!options?.silentSuccess) {
      state.successMsg = null;
    }

    callLog.push('SAVE_START');

    try {
      if (mockFail) {
        throw new Error('Unable to save showcase changes. Please try again.');
      }

      let saved: any;
      if (!state.showcase) {
        saved = await createShowcase(
          {
            event_id: testEventId,
            organization_id: testOrgId,
            title: state.title.trim(),
            description: state.description.trim() || null,
            client_name: state.clientName.trim() || null,
            client_logo_url: state.clientLogoUrl.trim() || null,
            cover_image_url: state.coverImageUrl.trim() || null,
            status: 'PUBLISHED',
          },
          {}
        );
      } else {
        saved = await updateShowcase(
          testEventId,
          {
            title: state.title.trim(),
            description: state.description.trim() || null,
            client_name: state.clientName.trim() || null,
            client_logo_url: state.clientLogoUrl.trim() || null,
            cover_image_url: state.coverImageUrl.trim() || null,
          },
          {},
          false
        );
      }

      state.showcase = saved;
      if (!options?.silentSuccess) {
        state.successMsg = 'Showcase saved successfully!';
      }
      callLog.push('SAVE_SUCCESS');
      return saved;
    } catch (err: any) {
      state.error = err.message || 'Failed to save showcase';
      callLog.push('SAVE_FAILED');
      return null;
    } finally {
      savingRef.current = false;
      state.saving = false;
    }
  };

  const handleSubmitReward = async (mockSaveFail = false) => {
    if (state.submittingReward || submittingRewardRef.current || state.saving || savingRef.current) {
      callLog.push('SUBMIT_BLOCKED_CONCURRENT');
      return;
    }

    try {
      submittingRewardRef.current = true;
      state.submittingReward = true;
      state.error = null;
      state.successMsg = null;

      callLog.push('SUBMIT_START');

      // If showcase has unsaved changes, automatically save first
      if (hasUnsavedChanges()) {
        const savedShowcase = await handleSave(mockSaveFail, { silentSuccess: true });
        if (!savedShowcase) {
          // Save failed: stop, do NOT submit reward
          callLog.push('SUBMIT_ABORTED_SAVE_FAILED');
          return;
        }
      }

      callLog.push('REWARD_SUBMIT_API_CALL');

      // Call backend reward submission
      const submission = await createShowcaseRewardSubmission({
        eventId: testEventId,
        userId: testOwnerId,
        env: {},
      });
      state.rewardSubmission = submission;
      state.successMsg = 'Your showcase has been submitted for RM300 reward review!';
      callLog.push('REWARD_SUBMIT_SUCCESS');
    } catch (err: any) {
      state.error = err.message || 'Failed to submit for RM300 reward';
      callLog.push('REWARD_SUBMIT_ERROR: ' + err.message);
    } finally {
      submittingRewardRef.current = false;
      state.submittingReward = false;
    }
  };

  return {
    state,
    hasUnsavedChanges,
    handleSave,
    handleSubmitReward,
    callLog,
    submittingRewardRef,
    savingRef,
  };
};

async function runTests() {
  // Test 1: Initial Showcase with required media
  console.log('Setting up published showcase with 3 media items...');
  const initialShowcase = await createShowcase(
    {
      event_id: testEventId,
      organization_id: testOrgId,
      title: 'Initial Showcase Title',
      description: 'Short initial description', // Only 25 chars initially
      status: 'PUBLISHED',
    },
    {}
  );

  // Add 3 media items so media criteria is met
  await createShowcaseMedia({
    showcase_id: initialShowcase.id,
    organization_id: testOrgId,
    media_type: 'IMAGE',
    media_url: 'https://example.com/p1.jpg',
    file_name: 'photo1.jpg',
    file_size: 1024,
    mime_type: 'image/jpeg',
  }, {});
  await createShowcaseMedia({
    showcase_id: initialShowcase.id,
    organization_id: testOrgId,
    media_type: 'IMAGE',
    media_url: 'https://example.com/p2.jpg',
    file_name: 'photo2.jpg',
    file_size: 1024,
    mime_type: 'image/jpeg',
  }, {});
  await createShowcaseMedia({
    showcase_id: initialShowcase.id,
    organization_id: testOrgId,
    media_type: 'IMAGE',
    media_url: 'https://example.com/p3.jpg',
    file_name: 'photo3.jpg',
    file_size: 1024,
    mime_type: 'image/jpeg',
  }, {});

  // ------------------------------------------------------------------------
  // Case 2: Unsaved changes + valid description (>= 50 chars) -> Save first, then Submit
  // ------------------------------------------------------------------------
  console.log('\n--- Case 2: Unsaved changes + valid description -> Save first, then Submit ---');
  {
    const client = createMockClient(initialShowcase);
    assert.strictEqual(client.hasUnsavedChanges(), false, 'Initially no unsaved changes');

    // User edits description to be valid (> 50 chars)
    const newValidDesc = 'This is an outstanding event showcase with more than fifty characters of detailed engagement notes!';
    client.state.description = newValidDesc;

    assert.strictEqual(client.hasUnsavedChanges(), true, 'Must detect unsaved changes after typing in description');

    // User clicks Submit for RM300 Reward
    await client.handleSubmitReward();

    // Verify order of calls
    assert.deepStrictEqual(
      client.callLog,
      ['SUBMIT_START', 'SAVE_START', 'SAVE_SUCCESS', 'REWARD_SUBMIT_API_CALL', 'REWARD_SUBMIT_SUCCESS'],
      'Must execute Save first and wait for success before calling reward submission API'
    );

    // Verify backend received the updated description
    const updatedInDb = await getShowcaseByEventId(testEventId, {});
    assert.strictEqual(updatedInDb?.description, newValidDesc, 'Database must have the newly saved description');

    // Verify submission is PENDING in backend
    assert.strictEqual(client.state.rewardSubmission?.status, 'PENDING');
    assert.strictEqual(client.state.error, null);
    assert.ok(client.state.successMsg?.includes('submitted for RM300 reward review'));
    console.log('✅ Case 2 passed: Successfully saved changes first, then submitted reward review!');
  }

  // ------------------------------------------------------------------------
  // Case 1: No unsaved changes + valid description -> Submit directly
  // ------------------------------------------------------------------------
  console.log('\n--- Case 1: No unsaved changes + valid description -> Submit directly ---');
  {
    // Reset submission cache for testing direct submission
    clearLocalRewardSubmissionsCache();

    // Get current showcase which now has >50 chars description
    const freshShowcase = await getShowcaseByEventId(testEventId, {});
    const client = createMockClient(freshShowcase);

    assert.strictEqual(client.hasUnsavedChanges(), false, 'Showcase has no unsaved changes');

    await client.handleSubmitReward();

    assert.deepStrictEqual(
      client.callLog,
      ['SUBMIT_START', 'REWARD_SUBMIT_API_CALL', 'REWARD_SUBMIT_SUCCESS'],
      'Must NOT call Save when there are no unsaved changes, submitting directly'
    );
    assert.strictEqual(client.state.rewardSubmission?.status, 'PENDING');
    console.log('✅ Case 1 passed: Submitted directly without saving when no unsaved changes!');
  }

  // ------------------------------------------------------------------------
  // Case 3: Unsaved changes + invalid description (<50 chars) -> Save first, then backend rejects
  // ------------------------------------------------------------------------
  console.log('\n--- Case 3: Unsaved changes + invalid description (< 50 chars) -> Save first, then backend rejects ---');
  {
    clearLocalRewardSubmissionsCache();
    const currentShowcase = await getShowcaseByEventId(testEventId, {});
    const client = createMockClient(currentShowcase);

    // User edits description to be too short (< 50 chars)
    client.state.description = 'Too short description.';
    assert.strictEqual(client.hasUnsavedChanges(), true, 'Must detect unsaved changes');

    await client.handleSubmitReward();

    // Order: Save should succeed (updating draft/showcase allows short desc), but reward submission fails on backend
    assert.strictEqual(client.callLog.includes('SAVE_START'), true, 'Must call save first');
    assert.strictEqual(client.callLog.includes('SAVE_SUCCESS'), true, 'Save succeeds');
    assert.strictEqual(client.callLog.includes('REWARD_SUBMIT_API_CALL'), true, 'Calls reward submission');
    assert.ok(
      client.callLog.some((c) => c.includes('Showcase description must be at least 50 characters')),
      'Backend returned 50-character validation error'
    );
    assert.strictEqual(client.state.error, 'Showcase description must be at least 50 characters to qualify for reward review.');
    assert.strictEqual(client.state.rewardSubmission, null, 'Reward submission must not be created');

    console.log('✅ Case 3 passed: Saved first, then backend properly returned 50-char validation error!');
  }

  // ------------------------------------------------------------------------
  // Case 4: Save fails -> do not submit reward
  // ------------------------------------------------------------------------
  console.log('\n--- Case 4: Save fails -> do not submit reward ---');
  {
    clearLocalRewardSubmissionsCache();
    const currentShowcase = await getShowcaseByEventId(testEventId, {});
    const client = createMockClient(currentShowcase);

    client.state.description = 'A completely new valid description with well over fifty characters to test failure handling.';
    assert.strictEqual(client.hasUnsavedChanges(), true);

    // Trigger submit with simulated save failure (e.g. network drop)
    await client.handleSubmitReward(true);

    assert.deepStrictEqual(
      client.callLog,
      ['SUBMIT_START', 'SAVE_START', 'SAVE_FAILED', 'SUBMIT_ABORTED_SAVE_FAILED'],
      'Must abort and NOT call reward submission API if save fails'
    );
    assert.strictEqual(client.state.error, 'Unable to save showcase changes. Please try again.');
    assert.strictEqual(client.state.rewardSubmission, null, 'Reward submission was NOT called');
    assert.strictEqual(client.state.description, 'A completely new valid description with well over fifty characters to test failure handling.', 'User edited data is retained');

    console.log('✅ Case 4 passed: Save failure halted submission, displayed error, and kept user input!');
  }

  // ------------------------------------------------------------------------
  // Case 5: Rapid multiple clicks -> no duplicate submissions
  // ------------------------------------------------------------------------
  console.log('\n--- Case 5: Rapid multiple clicks -> no duplicate submissions ---');
  {
    clearLocalRewardSubmissionsCache();
    // Restore valid description in DB
    await updateShowcase(
      testEventId,
      {
        description: 'Restored valid description with well over fifty characters for multi-click testing.',
      },
      {},
      false
    );

    const currentShowcase = await getShowcaseByEventId(testEventId, {});
    const client = createMockClient(currentShowcase);
    client.state.description = 'Modified valid description with well over fifty characters for concurrent test.';

    // Rapidly trigger 3 clicks simultaneously
    const p1 = client.handleSubmitReward();
    const p2 = client.handleSubmitReward();
    const p3 = client.handleSubmitReward();

    await Promise.all([p1, p2, p3]);

    const blockedCalls = client.callLog.filter((c) => c === 'SUBMIT_BLOCKED_CONCURRENT');
    const apiCalls = client.callLog.filter((c) => c === 'REWARD_SUBMIT_API_CALL');

    assert.strictEqual(blockedCalls.length, 2, 'Two subsequent rapid clicks were blocked');
    assert.strictEqual(apiCalls.length, 1, 'Only exactly 1 reward submission API call was made');
    assert.strictEqual(client.state.rewardSubmission?.status, 'PENDING');

    console.log('✅ Case 5 passed: Rapid clicks safely prevented duplicate submissions!');
  }

  // ------------------------------------------------------------------------
  // Case 6 & 7: Existing Save button continues working normally
  // ------------------------------------------------------------------------
  console.log('\n--- Case 6 & 7: Existing Save button continues working normally ---');
  {
    const currentShowcase = await getShowcaseByEventId(testEventId, {});
    const client = createMockClient(currentShowcase);

    client.state.title = 'Updated Title Via Standard Save';
    const result = await client.handleSave();

    assert.ok(result, 'Save succeeded');
    assert.strictEqual(client.state.successMsg, 'Showcase saved successfully!', 'Standard save sets its own success message');
    assert.strictEqual(result.title, 'Updated Title Via Standard Save');

    console.log('✅ Case 6 & 7 passed: Standard Save button continues working normally with success feedback!');
  }

  console.log('\n========================================================================');
  console.log('ALL SHOWCASE AUTOSAVE ON REWARD SUBMISSION TESTS PASSED!');
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
