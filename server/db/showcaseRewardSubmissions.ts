import {
  getSupabaseServerClient,
  isSupabaseConfigured,
  isLocalFallbackAllowed,
  isProductionEnvironment,
} from '../supabase.js';
import {
  ShowcaseRewardSubmissionRecord,
  ShowcaseRewardSubmissionStatus,
} from './types.js';
import {
  getShowcaseById,
  getShowcaseByEventId,
  updateShowcase,
  approveShowcaseReward,
  rejectShowcaseReward,
} from './showcases.js';
import { getShowcaseMedia } from './showcaseMedia.js';
import { getEventById } from './events.js';
import { getOrganizationById } from './organizations.js';
import {
  getShowcaseRewardEligibility,
  hasUserClaimedReward,
  isUserOrganizationOwner,
} from './rewards.js';
import {
  withUserRewardLock,
  hasUserReceivedShowcaseCredit,
} from './wallet.js';
import { getUserById } from './users.js';
import { isEventEligibleForShowcaseRewardSubmission } from './events.js';

// In-memory cache for local development fallback and test environments
export const localRewardSubmissionsCache = new Map<string, ShowcaseRewardSubmissionRecord>();

export function clearLocalRewardSubmissionsCache(): void {
  localRewardSubmissionsCache.clear();
}

/**
 * Creates a dedicated showcase reward submission record for a published, completed event showcase.
 * Strictly verifies owner-level eligibility, one-time lifetime rules, and locks against race conditions.
 */
