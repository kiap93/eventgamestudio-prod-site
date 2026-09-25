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

export interface ComprehensiveShowcaseRewardEligibility {
  eligible: boolean;
  code: string;
  reason: string;
  userRewardStatus?: 'ELIGIBLE' | 'REWARDED' | 'NOT_ELIGIBLE';
  alreadyClaimed?: boolean;
  hasReceivedReward?: boolean;
  hasPendingSubmission?: boolean;
  pendingSubmissionId?: string | null;
  details?: {
    user_id?: string;
    event_id?: string;
    showcase_id?: string;
    is_owner?: boolean;
    event_paid?: boolean;
    event_started?: boolean;
    showcase_published?: boolean;
    description_length?: number;
    description_valid?: boolean;
    photo_count?: number;
    video_count?: number;
    media_valid?: boolean;
    user_lifetime_claimed?: boolean;
    has_pending_submission?: boolean;
    is_resubmission?: boolean;
  };
}

/**
 * Authoritative single entry-point for Showcase Reward Eligibility across the platform.
 *
 * Calls PostgreSQL RPC `public.check_showcase_reward_eligibility` when Supabase is configured.
 * In local fallback/test mode, executes the identical waterfall logic:
 *   owner eligibility
 *         ↓
 *   showcase eligibility
 *         ↓
 *   published
 *         ↓
 *   event started
 *         ↓
 *   content quality
 *         ↓
 *   media requirements
 *         ↓
 *   user lifetime eligibility (user_rewards, wallet_transactions, approved submissions)
 *         ↓
 *   pending submission
 */
