import { getSupabaseServerClient, isLocalFallbackAllowed } from '../supabase.js';
import {
  EventShowcaseRecord,
  ShowcaseStatus,
  ReviewStatus,
  PublicationStatus,
  RewardStatus,
  RewardReviewStatus,
  ShowcaseModerationLog,
} from './types.js';
import { grantShowcaseCredit } from './wallet.js';
import { getShowcaseMedia } from './showcaseMedia.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Local storage fallback paths for environments where Supabase migration is not yet run
const LOCAL_SHOWCASES_FILE = path.join(process.cwd(), 'uploads', 'showcases.json');
const LOCAL_MODERATION_LOGS_FILE = path.join(process.cwd(), 'uploads', 'showcase_moderation_logs.json');

// In-memory cache for fast reads and reliable fallback
const localShowcasesCache = new Map<string, EventShowcaseRecord>();
const localModerationLogsCache: ShowcaseModerationLog[] = [];

function loadLocalShowcases(): void {
  try {
    if (!isLocalFallbackAllowed()) return;
    if (fs.existsSync(LOCAL_SHOWCASES_FILE)) {
      const raw = fs.readFileSync(LOCAL_SHOWCASES_FILE, 'utf-8');
      const list = JSON.parse(raw) as EventShowcaseRecord[];
      localShowcasesCache.clear();
      for (const item of list) {
        localShowcasesCache.set(item.event_id, item);
      }
    }
  } catch (err) {
    console.warn('Warning: Could not read local showcases file:', err);
  }
}