export async function createShowcaseRewardSubmission(params: {
  eventId: string;
  userId: string;
  env?: Record<string, any>;
}): Promise<ShowcaseRewardSubmissionRecord> {
  const { eventId, userId, env } = params;

  if (!eventId || !userId) {
    const err = new Error('Event ID and User ID are required.');
    (err as any).code = 'VALIDATION_ERROR';
    (err as any).status = 400;
    throw err;
  }

  // Acquire user reward lock to prevent concurrent duplicate submissions
  return await withUserRewardLock(userId, async () => {
    // 1. Fetch Event
    const event = await getEventById(eventId, env);
    if (!event) {
      const err = new Error('Event not found.');
      (err as any).code = 'EVENT_NOT_FOUND';
      (err as any).status = 404;
      throw err;
    }

    // 2. Verify User is Organization Owner (strictly Owner-level promotion)
    const isOwner = await isUserOrganizationOwner(userId, event.organization_id, env);
    if (!isOwner) {
      const err = new Error(
        'Only organization owners are eligible to submit for the RM300 Showcase Reward. Organization members cannot receive promotional rewards.'
      );
      (err as any).code = 'OWNER_ONLY_REWARD';
      (err as any).status = 403;
      throw err;
    }

    // 3. Fetch Showcase
    const showcase = await getShowcaseByEventId(eventId, env);
    if (!showcase) {
      const err = new Error('Event showcase not found. Please create and publish the showcase first.');
      (err as any).code = 'SHOWCASE_NOT_FOUND';
      (err as any).status = 404;
      throw err;
    }

    if (showcase.status === 'BLOCKED' || showcase.status === 'DELETED') {
      const err = new Error(`Showcase is ${showcase.status.toLowerCase()} and cannot be submitted for rewards.`);
      (err as any).code = 'SHOWCASE_NOT_ELIGIBLE';
      (err as any).status = 403;
      throw err;
    }

    if (showcase.status !== 'PUBLISHED' && showcase.publication_status !== 'PUBLISHED') {
      const err = new Error('Showcase must be published before submitting for the RM300 reward.');
      (err as any).code = 'SHOWCASE_NOT_PUBLISHED';
      (err as any).status = 422;
      throw err;
    }

    // 4. Verify Event Eligibility (Must be PAID and STARTED: LIVE or COMPLETED)
    const rewardSubmissionElig = isEventEligibleForShowcaseRewardSubmission(event);
    if (!rewardSubmissionElig.eligible) {
      const err = new Error(
        rewardSubmissionElig.reason || 'Showcase reward submission is available once the event starts.'
      );
      (err as any).code = rewardSubmissionElig.code || 'EVENT_NOT_STARTED';
      (err as any).status = 422;
      throw err;
    }

    // 5. Verify Content Quality (Title, Description >= 50 chars, Media >= 3 images or >= 1 video)
    if (!showcase.title || !showcase.title.trim()) {
      const err = new Error('Showcase title is required.');
      (err as any).code = 'VALIDATION_ERROR';
      (err as any).status = 422;
      throw err;
    }

    const trimmedDesc = (showcase.description || '').trim();
    if (trimmedDesc.length < 50) {
      const err = new Error('Showcase description must be at least 50 characters to qualify for reward review.');
      (err as any).code = 'VALIDATION_ERROR';
      (err as any).status = 422;
      throw err;
    }

    const mediaList = await getShowcaseMedia(showcase.id, showcase.organization_id, env);
    const imageCount = (mediaList || []).filter(
      (m) => m.media_type === 'IMAGE' || (!m.media_type && !m.mime_type?.startsWith('video/'))
    ).length;
    const videoCount = (mediaList || []).filter(
      (m) => m.media_type === 'VIDEO' || m.mime_type?.startsWith('video/')
    ).length;
    const hasRequiredMedia = imageCount >= 3 || videoCount >= 1;

    if (!hasRequiredMedia) {
      const err = new Error('Showcase must have at least 3 photos or 1 video uploaded to qualify for reward review.');
      (err as any).code = 'INSUFFICIENT_MEDIA';
      (err as any).status = 422;
      throw err;
    }

    // 6. Authoritative Lifetime Reward Eligibility Verification
    const eligibility = await getShowcaseRewardEligibility(userId, env);
    if (!eligibility.eligible) {
      if (eligibility.alreadyClaimed || eligibility.userRewardStatus === 'REWARDED' || eligibility.code === 'LIFETIME_REWARD_EXHAUSTED') {
        const err = new Error(
          eligibility.reason || 'RM300 Showcase Reward has already been claimed for this account.'
        );
        (err as any).code = 'LIFETIME_REWARD_EXHAUSTED';
        (err as any).status = 422;
        throw err;
      }
      if (eligibility.hasPendingSubmission || eligibility.code === 'SUBMISSION_PENDING') {
        const err = new Error(
          eligibility.reason || 'You already have a showcase reward submission pending review. Only one active claim is allowed per account.'
        );
        (err as any).code = 'SUBMISSION_PENDING';
        (err as any).status = 409;
        throw err;
      }
      const err = new Error(
        eligibility.reason || 'RM300 Showcase Reward has already been claimed for this account.'
      );
      (err as any).code = 'LIFETIME_REWARD_EXHAUSTED';
      (err as any).status = 422;
      throw err;
    }

    const alreadyReceived =
      (await hasUserReceivedShowcaseCredit(userId, env)) ||
      (await hasUserClaimedReward(userId, 'SHOWCASE_REWARD', env)) ||
      (await hasUserClaimedReward(userId, 'SHOWCASE_CREDIT', env));

    if (alreadyReceived) {
      const err = new Error(
        'RM300 Showcase Reward has already been claimed for this account.'
      );
      (err as any).code = 'LIFETIME_REWARD_EXHAUSTED';
      (err as any).status = 422;
      throw err;
    }

    // 7. Check for Existing Submissions in Database / Cache
    if (isSupabaseConfigured(env)) {
      const supabase = getSupabaseServerClient(env);

      // Check if user already has an APPROVED submission
      const { data: approvedSub } = await supabase
        .from('showcase_reward_submissions')
        .select('id, status')
        .eq('user_id', userId)
        .eq('status', 'APPROVED')
        .limit(1)
        .maybeSingle();

      if (approvedSub) {
        const err = new Error('RM300 Showcase Reward has already been claimed for this account.');
        (err as any).code = 'LIFETIME_REWARD_EXHAUSTED';
        (err as any).status = 422;
        throw err;
      }

      // Check if user already has a PENDING submission
      const { data: pendingUserSub } = await supabase
        .from('showcase_reward_submissions')
        .select('id, status, submitted_at')
        .eq('user_id', userId)
        .eq('status', 'PENDING')
        .limit(1)
        .maybeSingle();

      if (pendingUserSub) {
        const err = new Error(
          'You already have a showcase reward submission pending review. Only one pending submission is allowed at a time.'
        );
        (err as any).code = 'SUBMISSION_PENDING';
        (err as any).status = 409;
        throw err;
      }

      // Check if this showcase already has a PENDING submission
      const { data: pendingShowcaseSub } = await supabase
        .from('showcase_reward_submissions')
        .select('id, status, submitted_at')
        .eq('showcase_id', showcase.id)
        .eq('status', 'PENDING')
        .limit(1)
        .maybeSingle();

      if (pendingShowcaseSub) {
        const err = new Error('This showcase is already submitted and pending reward review.');
        (err as any).code = 'SUBMISSION_PENDING';
        (err as any).status = 409;
        throw err;
      }
    }

    // Local in-memory check (for development / fallback)
    for (const sub of localRewardSubmissionsCache.values()) {
      if (sub.user_id === userId && sub.status === 'APPROVED') {
        const err = new Error('RM300 Showcase Reward has already been claimed for this account.');
        (err as any).code = 'LIFETIME_REWARD_EXHAUSTED';
        (err as any).status = 422;
        throw err;
      }
      if (sub.user_id === userId && sub.status === 'PENDING') {
        const err = new Error(
          'You already have a showcase reward submission pending review. Only one pending submission is allowed at a time.'
        );
        (err as any).code = 'SUBMISSION_PENDING';
        (err as any).status = 409;
        throw err;
      }
      if (sub.showcase_id === showcase.id && sub.status === 'PENDING') {
        const err = new Error('This showcase is already submitted and pending reward review.');
        (err as any).code = 'SUBMISSION_PENDING';
        (err as any).status = 409;
        throw err;
      }
    }

    // 8. Create Submission Record
    const now = new Date().toISOString();
    const submissionRecord: ShowcaseRewardSubmissionRecord = {
      id: crypto.randomUUID(),
      showcase_id: showcase.id,
      event_id: event.id,
      user_id: userId,
      status: 'PENDING',
      reward_amount: 300.0,
      submitted_at: now,
      reviewed_at: null,
      reviewed_by: null,
      rejection_reason: null,
      reward_transaction_id: null,
      created_at: now,
      updated_at: now,
    };

    if (isSupabaseConfigured(env)) {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('showcase_reward_submissions')
        .insert(submissionRecord)
        .select('*')
        .single();

      if (error) {
        // Unique constraint violation check (code 23505)
        if (error.code === '23505') {
          const detail = String(error.details || error.message || '');
          if (detail.includes('ux_showcase_reward_submissions_user_approved')) {
            const err = new Error('RM300 Showcase Reward has already been claimed for this account.');
            (err as any).code = 'LIFETIME_REWARD_EXHAUSTED';
            (err as any).status = 422;
            throw err;
          }
          if (detail.includes('ux_showcase_reward_submissions_showcase_pending')) {
            const err = new Error('This showcase is already submitted and pending reward review.');
            (err as any).code = 'SUBMISSION_PENDING';
            (err as any).status = 409;
            throw err;
          }
          const err = new Error(
            'You already have a showcase reward submission pending review. Only one pending submission is allowed at a time.'
          );
          (err as any).code = 'SUBMISSION_PENDING';
          (err as any).status = 409;
          throw err;
        }

        if (!isLocalFallbackAllowed(env)) {
          console.error('[Showcase Reward Submission DB Error]:', error);
          const err = new Error(`Failed to create reward submission: ${error.message}`);
          (err as any).code = error.code || 'DATABASE_ERROR';
          (err as any).status = 500;
          throw err;
        }
      }

      if (data) {
        localRewardSubmissionsCache.set(data.id, data as ShowcaseRewardSubmissionRecord);
      }
    }

    // Always keep local cache in sync
    localRewardSubmissionsCache.set(submissionRecord.id, submissionRecord);

    // 9. Update showcase state to sync with submission
    await updateShowcase(
      eventId,
      {
        reward_review_status: 'AWAITING_APPROVAL',
        reward_status: 'PENDING',
        reward_rejection_reason: null,
        owner_user_id: userId,
        submitted_at: now,
      },
      env,
      true
    ).catch((e) => console.warn('Could not sync showcase reward status on submission:', e));

    return submissionRecord;
  });
}