export async function checkShowcaseRewardEligibility(
  params: {
    eventId?: string | null;
    userId: string;
    showcaseId?: string | null;
  },
  env?: Record<string, any>
): Promise<ComprehensiveShowcaseRewardEligibility> {
  const { eventId, userId, showcaseId } = params;

  if (!userId) {
    return {
      eligible: false,
      code: 'UNAUTHORIZED',
      reason: 'Authenticated user ID is required to verify reward eligibility.',
      userRewardStatus: 'NOT_ELIGIBLE',
      alreadyClaimed: false,
      hasReceivedReward: false,
      hasPendingSubmission: false,
    };
  }

  // 1. Authoritative check: When Supabase is configured, DATABASE RPC IS AUTHORITATIVE
  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase.rpc('check_showcase_reward_eligibility', {
        p_event_id: eventId || null,
        p_user_id: userId,
        p_showcase_id: showcaseId || null,
      });

      if (!error && data) {
        return data as ComprehensiveShowcaseRewardEligibility;
      }
      if (error && !isLocalFallbackAllowed(env)) {
        throw new Error(`Database error checking showcase reward eligibility: ${error.message}`);
      }
    } catch (err: any) {
      if (!isLocalFallbackAllowed(env)) {
        throw err;
      }
    }
  }

  // 2. Local Fallback / Test Environment Waterfall Logic
  // 2A. Check user exists
  const user = await getUserById(userId, env);
  if (!user && !isLocalFallbackAllowed(env)) {
    return {
      eligible: false,
      code: 'USER_NOT_FOUND',
      reason: 'User account could not be found.',
      userRewardStatus: 'NOT_ELIGIBLE',
      alreadyClaimed: false,
      hasReceivedReward: false,
      hasPendingSubmission: false,
    };
  }

  // 2B. User Lifetime Invariant Check (user_rewards, wallet_transactions, approved submissions)
  const alreadyClaimed =
    (await hasUserReceivedShowcaseCredit(userId, env)) ||
    (await hasUserClaimedReward(userId, 'SHOWCASE_REWARD', env)) ||
    (await hasUserClaimedReward(userId, 'SHOWCASE_CREDIT', env));

  if (alreadyClaimed) {
    return {
      eligible: false,
      code: 'LIFETIME_REWARD_EXHAUSTED',
      reason: 'RM300 Showcase Reward has already been claimed for this account.',
      userRewardStatus: 'REWARDED',
      alreadyClaimed: true,
      hasReceivedReward: true,
      hasPendingSubmission: false,
    };
  }

  // Check local reward submissions cache for APPROVED submissions
  for (const sub of localRewardSubmissionsCache.values()) {
    if (sub.user_id === userId && sub.status === 'APPROVED') {
      return {
        eligible: false,
        code: 'LIFETIME_REWARD_EXHAUSTED',
        reason: 'RM300 Showcase Reward has already been claimed for this account.',
        userRewardStatus: 'REWARDED',
        alreadyClaimed: true,
        hasReceivedReward: true,
        hasPendingSubmission: false,
      };
    }
  }

  // 2C. User Pending Submissions Check (Max 1 active claim across platform)
  for (const sub of localRewardSubmissionsCache.values()) {
    if (sub.user_id === userId && sub.status === 'PENDING') {
      if (eventId && sub.event_id === eventId) {
        return {
          eligible: false,
          code: 'SUBMISSION_PENDING',
          reason: 'Your RM300 reward submission is waiting for admin approval.',
          userRewardStatus: 'NOT_ELIGIBLE',
          alreadyClaimed: false,
          hasReceivedReward: false,
          hasPendingSubmission: true,
          pendingSubmissionId: sub.id,
        };
      }
      return {
        eligible: false,
        code: 'SUBMISSION_PENDING',
        reason: 'You already have an RM300 showcase reward submission pending review for your account. Only one active claim is allowed at a time.',
        userRewardStatus: 'NOT_ELIGIBLE',
        alreadyClaimed: false,
        hasReceivedReward: false,
        hasPendingSubmission: true,
        pendingSubmissionId: sub.id,
      };
    }
  }

  // If no eventId is provided, user passed user-level lifetime checks
  if (!eventId) {
    return {
      eligible: true,
      code: 'USER_ELIGIBLE',
      reason: 'User account is eligible to submit an event showcase for RM300 reward.',
      userRewardStatus: 'ELIGIBLE',
      alreadyClaimed: false,
      hasReceivedReward: false,
      hasPendingSubmission: false,
    };
  }

  // 2D. Event Existence & Organization Owner Check
  const event = await getEventById(eventId, env);
  if (!event) {
    return {
      eligible: false,
      code: 'EVENT_NOT_FOUND',
      reason: 'Event not found.',
      userRewardStatus: 'NOT_ELIGIBLE',
      alreadyClaimed: false,
      hasReceivedReward: false,
      hasPendingSubmission: false,
    };
  }

  const isOwner = await isUserOrganizationOwner(userId, event.organization_id, env);
  if (!isOwner) {
    return {
      eligible: false,
      code: 'OWNER_ONLY_REWARD',
      reason: 'Only organization owners are eligible to submit for the RM300 Showcase Reward. Organization members cannot receive promotional rewards.',
      userRewardStatus: 'NOT_ELIGIBLE',
      alreadyClaimed: false,
      hasReceivedReward: false,
      hasPendingSubmission: false,
    };
  }

  // 2E. Event Payment Status
  if (event.payment_status !== 'PAID') {
    return {
      eligible: false,
      code: 'EVENT_NOT_PAID',
      reason: 'Showcase reward requires a confirmed, paid event that is live or completed.',
      userRewardStatus: 'NOT_ELIGIBLE',
      alreadyClaimed: false,
      hasReceivedReward: false,
      hasPendingSubmission: false,
    };
  }

  // 2F. Event Timing / Started
  const eventTiming = isEventEligibleForShowcaseRewardSubmission(event);
  if (!eventTiming.eligible) {
    return {
      eligible: false,
      code: eventTiming.code || 'EVENT_NOT_STARTED',
      reason: eventTiming.reason || 'Showcase reward submission is available once the event starts.',
      userRewardStatus: 'NOT_ELIGIBLE',
      alreadyClaimed: false,
      hasReceivedReward: false,
      hasPendingSubmission: false,
    };
  }

  // 2G. Showcase Existence & Publication Status
  const showcase = showcaseId
    ? await getShowcaseById(showcaseId, env)
    : await getShowcaseByEventId(eventId, env);

  if (!showcase) {
    return {
      eligible: false,
      code: 'SHOWCASE_NOT_FOUND',
      reason: 'Save your showcase first before submitting for the RM300 reward.',
      userRewardStatus: 'NOT_ELIGIBLE',
      alreadyClaimed: false,
      hasReceivedReward: false,
      hasPendingSubmission: false,
    };
  }

  if (showcase.status === 'BLOCKED' || showcase.status === 'DELETED') {
    return {
      eligible: false,
      code: 'SHOWCASE_BLOCKED',
      reason: `Showcase is ${showcase.status.toLowerCase()} and cannot be submitted for rewards.`,
      userRewardStatus: 'NOT_ELIGIBLE',
      alreadyClaimed: false,
      hasReceivedReward: false,
      hasPendingSubmission: false,
    };
  }

  if (showcase.status !== 'PUBLISHED' && showcase.publication_status !== 'PUBLISHED') {
    return {
      eligible: false,
      code: 'SHOWCASE_NOT_PUBLISHED',
      reason: 'Showcase must be published before submitting for the RM300 reward.',
      userRewardStatus: 'NOT_ELIGIBLE',
      alreadyClaimed: false,
      hasReceivedReward: false,
      hasPendingSubmission: false,
    };
  }

  // 2H. Check Submission for this specific showcase
  let thisShowcaseSub: ShowcaseRewardSubmissionRecord | null = null;
  for (const sub of localRewardSubmissionsCache.values()) {
    if (sub.showcase_id === showcase.id || sub.event_id === eventId) {
      thisShowcaseSub = sub;
      break;
    }
  }

  if (thisShowcaseSub) {
    if (thisShowcaseSub.status === 'APPROVED') {
      return {
        eligible: false,
        code: 'LIFETIME_REWARD_EXHAUSTED',
        reason: 'RM300 Showcase Reward has already been claimed for this account.',
        userRewardStatus: 'REWARDED',
        alreadyClaimed: true,
        hasReceivedReward: true,
        hasPendingSubmission: false,
      };
    }
    if (thisShowcaseSub.status === 'PENDING') {
      return {
        eligible: false,
        code: 'SUBMISSION_PENDING',
        reason: 'Your RM300 reward submission is waiting for admin approval.',
        userRewardStatus: 'NOT_ELIGIBLE',
        alreadyClaimed: false,
        hasReceivedReward: false,
        hasPendingSubmission: true,
        pendingSubmissionId: thisShowcaseSub.id,
      };
    }
    // If REJECTED, proceed to check content quality and media so user can resubmit
  }

  // 2I. Content Quality
  if (!showcase.title || !showcase.title.trim()) {
    return {
      eligible: false,
      code: 'VALIDATION_ERROR',
      reason: 'Showcase title is required.',
      userRewardStatus: 'NOT_ELIGIBLE',
      alreadyClaimed: false,
      hasReceivedReward: false,
      hasPendingSubmission: false,
    };
  }

  const trimmedDesc = (showcase.description || '').trim();
  if (trimmedDesc.length < 50) {
    return {
      eligible: false,
      code: 'VALIDATION_ERROR',
      reason: 'Showcase description must be at least 50 characters to qualify for reward review.',
      userRewardStatus: 'NOT_ELIGIBLE',
      alreadyClaimed: false,
      hasReceivedReward: false,
      hasPendingSubmission: false,
      details: {
        description_length: trimmedDesc.length,
        description_valid: false,
      },
    };
  }

  // 2J. Media Requirements (>= 3 photos or >= 1 video)
  const mediaList = await getShowcaseMedia(showcase.id, showcase.organization_id, env);
  const photoCount = (mediaList || []).filter(
    (m) => m.media_type === 'IMAGE' || (!m.media_type && !m.mime_type?.startsWith('video/'))
  ).length;
  const videoCount = (mediaList || []).filter(
    (m) => m.media_type === 'VIDEO' || m.mime_type?.startsWith('video/')
  ).length;

  if (photoCount < 3 && videoCount < 1) {
    return {
      eligible: false,
      code: 'INSUFFICIENT_MEDIA',
      reason: `Showcase must have at least 3 photos or 1 video uploaded to qualify for reward review.`,
      userRewardStatus: 'NOT_ELIGIBLE',
      alreadyClaimed: false,
      hasReceivedReward: false,
      hasPendingSubmission: false,
      details: {
        photo_count: photoCount,
        video_count: videoCount,
        media_valid: false,
      },
    };
  }

  // All checks pass
  return {
    eligible: true,
    code: 'ELIGIBLE',
    reason: 'Eligible for RM300 Showcase Reward',
    userRewardStatus: 'ELIGIBLE',
    alreadyClaimed: false,
    hasReceivedReward: false,
    hasPendingSubmission: false,
    details: {
      user_id: userId,
      event_id: eventId,
      showcase_id: showcase.id,
      is_owner: true,
      event_paid: true,
      event_started: true,
      showcase_published: true,
      description_length: trimmedDesc.length,
      description_valid: true,
      photo_count: photoCount,
      video_count: videoCount,
      media_valid: true,
      user_lifetime_claimed: false,
      has_pending_submission: false,
      is_resubmission: (thisShowcaseSub?.status === 'REJECTED'),
    },
  };
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
    // 1. Authoritative Database-Level / Waterfall Eligibility Check
    const eligibility = await checkShowcaseRewardEligibility({ eventId, userId }, env);
    if (!eligibility.eligible) {
      const err = new Error(eligibility.reason || 'Showcase reward submission is not eligible.');
      (err as any).code = eligibility.code || 'SHOWCASE_NOT_ELIGIBLE';
      (err as any).status =
        eligibility.code === 'OWNER_ONLY_REWARD' ? 403 :
        eligibility.code === 'SUBMISSION_PENDING' ? 409 : 422;
      throw err;
    }

    // 2. If Supabase is configured, execute atomic RPC
    if (isSupabaseConfigured(env)) {
      const supabase = getSupabaseServerClient(env);
      try {
        const { data: rpcResult, error: rpcErr } = await supabase.rpc(
          'create_showcase_reward_submission_atomic',
          {
            p_event_id: eventId,
            p_user_id: userId,
          }
        );
        if (!rpcErr && rpcResult?.submission) {
          const subRecord = rpcResult.submission as ShowcaseRewardSubmissionRecord;
          localRewardSubmissionsCache.set(subRecord.id, subRecord);
          return subRecord;
        }
      } catch {
        // Fall back to table insert if RPC not available
      }
    }

    // 3. Resolve Event & Showcase
    const event = await getEventById(eventId, env);
    const showcase = await getShowcaseByEventId(eventId, env);
    if (!event || !showcase) {
      const err = new Error('Event or showcase not found.');
      (err as any).code = 'SHOWCASE_NOT_FOUND';
      (err as any).status = 404;
      throw err;
    }

    // 4. Create Submission Record
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
          throw new Error(`Failed to create reward submission: ${error.message}`);
        }
      } else if (data) {
        localRewardSubmissionsCache.set(data.id, data as ShowcaseRewardSubmissionRecord);
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
        return data as ShowcaseRewardSubmissionRecord;
      }
    }

    localRewardSubmissionsCache.set(submissionRecord.id, submissionRecord);
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
    // Re-check current submission state INSIDE lock for concurrency protection
    const latestSubmission = (await getShowcaseRewardSubmissionById(submissionId, env)) || submission;
    if (latestSubmission.status === 'APPROVED') {
      const showcase = await getShowcaseById(latestSubmission.showcase_id, env);
      return {
        submission: latestSubmission,
        showcase,
        reward: null,
        alreadyRewarded: true,
      };
    }

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