function saveLocalShowcases(env?: Record<string, any>): void {
  try {
    if (!isLocalFallbackAllowed(env)) return;
    const list = Array.from(localShowcasesCache.values());
    const dir = path.dirname(LOCAL_SHOWCASES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_SHOWCASES_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Warning: Could not save local showcases file:', err);
  }
}

function loadLocalModerationLogs(): void {
  try {
    if (!isLocalFallbackAllowed()) return;
    if (fs.existsSync(LOCAL_MODERATION_LOGS_FILE)) {
      const raw = fs.readFileSync(LOCAL_MODERATION_LOGS_FILE, 'utf-8');
      const list = JSON.parse(raw) as ShowcaseModerationLog[];
      localModerationLogsCache.length = 0;
      localModerationLogsCache.push(...list);
    }
  } catch (err) {
    console.warn('Warning: Could not read local moderation logs file:', err);
  }
}

function saveLocalModerationLog(log: ShowcaseModerationLog, env?: Record<string, any>): void {
  try {
    if (!isLocalFallbackAllowed(env)) return;
    localModerationLogsCache.push(log);
    const dir = path.dirname(LOCAL_MODERATION_LOGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_MODERATION_LOGS_FILE, JSON.stringify(localModerationLogsCache, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Warning: Could not save local moderation logs file:', err);
  }
}

// Initial load
loadLocalShowcases();
loadLocalModerationLogs();
loadLocalShowcases();

/**
 * Get showcase for a specific event
 */
export async function getShowcaseByEventId(
  eventId: string,
  env?: Record<string, any>
): Promise<EventShowcaseRecord | null> {
  if (!eventId) return null;

  try {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('event_showcases')
      .select('*')
      .eq('event_id', eventId)
      .maybeSingle();

    if (error) {
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Database error fetching showcase for event ${eventId}: ${error.message}`);
      }
      // If table does not exist or network issue in development, fallback to local cache
      console.warn(`Notice from Supabase query for event_showcases (${error.message}). Checking local fallback store.`);
      return localShowcasesCache.get(eventId) || null;
    }

    if (data) {
      const record = data as EventShowcaseRecord;
      if (isLocalFallbackAllowed(env)) {
        localShowcasesCache.set(eventId, record);
      }
      return record;
    }

    if (isLocalFallbackAllowed(env)) {
      return localShowcasesCache.get(eventId) || null;
    }

    return null;
  } catch (err: any) {
    if (!isLocalFallbackAllowed(env)) {
      throw err;
    }
    console.warn('Error in getShowcaseByEventId, checking fallback:', err);
    return localShowcasesCache.get(eventId) || null;
  }
}

/**
 * Get showcase by its ID
 */
export async function getShowcaseById(
  showcaseId: string,
  env?: Record<string, any>
): Promise<EventShowcaseRecord | null> {
  if (!showcaseId) return null;

  try {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('event_showcases')
      .select('*')
      .eq('id', showcaseId)
      .maybeSingle();

    if (error) {
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Database error fetching showcase ${showcaseId}: ${error.message}`);
      }
      console.warn(`Notice from Supabase query for event_showcase id (${error.message}). Checking local fallback store.`);
      for (const item of localShowcasesCache.values()) {
        if (item.id === showcaseId) return item;
      }
      return null;
    }

    if (data) {
      const record = data as EventShowcaseRecord;
      if (isLocalFallbackAllowed(env)) {
        localShowcasesCache.set(record.event_id, record);
      }
      return record;
    }

    if (isLocalFallbackAllowed(env)) {
      for (const item of localShowcasesCache.values()) {
        if (item.id === showcaseId) return item;
      }
    }

    return null;
  } catch (err: any) {
    if (!isLocalFallbackAllowed(env)) {
      throw err;
    }
    console.warn('Error in getShowcaseById, checking fallback:', err);
    for (const item of localShowcasesCache.values()) {
      if (item.id === showcaseId) return item;
    }
    return null;
  }
}

/**
 * List all showcases for an organization
 */
export async function getShowcasesByOrgId(
  organizationId: string,
  env?: Record<string, any>
): Promise<EventShowcaseRecord[]> {
  if (!organizationId) return [];

  try {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('event_showcases')
      .select('*')
      .eq('organization_id', organizationId);

    if (error) {
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Database error fetching showcases for organization ${organizationId}: ${error.message}`);
      }
      console.warn(`Notice from Supabase query for event_showcases by org (${error.message}). Checking local fallback store.`);
      return Array.from(localShowcasesCache.values()).filter(
        (sc) => sc.organization_id === organizationId
      );
    }

    const list = (data || []) as EventShowcaseRecord[];
    if (isLocalFallbackAllowed(env)) {
      for (const item of list) {
        localShowcasesCache.set(item.event_id, item);
      }
    }
    return list;
  } catch (err: any) {
    if (!isLocalFallbackAllowed(env)) {
      throw err;
    }
    console.warn('Error in getShowcasesByOrgId, checking fallback:', err);
    return Array.from(localShowcasesCache.values()).filter(
      (sc) => sc.organization_id === organizationId
    );
  }
}

/**
 * Create an Event Showcase.
 * Enforces the unique constraint: each event can only have one showcase.
 */
export async function createShowcase(
  params: {
    event_id: string;
    organization_id: string;
    title: string;
    description?: string | null;
    client_name?: string | null;
    client_logo_url?: string | null;
    cover_image_url?: string | null;
    status?: ShowcaseStatus;
  },
  env?: Record<string, any>
): Promise<EventShowcaseRecord> {
  const existing = await getShowcaseByEventId(params.event_id, env);
  if (existing) {
    const err = new Error('An Event Showcase already exists for this event');
    (err as any).code = 'SHOWCASE_ALREADY_EXISTS';
    throw err;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  // In the "Publish First, Moderate Later" model, default to PUBLISHED unless explicitly DRAFT/UNPUBLISHED
  const status: ShowcaseStatus = params.status || 'PUBLISHED';
  const publication_status: PublicationStatus = status === 'PUBLISHED' ? 'PUBLISHED' : 'UNPUBLISHED';
  const published_at = status === 'PUBLISHED' ? now : null;

  const record: EventShowcaseRecord = {
    id,
    event_id: params.event_id,
    organization_id: params.organization_id,
    title: params.title.trim(),
    description: params.description?.trim() || null,
    client_name: params.client_name?.trim() || null,
    client_logo_url: params.client_logo_url?.trim() || null,
    cover_image_url: params.cover_image_url?.trim() || null,
    status,
    review_status: 'DRAFT',
    publication_status,
    reward_review_status: 'NOT_ELIGIBLE',
    reward_reviewed_by: null,
    reward_reviewed_at: null,
    reward_rejection_reason: null,
    moderated_by: null,
    moderated_at: null,
    moderation_reason: null,
    deleted_at: null,
    submitted_at: null,
    reviewed_at: null,
    reviewed_by: null,
    rejection_reason: null,
    reward_transaction_id: null,
    reward_granted_at: null,
    reward_status: 'PENDING',
    published_at,
    created_at: now,
    updated_at: now,
  };

  try {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('event_showcases')
      .insert(record)
      .select()
      .single();

    if (error) {
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Database error creating showcase: ${error.message}`);
      }
      console.warn('Notice inserting into Supabase event_showcases:', error.message);
      // Save to local cache & file in development
      localShowcasesCache.set(params.event_id, record);
      saveLocalShowcases(env);
      return record;
    }

    const saved = data as EventShowcaseRecord;
    if (isLocalFallbackAllowed(env)) {
      localShowcasesCache.set(params.event_id, saved);
      saveLocalShowcases(env);
    }
    return saved;
  } catch (err: any) {
    if (!isLocalFallbackAllowed(env)) {
      throw err;
    }
    console.warn('Error saving showcase to Supabase, falling back to local file store:', err);
    localShowcasesCache.set(params.event_id, record);
    saveLocalShowcases(env);
    return record;
  }
}