/**
 * Retrieves the latest showcase reward submission for an event or showcase.
 */
export async function getShowcaseRewardSubmissionForEvent(
  eventId: string,
  env?: Record<string, any>
): Promise<ShowcaseRewardSubmissionRecord | null> {
  if (!eventId) return null;

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    try {
      const { data, error } = await supabase
        .from('showcase_reward_submissions')
        .select('*')
        .eq('event_id', eventId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        localRewardSubmissionsCache.set(data.id, data as ShowcaseRewardSubmissionRecord);
        return data as ShowcaseRewardSubmissionRecord;
      }
    } catch (err) {
      if (!isLocalFallbackAllowed(env)) throw err;
    }
  }

  // Local fallback
  const matching = Array.from(localRewardSubmissionsCache.values())
    .filter((s) => s.event_id === eventId)
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());

  return matching[0] || null;
}

/**
 * Retrieves a submission by its ID.
 */
export async function getShowcaseRewardSubmissionById(
  submissionId: string,
  env?: Record<string, any>
): Promise<ShowcaseRewardSubmissionRecord | null> {
  if (!submissionId) return null;

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    try {
      const { data, error } = await supabase
        .from('showcase_reward_submissions')
        .select('*')
        .eq('id', submissionId)
        .maybeSingle();

      if (!error && data) {
        localRewardSubmissionsCache.set(data.id, data as ShowcaseRewardSubmissionRecord);
        return data as ShowcaseRewardSubmissionRecord;
      }
    } catch (err) {
      if (!isLocalFallbackAllowed(env)) throw err;
    }
  }

  return localRewardSubmissionsCache.get(submissionId) || null;
}

