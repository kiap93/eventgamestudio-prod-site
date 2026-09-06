import { getSupabaseServerClient, isLocalFallbackAllowed } from '../supabase.js';
import { EventShowcaseRecord, ShowcaseStatus, ReviewStatus, PublicationStatus, RewardStatus } from './types.js';
import { grantShowcaseCredit } from './wallet.js';
import { getShowcaseMedia } from './showcaseMedia.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Local storage fallback path for environments where Supabase migration is not yet run
const LOCAL_SHOWCASES_FILE = path.join(process.cwd(), 'uploads', 'showcases.json');

// In-memory cache for fast reads and reliable fallback
const localShowcasesCache = new Map<string, EventShowcaseRecord>();

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

// Initial load
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
  const status: ShowcaseStatus = params.status || 'DRAFT';
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
    submitted_at?: string | null;
    reviewed_at?: string | null;
    reviewed_by?: string | null;
    rejection_reason?: string | null;
    reward_transaction_id?: string | null;
    reward_granted_at?: string | null;
    reward_status?: RewardStatus | null;
  },
  env?: Record<string, any>
): Promise<EventShowcaseRecord> {
  const existing = await getShowcaseByEventId(eventId, env);
  if (!existing) {
    const err = new Error('Event Showcase not found');
    (err as any).code = 'SHOWCASE_NOT_FOUND';
    throw err;
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
 * Submit Showcase for Developer Review
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

  // Validate editing rules
  if (showcase.review_status === 'SUBMITTED') {
    return showcase; // Already submitted
  }
  if (showcase.review_status === 'APPROVED') {
    const err = new Error('Showcase is already APPROVED and cannot be resubmitted.');
    (err as any).code = 'SHOWCASE_ALREADY_APPROVED';
    throw err;
  }

  // Validate required Showcase content
  if (!showcase.title || !showcase.title.trim()) {
    const err = new Error('Showcase title is required for submission.');
    (err as any).code = 'VALIDATION_ERROR';
    throw err;
  }

  // Validate required media: at least 1 showcase media asset is required
  const mediaList = await getShowcaseMedia(showcase.id, showcase.organization_id, env);
  if (!mediaList || mediaList.length === 0) {
    const err = new Error('Please upload at least 1 photo or video to your Showcase gallery before submitting for review.');
    (err as any).code = 'MEDIA_REQUIREMENT_NOT_MET';
    throw err;
  }

  const now = new Date().toISOString();
  return await updateShowcase(
    eventId,
    {
      review_status: 'SUBMITTED',
      submitted_at: now,
      rejection_reason: null, // Clear previous rejection reason
    },
    env
  );
}

/**
 * Approve Showcase and trigger RM300 reward grant
 */
export async function approveShowcaseReview(
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

  // Verify review status
  if (showcase.review_status === 'APPROVED' && showcase.reward_status === 'REWARDED') {
    return {
      showcase,
      reward: null,
      alreadyRewarded: true,
    };
  }

  if (showcase.review_status !== 'SUBMITTED' && showcase.review_status !== 'APPROVED') {
    const err = new Error(`Cannot approve showcase with status "${showcase.review_status}". It must be SUBMITTED first.`);
    (err as any).code = 'INVALID_STATUS_TRANSITION';
    throw err;
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
      review_status: 'APPROVED',
      reviewed_at: now,
      reviewed_by: reviewerId,
      rejection_reason: null,
      reward_transaction_id: rewardResult.transaction?.id || null,
      reward_granted_at: showcase.reward_granted_at || now,
      reward_status: 'REWARDED',
      publication_status: 'PUBLISHED',
      status: 'PUBLISHED',
    },
    env
  );

  return {
    showcase: updatedShowcase,
    reward: rewardResult,
    alreadyRewarded: rewardResult.alreadyGranted,
  };
}

/**
 * Reject Showcase with mandatory reason
 */
export async function rejectShowcaseReview(
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
      review_status: 'REJECTED',
      rejection_reason: rejectionReason.trim(),
      reviewed_at: now,
      reviewed_by: reviewerId,
    },
    env
  );
}

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