/**
 * Record a moderation action in the audit log
 */
export async function recordShowcaseModerationLog(
  params: {
    showcase_id: string;
    moderator_id: string;
    action: 'BLOCK' | 'UNBLOCK' | 'DELETE' | 'RESTORE';
    reason: string;
    metadata?: Record<string, any>;
  },
  env?: Record<string, any>
): Promise<ShowcaseModerationLog> {
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  const log: ShowcaseModerationLog = {
    id,
    showcase_id: params.showcase_id,
    moderator_id: params.moderator_id,
    action: params.action,
    reason: params.reason,
    metadata: params.metadata || {},
    created_at,
  };

  try {
    const supabase = getSupabaseServerClient(env);
    const { error } = await supabase.from('showcase_moderation_logs').insert(log);
    if (error) {
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Failed to record moderation log: ${error.message}`);
      }
      saveLocalModerationLog(log, env);
      return log;
    }
    if (isLocalFallbackAllowed(env)) {
      saveLocalModerationLog(log, env);
    }
    return log;
  } catch (err: any) {
    if (!isLocalFallbackAllowed(env)) {
      throw err;
    }
    saveLocalModerationLog(log, env);
    return log;
  }
}

/**
 * Update an existing Event Showcase
 */
export async function updateShowcase(
  eventId: string,
  updates: {
    title?: string;
    description?: string | null;
    client_name?: string | null;
    client_logo_url?: string | null;
    cover_image_url?: string | null;
    status?: ShowcaseStatus;
    review_status?: ReviewStatus;
    publication_status?: PublicationStatus;
    reward_review_status?: RewardReviewStatus;
    reward_reviewed_by?: string | null;
    reward_reviewed_at?: string | null;
    reward_rejection_reason?: string | null;
    moderated_by?: string | null;
    moderated_at?: string | null;
    moderation_reason?: string | null;
    deleted_at?: string | null;
    submitted_at?: string | null;
    reviewed_at?: string | null;
    reviewed_by?: string | null;
    rejection_reason?: string | null;
    reward_transaction_id?: string | null;
    reward_granted_at?: string | null;
    reward_status?: RewardStatus | null;
  },
  env?: Record<string, any>,
  bypassBlockedCheck: boolean = false
): Promise<EventShowcaseRecord> {
  const existing = await getShowcaseByEventId(eventId, env);
  if (!existing) {
    const err = new Error('Event Showcase not found');
    (err as any).code = 'SHOWCASE_NOT_FOUND';
    throw err;
  }

  // Security check: BLOCKED showcases cannot be updated by normal users
  if (!bypassBlockedCheck) {
    if (existing.status === 'BLOCKED') {
      const err = new Error('Showcase has been blocked by administrators and cannot be modified.');
      (err as any).code = 'SHOWCASE_BLOCKED';
      throw err;
    }
    if (existing.status === 'DELETED' || existing.deleted_at) {
      const err = new Error('Showcase has been deleted and cannot be modified.');
      (err as any).code = 'SHOWCASE_DELETED';
      throw err;
    }
  }

  const now = new Date().toISOString();
  let nextPublishedAt = existing.published_at;

  const newPublicationStatus = updates.publication_status !== undefined
    ? updates.publication_status
    : updates.status === 'PUBLISHED'
      ? 'PUBLISHED'
      : updates.status === 'UNPUBLISHED'
        ? 'UNPUBLISHED'
        : existing.publication_status || (existing.status === 'PUBLISHED' ? 'PUBLISHED' : 'UNPUBLISHED');

  const newStatus: ShowcaseStatus = updates.status !== undefined
    ? updates.status
    : newPublicationStatus === 'PUBLISHED'
      ? 'PUBLISHED'
      : (existing.status || 'DRAFT');

  if (newPublicationStatus === 'PUBLISHED' && (!existing.published_at || existing.status !== 'PUBLISHED')) {
    nextPublishedAt = now;
  }

  const updatedRecord: EventShowcaseRecord = {
    ...existing,
    title: updates.title !== undefined ? updates.title.trim() : existing.title,
    description: updates.description !== undefined ? (updates.description ? updates.description.trim() : null) : existing.description,
    client_name: updates.client_name !== undefined ? (updates.client_name ? updates.client_name.trim() : null) : existing.client_name,
    client_logo_url: updates.client_logo_url !== undefined ? (updates.client_logo_url ? updates.client_logo_url.trim() : null) : existing.client_logo_url,
    cover_image_url: updates.cover_image_url !== undefined ? (updates.cover_image_url ? updates.cover_image_url.trim() : null) : existing.cover_image_url,
    status: newStatus,
    review_status: updates.review_status !== undefined ? updates.review_status : (existing.review_status || 'DRAFT'),
    publication_status: newPublicationStatus,
    reward_review_status: updates.reward_review_status !== undefined ? updates.reward_review_status : (existing.reward_review_status || 'NOT_ELIGIBLE'),
    reward_reviewed_by: updates.reward_reviewed_by !== undefined ? updates.reward_reviewed_by : (existing.reward_reviewed_by || null),
    reward_reviewed_at: updates.reward_reviewed_at !== undefined ? updates.reward_reviewed_at : (existing.reward_reviewed_at || null),
    reward_rejection_reason: updates.reward_rejection_reason !== undefined ? updates.reward_rejection_reason : (existing.reward_rejection_reason || null),
    moderated_by: updates.moderated_by !== undefined ? updates.moderated_by : (existing.moderated_by || null),
    moderated_at: updates.moderated_at !== undefined ? updates.moderated_at : (existing.moderated_at || null),
    moderation_reason: updates.moderation_reason !== undefined ? updates.moderation_reason : (existing.moderation_reason || null),
    deleted_at: updates.deleted_at !== undefined ? updates.deleted_at : (existing.deleted_at || null),
    submitted_at: updates.submitted_at !== undefined ? updates.submitted_at : (existing.submitted_at || null),
    reviewed_at: updates.reviewed_at !== undefined ? updates.reviewed_at : (existing.reviewed_at || null),
    reviewed_by: updates.reviewed_by !== undefined ? updates.reviewed_by : (existing.reviewed_by || null),
    rejection_reason: updates.rejection_reason !== undefined ? updates.rejection_reason : (existing.rejection_reason || null),
    reward_transaction_id: updates.reward_transaction_id !== undefined ? updates.reward_transaction_id : (existing.reward_transaction_id || null),
    reward_granted_at: updates.reward_granted_at !== undefined ? updates.reward_granted_at : (existing.reward_granted_at || null),
    reward_status: updates.reward_status !== undefined ? updates.reward_status : (existing.reward_status || 'PENDING'),
    published_at: nextPublishedAt,
    updated_at: now,
  };

  try {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('event_showcases')
      .update({
        title: updatedRecord.title,
        description: updatedRecord.description,
        client_name: updatedRecord.client_name,
        client_logo_url: updatedRecord.client_logo_url,
        cover_image_url: updatedRecord.cover_image_url,
        status: updatedRecord.status,
        review_status: updatedRecord.review_status,
        publication_status: updatedRecord.publication_status,
        reward_review_status: updatedRecord.reward_review_status,
        reward_reviewed_by: updatedRecord.reward_reviewed_by,
        reward_reviewed_at: updatedRecord.reward_reviewed_at,
        reward_rejection_reason: updatedRecord.reward_rejection_reason,
        moderated_by: updatedRecord.moderated_by,
        moderated_at: updatedRecord.moderated_at,
        moderation_reason: updatedRecord.moderation_reason,
        deleted_at: updatedRecord.deleted_at,
        submitted_at: updatedRecord.submitted_at,
        reviewed_at: updatedRecord.reviewed_at,
        reviewed_by: updatedRecord.reviewed_by,
        rejection_reason: updatedRecord.rejection_reason,
        reward_transaction_id: updatedRecord.reward_transaction_id,
        reward_granted_at: updatedRecord.reward_granted_at,
        reward_status: updatedRecord.reward_status,
        published_at: updatedRecord.published_at,
        updated_at: now,
      })
      .eq('event_id', eventId)
      .select()
      .single();

    if (error) {
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Database error updating showcase: ${error.message}`);
      }
      console.warn('Notice updating Supabase event_showcases:', error.message);
      localShowcasesCache.set(eventId, updatedRecord);
      saveLocalShowcases(env);
      return updatedRecord;
    }

    const saved = data as EventShowcaseRecord;
    if (isLocalFallbackAllowed(env)) {
      localShowcasesCache.set(eventId, saved);
      saveLocalShowcases(env);
    }
    return saved;
  } catch (err: any) {
    if (!isLocalFallbackAllowed(env)) {
      throw err;
    }
    console.warn('Error updating showcase in Supabase, using local fallback:', err);
    localShowcasesCache.set(eventId, updatedRecord);
    saveLocalShowcases(env);
    return updatedRecord;
  }
}