/**
 * Fetches all pending showcase reward submissions for administrative approval.
 * Ordered by submitted_at ASC (oldest pending first).
 * Enriches submissions with showcase, event, and submitter organization details.
 */
export async function getPendingRewardSubmissions(
  env?: Record<string, any>,
  filterStatus: string = 'PENDING'
): Promise<any[]> {
  let submissions: ShowcaseRewardSubmissionRecord[] = [];

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    try {
      let query = supabase
        .from('showcase_reward_submissions')
        .select('*')
        .order('submitted_at', { ascending: true });

      if (filterStatus !== 'ALL') {
        query = query.eq('status', filterStatus);
      }

      const { data, error } = await query;
      if (!error && data) {
        submissions = data as ShowcaseRewardSubmissionRecord[];
        for (const s of submissions) {
          localRewardSubmissionsCache.set(s.id, s);
        }
      }
    } catch (err) {
      if (!isLocalFallbackAllowed(env)) throw err;
    }
  }

  if (isLocalFallbackAllowed(env)) {
    const existingIds = new Set(submissions.map((s) => s.id));
    for (const s of localRewardSubmissionsCache.values()) {
      if (!existingIds.has(s.id) && (filterStatus === 'ALL' || s.status === filterStatus)) {
        submissions.push(s);
      }
    }
    submissions.sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
  }

  // Enrich items with metadata
  const enrichedList: any[] = [];
  for (const sub of submissions) {
    const showcase = await getShowcaseById(sub.showcase_id, env);
    const event = await getEventById(sub.event_id, env);
    const org = event?.organization_id ? await getOrganizationById(event.organization_id, env) : null;
    const submitter = await getUserById(sub.user_id, env).catch(() => null);

    let mediaCount = { images: 0, videos: 0, total: 0 };
    if (showcase?.id && org?.id) {
      try {
        const mediaList = await getShowcaseMedia(showcase.id, org.id, env);
        const images = (mediaList || []).filter(
          (m) => m.media_type === 'IMAGE' || (!m.media_type && !m.mime_type?.startsWith('video/'))
        ).length;
        const videos = (mediaList || []).filter(
          (m) => m.media_type === 'VIDEO' || m.mime_type?.startsWith('video/')
        ).length;
        mediaCount = { images, videos, total: images + videos };
      } catch {
        // Ignore media count lookup error
      }
    }

    enrichedList.push({
      ...sub,
      submission_id: sub.id,
      showcase_id: sub.showcase_id,
      showcase_title: showcase?.title || event?.name || 'Event Showcase',
      event_id: sub.event_id,
      event_name: event?.name || 'Event',
      user_id: sub.user_id,
      submitter_name: submitter?.name || 'Account Owner',
      submitter_email: submitter?.email || '',
      organization_id: org?.id || '',
      organization_name: org?.name || 'Organization',
      cover_image_url: showcase?.cover_image_url || null,
      media_count: mediaCount,
    });
  }

  return enrichedList;
}