/**
 * Block a showcase by moderator (removes from public access immediately)
 */
export async function blockShowcase(
  showcaseId: string,
  moderatorId: string,
  reason: string,
  env?: Record<string, any>
): Promise<EventShowcaseRecord> {
  if (!reason || !reason.trim()) {
    const err = new Error('Moderation reason is required when blocking a showcase.');
    (err as any).code = 'MODERATION_REASON_REQUIRED';
    throw err;
  }

  const showcase = await getShowcaseById(showcaseId, env);
  if (!showcase) {
    const err = new Error('Showcase not found');
    (err as any).code = 'SHOWCASE_NOT_FOUND';
    throw err;
  }

  const now = new Date().toISOString();
  const updated = await updateShowcase(
    showcase.event_id,
    {
      status: 'BLOCKED',
      publication_status: 'UNPUBLISHED',
      moderated_by: moderatorId,
      moderated_at: now,
      moderation_reason: reason.trim(),
    },
    env,
    true // bypassBlockedCheck
  );

  await recordShowcaseModerationLog(
    {
      showcase_id: showcase.id,
      moderator_id: moderatorId,
      action: 'BLOCK',
      reason: reason.trim(),
    },
    env
  );

  return updated;
}

/**
 * Unblock a blocked showcase
 */
export async function unblockShowcase(
  showcaseId: string,
  moderatorId: string,
  reason?: string,
  env?: Record<string, any>
): Promise<EventShowcaseRecord> {
  const showcase = await getShowcaseById(showcaseId, env);
  if (!showcase) {
    const err = new Error('Showcase not found');
    (err as any).code = 'SHOWCASE_NOT_FOUND';
    throw err;
  }

  const updated = await updateShowcase(
    showcase.event_id,
    {
      status: 'PUBLISHED',
      publication_status: 'PUBLISHED',
      moderated_by: null,
      moderated_at: null,
      moderation_reason: null,
    },
    env,
    true // bypassBlockedCheck
  );

  await recordShowcaseModerationLog(
    {
      showcase_id: showcase.id,
      moderator_id: moderatorId,
      action: 'UNBLOCK',
      reason: reason ? reason.trim() : 'Unblocked by administrator',
    },
    env
  );

  return updated;
}