/**
 * Retrieves any active (PENDING or APPROVED) showcase reward submission for a user.
 */
export async function getActiveUserShowcaseRewardSubmission(
  userId: string,
  env?: Record<string, any>
): Promise<ShowcaseRewardSubmissionRecord | null> {
  if (!userId) return null;

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    try {
      const { data, error } = await supabase
        .from('showcase_reward_submissions')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['APPROVED', 'PENDING'])
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        localRewardSubmissionsCache.set(data.id, data as ShowcaseRewardSubmissionRecord);
        return data as ShowcaseRewardSubmissionRecord;
      }
    } catch (err) {
      if (!isLocalFallbackAllowed(env)) throw err;
    }
  }

  // Local fallback
  const matching = Array.from(localRewardSubmissionsCache.values())
    .filter((s) => s.user_id === userId && (s.status === 'APPROVED' || s.status === 'PENDING'))
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());

  return matching[0] || null;
}

/**
 * Approve a showcase reward submission:
 * 1. Checks that submission is in PENDING state.
 * 2. Locks against user reward concurrency.
 * 3. Re-checks user lifetime eligibility across all events.
 * 4. Grants RM300 atomically using approveShowcaseReward (which invokes approve_first_event_showcase_reward_atomic).
 * 5. Updates submission status to APPROVED with reviewed_at, reviewed_by, and reward_transaction_id.
 * 6. Ensures submission is removed from pending queue.
 */
export async function approveShowcaseRewardSubmission(params: {
  submissionId: string;
  reviewerId: string;
  env?: Record<string, any>;
}): Promise<{
  submission: ShowcaseRewardSubmissionRecord;
  showcase: any;
  reward: any;
  alreadyRewarded: boolean;
}> {
  const { submissionId, reviewerId, env } = params;

  const submission = await getShowcaseRewardSubmissionById(submissionId, env);
  if (!submission) {
    const err = new Error('Reward submission not found.');
    (err as any).code = 'SUBMISSION_NOT_FOUND';
    (err as any).status = 404;
    throw err;
  }

  // Idempotency: if already approved for THIS submission, return cleanly
  if (submission.status === 'APPROVED') {
    const showcase = await getShowcaseById(submission.showcase_id, env);
    return {
      submission,
      showcase,
      reward: null,
      alreadyRewarded: true,
    };
  }

  if (submission.status === 'REJECTED') {
    const err = new Error('Cannot approve a reward submission that has already been rejected.');
    (err as any).code = 'SUBMISSION_ALREADY_REJECTED';
    (err as any).status = 422;
    throw err;
  }

  return await withUserRewardLock(submission.user_id, async () => {
    // Re-verify that user has not ALREADY received/been approved for a showcase reward
    const eligibility = await getShowcaseRewardEligibility(submission.user_id, env);
    if (eligibility.alreadyClaimed || eligibility.userRewardStatus === 'REWARDED') {
      const err = new Error('First-event reward invariant violation: Owner has already received a lifetime showcase reward credit.');
      (err as any).code = 'LIFETIME_REWARD_EXHAUSTED';
      (err as any).status = 422;
      throw err;
    }

    // Grant the RM300 showcase reward atomically
    const result = await approveShowcaseReward(submission.showcase_id, reviewerId, env);

    const now = new Date().toISOString();
    const rewardTxnId =
      result.showcase?.reward_transaction_id ||
      result.reward?.transaction?.id ||
      submission.reward_transaction_id ||
      null;

    const updatedSubmission: ShowcaseRewardSubmissionRecord = {
      ...submission,
      status: 'APPROVED',
      reviewed_at: now,
      reviewed_by: reviewerId,
      reward_transaction_id: rewardTxnId,
      updated_at: now,
    };

    if (isSupabaseConfigured(env)) {
      const supabase = getSupabaseServerClient(env);
      try {
        const { error: updateErr } = await supabase
          .from('showcase_reward_submissions')
          .update({
            status: 'APPROVED',
            reviewed_at: now,
            reviewed_by: reviewerId,
            reward_transaction_id: rewardTxnId,
            updated_at: now,
          })
          .eq('id', submissionId);

        if (updateErr) {
          if (updateErr.code === '23505') {
            const err = new Error('First-event reward invariant violation: Owner has already received a lifetime showcase reward credit.');
            (err as any).code = 'LIFETIME_REWARD_EXHAUSTED';
            (err as any).status = 422;
            throw err;
          }
          if (!isLocalFallbackAllowed(env)) throw updateErr;
        }
      } catch (e: any) {
        if (e?.code === 'LIFETIME_REWARD_EXHAUSTED') throw e;
        if (!isLocalFallbackAllowed(env)) throw e;
      }
    }

    localRewardSubmissionsCache.set(submissionId, updatedSubmission);

    return {
      submission: updatedSubmission,
      showcase: result.showcase,
      reward: result.reward,
      alreadyRewarded: result.alreadyRewarded,
    };
  });
}