/**
 * Soft delete showcase by admin with moderation audit log
 */
export async function adminDeleteShowcase(
  showcaseId: string,
  moderatorId: string,
  reason: string,
  env?: Record<string, any>
): Promise<EventShowcaseRecord> {
  if (!reason || !reason.trim()) {
    const err = new Error('Deletion reason is required for administrative showcase deletion.');
    (err as any).code = 'MODERATION_REASON_REQUIRED';
    throw err;
  }

  const showcase = await getShowcaseById(showcaseId, env);
  if (!showcase) {
    const err = new Error('Showcase not found');
    (err as any).code = 'SHOWCASE_NOT_FOUND';
    throw err;
  }

  const now = new Date().toISOString();
  const updated = await updateShowcase(
    showcase.event_id,
    {
      status: 'DELETED',
      publication_status: 'UNPUBLISHED',
      deleted_at: now,
      moderated_by: moderatorId,
      moderated_at: now,
      moderation_reason: reason.trim(),
    },
    env,
    true
  );

  await recordShowcaseModerationLog(
    {
      showcase_id: showcase.id,
      moderator_id: moderatorId,
      action: 'DELETE',
      reason: reason.trim(),
    },
    env
  );

  return updated;
}

/**
 * Evaluate showcase eligibility for the one-time RM300 first-event showcase reward.
 * Separate from showcase visibility!
 */
export async function evaluateShowcaseRewardEligibility(
  eventId: string,
  env?: Record<string, any>
): Promise<EventShowcaseRecord> {
  const showcase = await getShowcaseByEventId(eventId, env);
  if (!showcase) {
    const err = new Error('Showcase not found');
    (err as any).code = 'SHOWCASE_NOT_FOUND';
    throw err;
  }

  // If already rewarded, no change needed
  if (showcase.reward_review_status === 'REWARDED' || showcase.reward_status === 'REWARDED') {
    return showcase;
  }

  const supabase = getSupabaseServerClient(env);

  // Check if organization already received showcase credit
  const { data: orgWallet } = await supabase
    .from('organization_wallets')
    .select('showcase_credit_granted, showcase_credit')
    .eq('organization_id', showcase.organization_id)
    .maybeSingle();

  if (orgWallet?.showcase_credit_granted || (orgWallet?.showcase_credit && orgWallet.showcase_credit > 0)) {
    return await updateShowcase(
      eventId,
      {
        reward_review_status: 'NOT_ELIGIBLE',
        reward_status: 'NOT_ELIGIBLE',
      },
      env,
      true
    );
  }

  // Check event payment status
  const { data: eventData } = await supabase
    .from('events')
    .select('payment_status, status')
    .eq('id', eventId)
    .maybeSingle();

  const isPaid = eventData?.payment_status === 'PAID';
  const mediaList = await getShowcaseMedia(showcase.id, showcase.organization_id, env);
  const mediaCount = mediaList ? mediaList.length : 0;
  const hasTitle = !!showcase.title && showcase.title.trim().length > 0;
  const hasDesc = !!showcase.description && showcase.description.trim().length > 0;
  const isEligible = isPaid && mediaCount >= 3 && hasTitle && hasDesc && showcase.status === 'PUBLISHED';

  if (isEligible) {
    return await updateShowcase(
      eventId,
      {
        reward_review_status: 'AWAITING_APPROVAL',
        reward_status: 'PENDING',
        review_status: 'SUBMITTED', // For backward compatibility with legacy views
      },
      env,
      true
    );
  }

  return showcase;
}

/**
 * Submit Showcase for First-Event Reward Review
 * Ensures showcase is PUBLISHED and queues for first-event reward evaluation.
 * Does NOT lock editing or gate visibility!
 */