/**
 * Reject a showcase reward submission:
 * 1. Checks that submission is in PENDING state.
 * 2. Requires non-empty rejectionReason.
 * 3. Updates submission status to REJECTED and records reason.
 * 4. Updates showcase reward status to REJECTED.
 * 5. Does NOT grant wallet credits.
 */
export async function rejectShowcaseRewardSubmission(params: {
  submissionId: string;
  reviewerId: string;
  rejectionReason: string;
  env?: Record<string, any>;
}): Promise<{
  submission: ShowcaseRewardSubmissionRecord;
  showcase: any;
}> {
  const { submissionId, reviewerId, rejectionReason, env } = params;

  if (!rejectionReason || !rejectionReason.trim()) {
    const err = new Error('Rejection reason is required.');
    (err as any).code = 'REJECTION_REASON_REQUIRED';
    (err as any).status = 422;
    throw err;
  }

  const submission = await getShowcaseRewardSubmissionById(submissionId, env);
  if (!submission) {
    const err = new Error('Reward submission not found.');
    (err as any).code = 'SUBMISSION_NOT_FOUND';
    (err as any).status = 404;
    throw err;
  }

  if (submission.status === 'APPROVED') {
    const err = new Error('Cannot reject a reward submission that has already been approved.');
    (err as any).code = 'SUBMISSION_ALREADY_APPROVED';
    (err as any).status = 422;
    throw err;
  }

  if (submission.status === 'REJECTED') {
    const showcase = await getShowcaseById(submission.showcase_id, env);
    return {
      submission,
      showcase,
    };
  }

  // Reject the showcase reward
  const updatedShowcase = await rejectShowcaseReward(
    submission.showcase_id,
    reviewerId,
    rejectionReason.trim(),
    env
  );

  const now = new Date().toISOString();
  const updatedSubmission: ShowcaseRewardSubmissionRecord = {
    ...submission,
    status: 'REJECTED',
    reviewed_at: now,
    reviewed_by: reviewerId,
    rejection_reason: rejectionReason.trim(),
    updated_at: now,
  };

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    try {
      await supabase
        .from('showcase_reward_submissions')
        .update({
          status: 'REJECTED',
          reviewed_at: now,
          reviewed_by: reviewerId,
          rejection_reason: rejectionReason.trim(),
          updated_at: now,
        })
        .eq('id', submissionId);
    } catch (e) {
      if (!isLocalFallbackAllowed(env)) throw e;
    }
  }

  localRewardSubmissionsCache.set(submissionId, updatedSubmission);

  return {
    submission: updatedSubmission,
    showcase: updatedShowcase,
  };
}