export async function submitShowcaseForReview(
  eventId: string,
  env?: Record<string, any>
): Promise<EventShowcaseRecord> {
  const showcase = await getShowcaseByEventId(eventId, env);
  if (!showcase) {
    const err = new Error('Showcase not found. Please create the showcase first.');
    (err as any).code = 'SHOWCASE_NOT_FOUND';
    throw err;
  }

  if (showcase.status === 'BLOCKED') {
    const err = new Error('Showcase has been blocked by administrators and cannot be submitted.');
    (err as any).code = 'SHOWCASE_BLOCKED';
    throw err;
  }

  // Validate required Showcase content
  if (!showcase.title || !showcase.title.trim()) {
    const err = new Error('Showcase title is required.');
    (err as any).code = 'VALIDATION_ERROR';
    throw err;
  }

  const now = new Date().toISOString();
  return await updateShowcase(
    eventId,
    {
      status: 'PUBLISHED',
      publication_status: 'PUBLISHED',
      review_status: 'SUBMITTED',
      reward_review_status: 'AWAITING_APPROVAL',
      reward_status: 'PENDING',
      submitted_at: now,
      rejection_reason: null,
      reward_rejection_reason: null,
    },
    env,
    true
  );
}

/**
 * Approve Showcase First-Event Reward and grant RM300 credit
 */
export async function approveShowcaseReward(
  showcaseId: string,
  reviewerId: string,
  env?: Record<string, any>
): Promise<{
  showcase: EventShowcaseRecord;
  reward: any;
  alreadyRewarded: boolean;
}> {
  const showcase = await getShowcaseById(showcaseId, env);
  if (!showcase) {
    const err = new Error('Showcase not found');
    (err as any).code = 'SHOWCASE_NOT_FOUND';
    throw err;
  }

  // If already rewarded, idempotent return
  if (showcase.reward_review_status === 'REWARDED' && showcase.reward_status === 'REWARDED') {
    return {
      showcase,
      reward: null,
      alreadyRewarded: true,
    };
  }

  const now = new Date().toISOString();

  // Trigger the idempotent RM300 showcase reward function
  const rewardResult = await grantShowcaseCredit(
    {
      organizationId: showcase.organization_id,
      eventId: showcase.event_id,
      createdBy: reviewerId,
      referenceId: `showcase_${showcase.id}`,
      metadata: {
        showcase_id: showcase.id,
        event_id: showcase.event_id,
        reviewed_by: reviewerId,
        approved_at: now,
      },
    },
    env
  );

  const updatedShowcase = await updateShowcase(
    showcase.event_id,
    {
      reward_review_status: 'REWARDED',
      reward_reviewed_by: reviewerId,
      reward_reviewed_at: now,
      reward_rejection_reason: null,
      reward_transaction_id: rewardResult.transaction?.id || null,
      reward_granted_at: showcase.reward_granted_at || now,
      reward_status: 'REWARDED',
      review_status: 'APPROVED',
      reviewed_at: now,
      reviewed_by: reviewerId,
      rejection_reason: null,
      publication_status: 'PUBLISHED',
      status: showcase.status === 'BLOCKED' ? 'BLOCKED' : 'PUBLISHED',
    },
    env,
    true
  );

  return {
    showcase: updatedShowcase,
    reward: rewardResult,
    alreadyRewarded: rewardResult.alreadyGranted,
  };
}

// Alias for backward compatibility
export const approveShowcaseReview = approveShowcaseReward;

/**
 * Reject Showcase First-Event Reward with mandatory reason
 * (Showcase visibility remains live/published - only the financial reward is rejected)
 */
export async function rejectShowcaseReward(
  showcaseId: string,
  reviewerId: string,
  rejectionReason: string,
  env?: Record<string, any>
): Promise<EventShowcaseRecord> {
  if (!rejectionReason || !rejectionReason.trim()) {
    const err = new Error('Rejection reason is required.');
    (err as any).code = 'REJECTION_REASON_REQUIRED';
    throw err;
  }

  const showcase = await getShowcaseById(showcaseId, env);
  if (!showcase) {
    const err = new Error('Showcase not found');
    (err as any).code = 'SHOWCASE_NOT_FOUND';
    throw err;
  }

  const now = new Date().toISOString();
  return await updateShowcase(
    showcase.event_id,
    {
      reward_review_status: 'REJECTED',
      reward_rejection_reason: rejectionReason.trim(),
      reward_reviewed_by: reviewerId,
      reward_reviewed_at: now,
      reward_status: 'NOT_ELIGIBLE',
      review_status: 'REJECTED',
      rejection_reason: rejectionReason.trim(),
      reviewed_at: now,
      reviewed_by: reviewerId,
    },
    env,
    true
  );
}

// Alias for backward compatibility
export const rejectShowcaseReview = rejectShowcaseReward;

/**
 * List all showcases for developer admin review
 */
export async function getAllShowcasesForAdmin(
  env?: Record<string, any>
): Promise<any[]> {
  try {
    const supabase = getSupabaseServerClient(env);
    const { data: showcases, error } = await supabase
      .from('event_showcases')
      .select(`
        *,
        events:event_id (id, name, event_type, status, date),
        organizations:organization_id (id, name, slug)
      `)
      .order('created_at', { ascending: false });

    if (error || !showcases) {
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Database error loading showcases for admin: ${error?.message || 'No data'}`);
      }
      console.warn('Notice from Supabase query for admin event_showcases:', error?.message);
      // Fallback: build from local cache
      const list = Array.from(localShowcasesCache.values());
      return list.map((sc) => ({
        ...sc,
        event_name: 'Event #' + sc.event_id.slice(0, 8),
        organization_name: 'Organization #' + sc.organization_id.slice(0, 8),
      }));
    }

    // Attach media count
    const enrichedList = [];
    for (const sc of showcases) {
      const media = await getShowcaseMedia(sc.id, sc.organization_id, env);
      enrichedList.push({
        ...sc,
        event_name: (sc.events as any)?.name || 'Event #' + sc.event_id.slice(0, 8),
        organization_name: (sc.organizations as any)?.name || 'Organization #' + sc.organization_id.slice(0, 8),
        organization_slug: (sc.organizations as any)?.slug || '',
        media_count: media.length,
        image_count: media.filter((m) => m.media_type === 'IMAGE').length,
        video_count: media.filter((m) => m.media_type === 'VIDEO').length,
      });
    }

    return enrichedList;
  } catch (err: any) {
    if (!isLocalFallbackAllowed(env)) {
      throw err;
    }
    console.warn('Error in getAllShowcasesForAdmin, using fallback:', err);
    const list = Array.from(localShowcasesCache.values());
    return list.map((sc) => ({
      ...sc,
      event_name: 'Event #' + sc.event_id.slice(0, 8),
      organization_name: 'Organization #' + sc.organization_id.slice(0, 8),
      media_count: 0,
      image_count: 0,
      video_count: 0,
    }));
  }
}

/**
 * Publish an Event Showcase
 */
export async function publishShowcase(
  eventId: string,
  env?: Record<string, any>
): Promise<EventShowcaseRecord> {
  const existing = await getShowcaseByEventId(eventId, env);
  if (!existing) {
    const err = new Error('Event Showcase not found');
    (err as any).code = 'SHOWCASE_NOT_FOUND';
    throw err;
  }

  return await updateShowcase(
    eventId,
    {
      status: 'PUBLISHED',
      publication_status: 'PUBLISHED',
    },
    env
  );
}

/**
 * Unpublish an Event Showcase (does NOT delete the showcase)
 */
export async function unpublishShowcase(
  eventId: string,
  env?: Record<string, any>
): Promise<EventShowcaseRecord> {
  const existing = await getShowcaseByEventId(eventId, env);
  if (!existing) {
    const err = new Error('Event Showcase not found');
    (err as any).code = 'SHOWCASE_NOT_FOUND';
    throw err;
  }

  return await updateShowcase(
    eventId,
    {
      status: 'UNPUBLISHED',
      publication_status: 'UNPUBLISHED',
    },
    env
  );
}

/**
 * Delete an Event Showcase and its associated local cache
 */
export async function deleteShowcase(
  eventId: string,
  env?: Record<string, any>
): Promise<boolean> {
  const existing = await getShowcaseByEventId(eventId, env);
  if (!existing) return true;

  try {
    const supabase = getSupabaseServerClient(env);
    const { error } = await supabase.from('event_showcases').delete().eq('event_id', eventId);
    if (error) {
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Database error deleting showcase: ${error.message}`);
      }
      console.warn('Error deleting showcase from Supabase:', error.message);
    }
  } catch (err: any) {
    if (!isLocalFallbackAllowed(env)) {
      throw err;
    }
    console.warn('Error deleting showcase from Supabase:', err.message);
  }

  localShowcasesCache.delete(eventId);
  saveLocalShowcases(env);
  return true;
}


