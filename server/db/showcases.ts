import { getSupabaseServerClient, isLocalFallbackAllowed, isSupabaseConfigured } from '../supabase.js';
import {
  EventShowcaseRecord,
  ShowcaseStatus,
  ReviewStatus,
  PublicationStatus,
  RewardStatus,
  RewardReviewStatus,
  ShowcaseModerationLog,
} from './types.js';
import {
  grantShowcaseCredit,
  withOrganizationLock,
  withUserRewardLock,
  hasUserReceivedShowcaseCredit,
  localOwnerShowcaseRewardsCache,
} from './wallet.js';
import { isUserOrganizationOwner, hasUserClaimedReward, getShowcaseRewardEligibility } from './rewards.js';
import { getShowcaseMedia } from './showcaseMedia.js';
import { getNormalizedCurrentDate, getEventById, isEventEligibleForShowcase, isEventEligibleForShowcaseReward } from './events.js';
import { getThemeById } from './themes.js';
import { getOrganizationById } from './organizations.js';
import { dispatchNotificationEvent } from '../notifications/dispatcher.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function isUUID(val: string | null | undefined): boolean {
  if (!val || typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}

// Local storage fallback paths for environments where Supabase migration is not yet run
const LOCAL_SHOWCASES_FILE = path.join(process.cwd(), 'uploads', 'showcases.json');
const LOCAL_MODERATION_LOGS_FILE = path.join(process.cwd(), 'uploads', 'showcase_moderation_logs.json');

// In-memory cache for fast reads and reliable fallback
export const localShowcasesCache = new Map<string, EventShowcaseRecord>();
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

async function notifyShowcaseEvent(
  eventType: 'SHOWCASE_DRAFT_CREATED' | 'SHOWCASE_PUBLISHED' | 'SHOWCASE_UNPUBLISHED' | 'SHOWCASE_UPDATED',
  showcase: EventShowcaseRecord,
  env?: Record<string, any>
): Promise<void> {
  if (!showcase || !showcase.organization_id) return;
  const ownerUserId = (showcase as any).owner_user_id || (showcase as any).created_by || undefined;
  const eventName = showcase.title || 'Event Showcase';
  await dispatchNotificationEvent(
    {
      eventType,
      organizationId: showcase.organization_id,
      recipientUserId: ownerUserId,
      eventId: showcase.event_id,
      eventName,
      showcaseId: showcase.id || showcase.event_id,
      showcaseTitle: showcase.title,
      metadata: {
        publicUrl: `/showcase/${showcase.id || showcase.event_id}`,
      },
    },
    env
  ).catch((err) => console.error(`[NOTIFICATION] Failed to dispatch ${eventType}:`, err));
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

function isMissingRpcError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '');
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    msg.includes('Could not find the function') ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
}

function isMissingColumnError(err: any, colName: string): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '');
  return (
    (code === 'PGRST204' || code === '42703') &&
    (msg.includes(colName) || msg.includes(`"${colName}"`))
  );
}

function shouldFallbackFromRpcError(err: any): boolean {
  if (!err) return false;
  if (isMissingRpcError(err)) return true;
  const code = String(err.code || '');
  const msg = String(err.message || '');
  return (
    code === '42804' || // datatype mismatch (e.g. COALESCE types text and uuid cannot be matched)
    code === '42703' || // undefined column
    code === '23502' || // not-null constraint violation in function
    code === '42P01' || // undefined table
    msg.includes('COALESCE types') ||
    msg.includes('cannot be matched') ||
    msg.includes('violates not-null constraint') ||
    msg.includes('structure of query does not match function result type')
  );
}

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
 * Uses atomic SECURITY DEFINER save_event_showcase_atomic RPC to prevent trigger rejections.
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
    created_by?: string | null;
  },
  env?: Record<string, any>
): Promise<EventShowcaseRecord> {
  const existing = await getShowcaseByEventId(params.event_id, env);
  if (existing) {
    const err = new Error('An Event Showcase already exists for this event');
    (err as any).code = 'SHOWCASE_ALREADY_EXISTS';
    (err as any).status = 409;
    throw err;
  }

  const event = await getEventById(params.event_id, env);
  if (!event) {
    const err = new Error('Event not found');
    (err as any).code = 'EVENT_NOT_FOUND';
    (err as any).status = 404;
    throw err;
  }

  const eligibility = isEventEligibleForShowcase(event);
  if (!eligibility.eligible) {
    const err = new Error(eligibility.reason || 'Event is not eligible for showcase');
    (err as any).code = eligibility.code || 'EVENT_NOT_COMPLETED';
    (err as any).status = 422;
    throw err;
  }

  const now = new Date().toISOString();
  // Resolve owner_user_id from organization
  const org = await getOrganizationById(params.organization_id, env);
  const owner_user_id = org?.owner_id || null;
  const created_by = params.created_by || owner_user_id || event.created_by || null;

  // In the "Publish First, Moderate Later" model, default to PUBLISHED unless explicitly DRAFT/UNPUBLISHED
  const status: ShowcaseStatus = params.status || 'PUBLISHED';
  const publication_status: PublicationStatus = status === 'PUBLISHED' ? 'PUBLISHED' : 'UNPUBLISHED';
  const published_at = status === 'PUBLISHED' ? now : null;

  const payload: Record<string, any> = {
    organization_id: params.organization_id,
    title: params.title.trim(),
    status,
    publication_status,
  };
  if (params.description !== undefined) {
    payload.description = params.description ? params.description.trim() : null;
  }
  if (params.client_name !== undefined) {
    payload.client_name = params.client_name ? params.client_name.trim() : null;
  }
  if (params.client_logo_url !== undefined) {
    payload.client_logo_url = params.client_logo_url ? params.client_logo_url.trim() : null;
  }
  if (params.cover_image_url !== undefined) {
    payload.cover_image_url = params.cover_image_url ? params.cover_image_url.trim() : null;
  }
  if (owner_user_id) {
    payload.owner_user_id = owner_user_id;
  }

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    let rpcMissing = false;

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('save_event_showcase_atomic', {
        p_event_id: params.event_id,
        p_payload: payload,
        p_owner_user_id: isUUID(owner_user_id) ? owner_user_id : null,
        p_bypass_blocked_check: false,
      });

      if (!rpcError && rpcData) {
        const saved = (typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData) as EventShowcaseRecord;
        if (isLocalFallbackAllowed(env)) {
          localShowcasesCache.set(params.event_id, saved);
          saveLocalShowcases(env);
        }
        await notifyShowcaseEvent(saved.status === 'PUBLISHED' ? 'SHOWCASE_PUBLISHED' : 'SHOWCASE_DRAFT_CREATED', saved, env).catch((notifyErr) => {
          console.warn('Failed to send showcase event notification:', notifyErr);
        });
        return saved;
      }

      if (rpcError) {
        if (rpcError.code === 'P0003' || String(rpcError.message || '').includes('blocked')) {
          const err = new Error('This showcase has been blocked by administrators and cannot be edited. Please contact support.');
          (err as any).code = 'SHOWCASE_BLOCKED';
          (err as any).status = 403;
          throw err;
        }
        if (rpcError.code === 'P0002' || String(rpcError.message || '').includes('Event not found')) {
          const err = new Error('Event not found');
          (err as any).code = 'EVENT_NOT_FOUND';
          (err as any).status = 404;
          throw err;
        }
        if (rpcError.code === 'P0004' || String(rpcError.message || '').includes('confirmed, paid event')) {
          const err = new Error('Showcase requires a confirmed, paid event.');
          (err as any).code = 'EVENT_UNPAID';
          (err as any).status = 422;
          throw err;
        }
        if (rpcError.code === 'P0005' || String(rpcError.message || '').includes('cancelled or expired')) {
          const err = new Error(eligibility.reason || 'Showcase is not available for cancelled or expired events.');
          (err as any).code = eligibility.code || 'SHOWCASE_NOT_ELIGIBLE';
          (err as any).status = 422;
          throw err;
        }
        if (rpcError.code === 'P0006' || String(rpcError.message || '').includes('organization')) {
          const err = new Error('Event does not belong to the specified organization');
          (err as any).code = 'ORGANIZATION_MISMATCH';
          (err as any).status = 403;
          throw err;
        }
        if (rpcError.code === 'P0007' || String(rpcError.message || '').includes('deleted')) {
          const err = new Error('Event Showcase has been deleted');
          (err as any).code = 'SHOWCASE_DELETED';
          (err as any).status = 404;
          throw err;
        }
        if (rpcError.code === '23505' || String(rpcError.message || '').includes('unique')) {
          const err = new Error('An Event Showcase already exists for this event');
          (err as any).code = 'SHOWCASE_ALREADY_EXISTS';
          (err as any).status = 409;
          throw err;
        }

        if (shouldFallbackFromRpcError(rpcError)) {
          console.warn('[Showcase Create] save_event_showcase_atomic RPC failed with missing or schema error, using direct table insert:', rpcError.message);
          rpcMissing = true;
        } else if (!isLocalFallbackAllowed(env)) {
          const dbErr = new Error(`Database error creating showcase: ${rpcError.message}`);
          (dbErr as any).code = rpcError.code;
          throw dbErr;
        }
      }
    } catch (err: any) {
      if (
        err.status ||
        err.code === 'SHOWCASE_BLOCKED' ||
        err.code === 'EVENT_NOT_FOUND' ||
        err.code === 'EVENT_UNPAID' ||
        err.code === 'SHOWCASE_NOT_ELIGIBLE' ||
        err.code === 'SHOWCASE_ALREADY_EXISTS' ||
        err.code === 'SHOWCASE_DELETED'
      ) {
        throw err;
      }
      if (!rpcMissing && !isLocalFallbackAllowed(env)) {
        throw err;
      }
    }

    if (rpcMissing) {
      try {
        const event = await getEventById(params.event_id, env);
        let resolvedGameId = event?.game_id || (event?.game_theme_id ? (await getThemeById(event.game_theme_id, env))?.game_id : undefined);
        if (!resolvedGameId || !isUUID(resolvedGameId)) {
          try {
            const { data: sysGame } = await supabase.from('games').select('id').eq('is_system', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
            if (sysGame?.id && isUUID(sysGame.id)) {
              resolvedGameId = sysGame.id;
            }
          } catch {}
        }
        const creatorUserId = isUUID(created_by) ? created_by : (isUUID(owner_user_id) ? owner_user_id : null);
        const insertPayload: Record<string, any> = {
          id: crypto.randomUUID(),
          event_id: params.event_id,
          organization_id: params.organization_id,
          game_id: isUUID(resolvedGameId) ? resolvedGameId : null,
          owner_user_id: isUUID(owner_user_id) ? owner_user_id : null,
          created_by: creatorUserId,
          title: params.title.trim(),
          description: params.description ? params.description.trim() : null,
          client_name: params.client_name ? params.client_name.trim() : null,
          client_logo_url: params.client_logo_url ? params.client_logo_url.trim() : null,
          cover_image_url: params.cover_image_url ? params.cover_image_url.trim() : null,
          status,
          review_status: 'DRAFT',
          publication_status,
          reward_review_status: 'NOT_ELIGIBLE',
          reward_status: 'PENDING',
          published_at,
          created_at: now,
          updated_at: now,
        };

        let { data: insertedData, error: insertError } = await supabase
          .from('event_showcases')
          .insert(insertPayload)
          .select()
          .single();

        if (insertError && (insertError.code === '23502' || String(insertError.message || '').includes('game_id')) && !insertPayload.game_id) {
          try {
            const { data: sysGame } = await supabase.from('games').select('id').eq('is_system', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
            if (sysGame?.id) {
              insertPayload.game_id = sysGame.id;
              const retry = await supabase.from('event_showcases').insert(insertPayload).select().single();
              insertedData = retry.data;
              insertError = retry.error;
            }
          } catch {}
        }

        if (insertError && isMissingColumnError(insertError, 'game_id')) {
          delete insertPayload.game_id;
          const retry = await supabase.from('event_showcases').insert(insertPayload).select().single();
          insertedData = retry.data;
          insertError = retry.error;
        }

        if (insertError && isMissingColumnError(insertError, 'created_by')) {
          delete insertPayload.created_by;
          const retry = await supabase.from('event_showcases').insert(insertPayload).select().single();
          insertedData = retry.data;
          insertError = retry.error;
        }

        if (insertError && isMissingColumnError(insertError, 'owner_user_id')) {
          delete insertPayload.owner_user_id;
          const retry = await supabase.from('event_showcases').insert(insertPayload).select().single();
          insertedData = retry.data;
          insertError = retry.error;
        }
        if (insertError && isMissingColumnError(insertError, 'reward_review_status')) {
          delete insertPayload.reward_review_status;
          const retry = await supabase.from('event_showcases').insert(insertPayload).select().single();
          insertedData = retry.data;
          insertError = retry.error;
        }

        if (insertError) {
          if (insertError.code === '23505' || String(insertError.message || '').includes('duplicate key') || String(insertError.message || '').includes('unique')) {
            const err = new Error('An Event Showcase already exists for this event');
            (err as any).code = 'SHOWCASE_ALREADY_EXISTS';
            (err as any).status = 409;
            throw err;
          }
          if (!isLocalFallbackAllowed(env)) {
            const dbErr = new Error(`Database error creating showcase: ${insertError.message}`);
            (dbErr as any).code = insertError.code;
            throw dbErr;
          }
        } else if (insertedData) {
          const saved = insertedData as EventShowcaseRecord;
          if (isLocalFallbackAllowed(env)) {
            localShowcasesCache.set(params.event_id, saved);
            saveLocalShowcases(env);
          }
          await notifyShowcaseEvent(saved.status === 'PUBLISHED' ? 'SHOWCASE_PUBLISHED' : 'SHOWCASE_DRAFT_CREATED', saved, env).catch(() => {});
          return saved;
        }
      } catch (directInsertErr: any) {
        if (directInsertErr.status || directInsertErr.code === 'SHOWCASE_ALREADY_EXISTS') {
          throw directInsertErr;
        }
        if (!isLocalFallbackAllowed(env)) {
          throw directInsertErr;
        }
      }
    }
  }

  // Local fallback (only for development/testing without database)
  const id = crypto.randomUUID();
  const record: EventShowcaseRecord = {
    id,
    event_id: params.event_id,
    organization_id: params.organization_id,
    owner_user_id: isUUID(owner_user_id) ? owner_user_id : null,
    created_by: isUUID(created_by) ? created_by : null,
    title: params.title.trim(),
    description: params.description ? params.description.trim() : null,
    client_name: params.client_name ? params.client_name.trim() : null,
    client_logo_url: params.client_logo_url ? params.client_logo_url.trim() : null,
    cover_image_url: params.cover_image_url ? params.cover_image_url.trim() : null,
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

  localShowcasesCache.set(params.event_id, record);
  saveLocalShowcases(env);
  await notifyShowcaseEvent(record.status === 'PUBLISHED' ? 'SHOWCASE_PUBLISHED' : 'SHOWCASE_DRAFT_CREATED', record, env).catch(() => {});
  return record;
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
 * Uses atomic SECURITY DEFINER save_event_showcase_atomic RPC to prevent trigger rejections.
 */
export async function updateShowcase(
  eventId: string,
  updates: {
    owner_user_id?: string | null;
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
    (err as any).status = 404;
    throw err;
  }

  // Security check: BLOCKED showcases cannot be updated by normal users
  if (!bypassBlockedCheck) {
    if (existing.status === 'BLOCKED') {
      const err = new Error('Showcase has been blocked by administrators and cannot be modified.');
      (err as any).code = 'SHOWCASE_BLOCKED';
      (err as any).status = 403;
      throw err;
    }
    if (existing.status === 'DELETED' || existing.deleted_at) {
      const err = new Error('Showcase has been deleted and cannot be modified.');
      (err as any).code = 'SHOWCASE_DELETED';
      (err as any).status = 404;
      throw err;
    }
  }

  const payload: Record<string, any> = {};
  if (updates.title !== undefined) {
    payload.title = updates.title !== null ? updates.title.trim() : null;
  }
  if (updates.description !== undefined) {
    payload.description = updates.description !== null ? updates.description.trim() : null;
  }
  if (updates.client_name !== undefined) {
    payload.client_name = updates.client_name !== null ? updates.client_name.trim() : null;
  }
  if (updates.client_logo_url !== undefined) {
    payload.client_logo_url = updates.client_logo_url !== null ? updates.client_logo_url.trim() : null;
  }
  if (updates.cover_image_url !== undefined) {
    payload.cover_image_url = updates.cover_image_url !== null ? updates.cover_image_url.trim() : null;
  }
  if (updates.status !== undefined) {
    payload.status = updates.status;
  }
  if (updates.publication_status !== undefined) {
    payload.publication_status = updates.publication_status;
  }
  if (updates.review_status !== undefined) {
    payload.review_status = updates.review_status;
  }
  if (updates.reward_review_status !== undefined) {
    payload.reward_review_status = updates.reward_review_status;
  }
  if (updates.reward_reviewed_by !== undefined) {
    payload.reward_reviewed_by = isUUID(updates.reward_reviewed_by) ? updates.reward_reviewed_by : null;
  }
  if (updates.reward_reviewed_at !== undefined) {
    payload.reward_reviewed_at = updates.reward_reviewed_at;
  }
  if (updates.reward_rejection_reason !== undefined) {
    payload.reward_rejection_reason = updates.reward_rejection_reason;
  }
  if (updates.moderated_by !== undefined) {
    payload.moderated_by = isUUID(updates.moderated_by) ? updates.moderated_by : null;
  }
  if (updates.moderated_at !== undefined) {
    payload.moderated_at = updates.moderated_at;
  }
  if (updates.moderation_reason !== undefined) {
    payload.moderation_reason = updates.moderation_reason;
  }
  if (updates.deleted_at !== undefined) {
    payload.deleted_at = updates.deleted_at;
  }
  if (updates.submitted_at !== undefined) {
    payload.submitted_at = updates.submitted_at;
  }
  if (updates.reviewed_at !== undefined) {
    payload.reviewed_at = updates.reviewed_at;
  }
  if (updates.reviewed_by !== undefined) {
    payload.reviewed_by = isUUID(updates.reviewed_by) ? updates.reviewed_by : null;
  }
  if (updates.rejection_reason !== undefined) {
    payload.rejection_reason = updates.rejection_reason;
  }
  if (updates.reward_transaction_id !== undefined) {
    payload.reward_transaction_id = isUUID(updates.reward_transaction_id) ? updates.reward_transaction_id : null;
  }
  if (updates.reward_granted_at !== undefined) {
    payload.reward_granted_at = updates.reward_granted_at;
  }
  if (updates.reward_status !== undefined) {
    payload.reward_status = updates.reward_status;
  }
  if (updates.owner_user_id !== undefined) {
    payload.owner_user_id = isUUID(updates.owner_user_id) ? updates.owner_user_id : null;
  }

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    let rpcMissing = false;

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('save_event_showcase_atomic', {
        p_event_id: eventId,
        p_payload: payload,
        p_owner_user_id: isUUID(updates.owner_user_id) ? updates.owner_user_id : null,
        p_bypass_blocked_check: bypassBlockedCheck,
      });

      if (!rpcError && rpcData) {
        const saved = (typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData) as EventShowcaseRecord;
        if (isLocalFallbackAllowed(env)) {
          localShowcasesCache.set(eventId, saved);
          saveLocalShowcases(env);
        }
        const hasContentUpdates = updates.title !== undefined || updates.description !== undefined || updates.client_name !== undefined || updates.cover_image_url !== undefined;
        if (hasContentUpdates && updates.status === undefined) {
          await notifyShowcaseEvent('SHOWCASE_UPDATED', saved, env).catch((notifyErr) => {
            console.warn('Failed to send showcase updated notification:', notifyErr);
          });
        }
        return saved;
      }

      if (rpcError) {
        if (rpcError.code === 'P0003' || String(rpcError.message || '').includes('blocked')) {
          const err = new Error('Showcase has been blocked by administrators and cannot be modified.');
          (err as any).code = 'SHOWCASE_BLOCKED';
          (err as any).status = 403;
          throw err;
        }
        if (rpcError.code === 'P0002' || String(rpcError.message || '').includes('Event not found')) {
          const err = new Error('Event not found');
          (err as any).code = 'EVENT_NOT_FOUND';
          (err as any).status = 404;
          throw err;
        }
        if (rpcError.code === 'P0004' || String(rpcError.message || '').includes('confirmed, paid event')) {
          const err = new Error('Showcase requires a confirmed, paid event.');
          (err as any).code = 'EVENT_UNPAID';
          (err as any).status = 422;
          throw err;
        }
        if (rpcError.code === 'P0005' || String(rpcError.message || '').includes('cancelled or expired')) {
          const err = new Error('Showcase is not available for cancelled or expired events.');
          (err as any).code = 'SHOWCASE_NOT_ELIGIBLE';
          (err as any).status = 422;
          throw err;
        }
        if (rpcError.code === 'P0007' || String(rpcError.message || '').includes('deleted')) {
          const err = new Error('Showcase has been deleted and cannot be modified.');
          (err as any).code = 'SHOWCASE_DELETED';
          (err as any).status = 404;
          throw err;
        }

        if (shouldFallbackFromRpcError(rpcError)) {
          console.warn('[Showcase Update] save_event_showcase_atomic RPC failed with missing or schema error, using direct table update:', rpcError.message);
          rpcMissing = true;
        } else if (!isLocalFallbackAllowed(env)) {
          const dbErr = new Error(`Database error updating showcase: ${rpcError.message}`);
          (dbErr as any).code = rpcError.code;
          throw dbErr;
        }
      }
    } catch (err: any) {
      if (
        err.status ||
        err.code === 'SHOWCASE_BLOCKED' ||
        err.code === 'EVENT_NOT_FOUND' ||
        err.code === 'EVENT_UNPAID' ||
        err.code === 'SHOWCASE_NOT_ELIGIBLE' ||
        err.code === 'SHOWCASE_DELETED'
      ) {
        throw err;
      }
      if (!rpcMissing && !isLocalFallbackAllowed(env)) {
        throw err;
      }
    }

    if (rpcMissing) {
      try {
        const now = new Date().toISOString();
        const updateFields: Record<string, any> = {
          updated_at: now,
        };
        if (updates.title !== undefined) updateFields.title = updates.title ? updates.title.trim() : existing.title;
        if (updates.description !== undefined) updateFields.description = updates.description !== null ? updates.description.trim() : null;
        if (updates.client_name !== undefined) updateFields.client_name = updates.client_name !== null ? updates.client_name.trim() : null;
        if (updates.client_logo_url !== undefined) updateFields.client_logo_url = updates.client_logo_url !== null ? updates.client_logo_url.trim() : null;
        if (updates.cover_image_url !== undefined) updateFields.cover_image_url = updates.cover_image_url !== null ? updates.cover_image_url.trim() : null;
        if (updates.status !== undefined) updateFields.status = updates.status;
        if (updates.publication_status !== undefined) updateFields.publication_status = updates.publication_status;
        if (updates.review_status !== undefined) updateFields.review_status = updates.review_status;
        if (updates.reward_review_status !== undefined) updateFields.reward_review_status = updates.reward_review_status;
        if (updates.reward_reviewed_by !== undefined) updateFields.reward_reviewed_by = isUUID(updates.reward_reviewed_by) ? updates.reward_reviewed_by : null;
        if (updates.reward_reviewed_at !== undefined) updateFields.reward_reviewed_at = updates.reward_reviewed_at;
        if (updates.reward_rejection_reason !== undefined) updateFields.reward_rejection_reason = updates.reward_rejection_reason;
        if (updates.moderated_by !== undefined) updateFields.moderated_by = isUUID(updates.moderated_by) ? updates.moderated_by : null;
        if (updates.moderated_at !== undefined) updateFields.moderated_at = updates.moderated_at;
        if (updates.moderation_reason !== undefined) updateFields.moderation_reason = updates.moderation_reason;
        if (updates.deleted_at !== undefined) updateFields.deleted_at = updates.deleted_at;
        if (updates.submitted_at !== undefined) updateFields.submitted_at = updates.submitted_at;
        if (updates.reviewed_at !== undefined) updateFields.reviewed_at = updates.reviewed_at;
        if (updates.reviewed_by !== undefined) updateFields.reviewed_by = isUUID(updates.reviewed_by) ? updates.reviewed_by : null;
        if (updates.rejection_reason !== undefined) updateFields.rejection_reason = updates.rejection_reason;
        if (updates.reward_transaction_id !== undefined) updateFields.reward_transaction_id = isUUID(updates.reward_transaction_id) ? updates.reward_transaction_id : null;
        if (updates.reward_granted_at !== undefined) updateFields.reward_granted_at = updates.reward_granted_at;
        if (updates.reward_status !== undefined) updateFields.reward_status = updates.reward_status;
        if (updates.owner_user_id !== undefined) updateFields.owner_user_id = isUUID(updates.owner_user_id) ? updates.owner_user_id : null;

        let { data: updatedData, error: updateError } = await supabase
          .from('event_showcases')
          .update(updateFields)
          .eq('id', existing.id)
          .select()
          .single();

        if (updateError && isMissingColumnError(updateError, 'owner_user_id')) {
          delete updateFields.owner_user_id;
          const retry = await supabase.from('event_showcases').update(updateFields).eq('id', existing.id).select().single();
          updatedData = retry.data;
          updateError = retry.error;
        }
        if (updateError && isMissingColumnError(updateError, 'reward_review_status')) {
          delete updateFields.reward_review_status;
          const retry = await supabase.from('event_showcases').update(updateFields).eq('id', existing.id).select().single();
          updatedData = retry.data;
          updateError = retry.error;
        }

        if (updateError && !isLocalFallbackAllowed(env)) {
          const dbErr = new Error(`Database error updating showcase: ${updateError.message}`);
          (dbErr as any).code = updateError.code;
          throw dbErr;
        }

        if (updatedData) {
          const saved = updatedData as EventShowcaseRecord;
          if (isLocalFallbackAllowed(env)) {
            localShowcasesCache.set(eventId, saved);
            saveLocalShowcases(env);
          }
          const hasContentUpdates = updates.title !== undefined || updates.description !== undefined || updates.client_name !== undefined || updates.cover_image_url !== undefined;
          if (hasContentUpdates && updates.status === undefined) {
            await notifyShowcaseEvent('SHOWCASE_UPDATED', saved, env).catch(() => {});
          }
          return saved;
        }
      } catch (directUpdateErr: any) {
        if (!isLocalFallbackAllowed(env)) {
          throw directUpdateErr;
        }
      }
    }
  }

  // Local fallback (only for development/testing without database)
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
    owner_user_id: updates.owner_user_id !== undefined ? updates.owner_user_id : (existing.owner_user_id || null),
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

  localShowcasesCache.set(eventId, updatedRecord);
  saveLocalShowcases(env);
  const hasContentUpdates = updates.title !== undefined || updates.description !== undefined || updates.client_name !== undefined || updates.cover_image_url !== undefined;
  if (hasContentUpdates && updates.status === undefined) {
    await notifyShowcaseEvent('SHOWCASE_UPDATED', updatedRecord, env).catch(() => {});
  }
  return updatedRecord;
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
 * This is an OWNER-LEVEL reward (lifetime limit of one per owner_user_id).
 * Separate from showcase visibility and admin event review!
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

  // Resolve owner_user_id
  let ownerUserId = showcase.owner_user_id;
  if (!ownerUserId) {
    const org = await getOrganizationById(showcase.organization_id, env);
    ownerUserId = org?.owner_id || null;
    if (ownerUserId && !showcase.owner_user_id) {
      showcase.owner_user_id = ownerUserId;
      // Persist resolved owner_user_id
      try {
        await updateShowcase(eventId, { owner_user_id: ownerUserId }, env, true);
      } catch (e) {
        // Non-critical if fails
      }
    }
  }

  // If already rewarded, no change needed
  if (showcase.reward_review_status === 'REWARDED' || showcase.reward_status === 'REWARDED') {
    return showcase;
  }

  const supabase = getSupabaseServerClient(env);

  // Check if a completed showcase credit transaction already exists specifically for THIS showcase
  let thisShowcaseTxn: any = null;
  if (isSupabaseConfigured(env)) {
    const { data } = await supabase
      .from('wallet_transactions')
      .select('id')
      .eq('organization_id', showcase.organization_id)
      .eq('transaction_type', 'SHOWCASE_CREDIT')
      .eq('status', 'COMPLETED')
      .or(`reference_id.eq.showcase_${showcase.id},metadata->>showcase_id.eq.${showcase.id}`)
      .maybeSingle();
    thisShowcaseTxn = data;
  }

  if (thisShowcaseTxn || showcase.reward_transaction_id) {
    // If the reward transaction was already granted for this showcase, reconcile to REWARDED
    return await updateShowcase(
      eventId,
      {
        reward_review_status: 'REWARDED',
        reward_status: 'REWARDED',
        reward_transaction_id: thisShowcaseTxn?.id || showcase.reward_transaction_id,
        owner_user_id: ownerUserId || undefined,
      },
      env,
      true
    );
  }

  // 1. OWNER-LEVEL lifetime eligibility check: One reward per owner_user_id
  if (ownerUserId) {
    const isOwner = await isUserOrganizationOwner(ownerUserId, showcase.organization_id, env);
    if (!isOwner) {
      return await updateShowcase(
        eventId,
        {
          reward_review_status: 'NOT_ELIGIBLE',
          reward_status: 'NOT_ELIGIBLE',
          reward_rejection_reason: 'Only the organization owner is eligible for Showcase Reward. Organization members cannot receive promotional credits.',
          owner_user_id: ownerUserId,
        },
        env,
        true
      );
    }

    // Authoritative lifetime eligibility check via user_rewards & transactions
    const eligibility = await getShowcaseRewardEligibility(ownerUserId, env);
    if (!eligibility.eligible) {
      return await updateShowcase(
        eventId,
        {
          reward_review_status: 'NOT_ELIGIBLE',
          reward_status: 'NOT_ELIGIBLE',
          reward_rejection_reason: eligibility.reason || 'Owner has already received their one-time lifetime showcase reward on another event.',
          owner_user_id: ownerUserId,
        },
        env,
        true
      );
    }
  }

  // 2. Event payment and completed event check
  // Authoritative Separation:
  // - Showcase creation & publishing eligibility -> event has started (is LIVE or COMPLETED, and PAID)
  // - Showcase reward review eligibility         -> event has completed (is COMPLETED and PAID)
  const eventData = await getEventById(eventId, env);

  const isPaid = eventData?.payment_status === 'PAID';
  const todayStr = getNormalizedCurrentDate();
  const isCompleted =
    eventData?.status === 'completed' ||
    eventData?.event_status === 'COMPLETED' ||
    (Boolean(eventData?.end_date) && todayStr > (eventData?.end_date || ''));

  if (!isPaid) {
    return await updateShowcase(
      eventId,
      {
        reward_review_status: 'NOT_ELIGIBLE',
        reward_status: 'NOT_ELIGIBLE',
        reward_rejection_reason: 'Showcase reward requires a confirmed, paid event.',
        owner_user_id: ownerUserId || undefined,
      },
      env,
      true
    );
  }

  if (!isCompleted) {
    return await updateShowcase(
      eventId,
      {
        reward_review_status: 'NOT_ELIGIBLE',
        reward_status: 'NOT_ELIGIBLE',
        reward_rejection_reason: 'Reward review is available once the event has completed.',
        owner_user_id: ownerUserId || undefined,
      },
      env,
      true
    );
  }

  // 3. Media requirements: >= 3 images OR >= 1 video
  const mediaList = await getShowcaseMedia(showcase.id, showcase.organization_id, env);
  const imageCount = (mediaList || []).filter(
    (m) => m.media_type === 'IMAGE' || (!m.media_type && !m.mime_type?.startsWith('video/'))
  ).length;
  const videoCount = (mediaList || []).filter(
    (m) => m.media_type === 'VIDEO' || m.mime_type?.startsWith('video/')
  ).length;
  const hasRequiredMedia = imageCount >= 3 || videoCount >= 1;

  // 4. Content requirements: title and trimmed description >= 50 characters
  const hasTitle = !!showcase.title && showcase.title.trim().length > 0;
  const trimmedDesc = (showcase.description || '').trim();
  const hasValidDescription = trimmedDesc.length >= 50;

  // 5. Showcase status: PUBLISHED, not BLOCKED, not DELETED
  const isPublishedAndActive =
    (showcase.status === 'PUBLISHED' || showcase.publication_status === 'PUBLISHED') &&
    showcase.status !== 'BLOCKED' &&
    !showcase.deleted_at;

  const isEligible =
    hasRequiredMedia &&
    hasTitle &&
    hasValidDescription &&
    isPublishedAndActive;

  if (isEligible) {
    return await updateShowcase(
      eventId,
      {
        reward_review_status: 'AWAITING_APPROVAL',
        reward_status: 'PENDING',
        reward_rejection_reason: null,
        owner_user_id: ownerUserId || undefined,
      },
      env,
      true
    );
  } else {
    // Determine exact missing requirement for transparency
    let rejectionReason = 'Showcase does not meet reward criteria.';
    if (!isPublishedAndActive) {
      rejectionReason = 'Showcase must be published to be eligible for reward review.';
    } else if (!hasRequiredMedia) {
      rejectionReason = 'At least 3 photos or 1 video clip must be uploaded.';
    } else if (!hasTitle || !hasValidDescription) {
      rejectionReason = 'Title and a detailed summary of at least 50 characters are required.';
    }

    return await updateShowcase(
      eventId,
      {
        reward_review_status: 'NOT_ELIGIBLE',
        reward_status: 'NOT_ELIGIBLE',
        reward_rejection_reason: rejectionReason,
        owner_user_id: ownerUserId || undefined,
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

  // Authoritative rule: Reward review requires that the event has completed
  const event = await getEventById(eventId, env);
  if (event) {
    const rewardElig = isEventEligibleForShowcaseReward(event);
    if (!rewardElig.eligible) {
      const err = new Error(rewardElig.reason || 'Reward review is only available after the event has completed.');
      (err as any).code = rewardElig.code || 'EVENT_NOT_COMPLETED';
      (err as any).status = 422;
      throw err;
    }
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
 * Approve Showcase First-Event Reward and grant RM300 credit atomically
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
  if (!showcaseId) {
    const err = new Error('Showcase ID is required');
    (err as any).code = 'VALIDATION_ERROR';
    throw err;
  }

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

  // If showcase has been explicitly evaluated and rejected with a rejection reason, reject approval
  if ((showcase.reward_review_status === 'NOT_ELIGIBLE' || showcase.reward_status === 'NOT_ELIGIBLE') && showcase.reward_rejection_reason) {
    const err = new Error(
      showcase.reward_rejection_reason ||
        'Showcase does not meet the RM300 first-event reward criteria (owner has already received their one-time lifetime showcase reward).'
    );
    (err as any).code = 'SHOWCASE_NOT_ELIGIBLE';
    throw err;
  }

  // Resolve ownerUserId
  let ownerUserId = showcase.owner_user_id;
  if (!ownerUserId) {
    const org = await getOrganizationById(showcase.organization_id, env);
    ownerUserId = org?.owner_id || null;
  }

  // Execute under per-user and per-organization lock to prevent race conditions
  const lockTargetUser = ownerUserId || showcase.organization_id;
  return await withUserRewardLock(lockTargetUser, async () => {
    return await withOrganizationLock(showcase.organization_id, async () => {
      // Strictly verify owner lifetime eligibility before processing reward
      if (ownerUserId) {
        const alreadyRewarded = (await hasUserReceivedShowcaseCredit(ownerUserId, env)) || (await hasUserClaimedReward(ownerUserId, 'SHOWCASE_REWARD', env));
        if (alreadyRewarded && showcase.reward_review_status !== 'REWARDED' && showcase.reward_status !== 'REWARDED') {
          const updated = await updateShowcase(
            showcase.event_id,
            {
              reward_review_status: 'NOT_ELIGIBLE',
              reward_status: 'NOT_ELIGIBLE',
              owner_user_id: ownerUserId,
            },
            env,
            true
          );
          return {
            showcase: updated || showcase,
            reward: {
              success: true,
              already_rewarded: true,
              message: 'First-event showcase reward credit has already been granted to this owner account (one-time lifetime reward).',
            },
            alreadyRewarded: true,
          };
        }
      }

      // 1. Preferred Production Path: Single Atomic PostgreSQL RPC
    // Performs wallet row lock (FOR UPDATE), verifies first-reward invariant,
    // verifies showcase is AWAITING_APPROVAL, re-verifies all eligibility rules,
    // creates SHOWCASE_CREDIT transaction, updates organization_wallets and event_showcases
    // inside a single transaction with automatic rollback on any failure.
    if (isSupabaseConfigured(env)) {
      const supabase = getSupabaseServerClient(env);
      try {
        const validReviewerUuid = isUUID(reviewerId) ? reviewerId : null;
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          'approve_first_event_showcase_reward_atomic',
          {
            p_showcase_id: showcaseId,
            p_reviewer_id: validReviewerUuid,
            p_reference_id: `showcase_${showcase.id}`,
            p_metadata: {
              showcase_id: showcase.id,
              event_id: showcase.event_id,
              owner_user_id: ownerUserId,
              reviewer_id: reviewerId,
              client: 'EventGameStudio',
            },
          }
        );

        if (!rpcError && rpcData && rpcData.success) {
          const updatedShowcase = rpcData.showcase as EventShowcaseRecord;
          if (ownerUserId) {
            const nowIso = new Date().toISOString();
            localOwnerShowcaseRewardsCache.set(ownerUserId, {
              owner_user_id: ownerUserId,
              organization_id: updatedShowcase.organization_id,
              event_id: updatedShowcase.event_id,
              showcase_id: updatedShowcase.id,
              transaction_id: updatedShowcase.reward_transaction_id || null,
              amount: 300,
              rewarded_at: updatedShowcase.reward_granted_at || nowIso,
              created_at: updatedShowcase.reward_granted_at || nowIso,
            });
          }
          if (isLocalFallbackAllowed(env)) {
            localShowcasesCache.set(updatedShowcase.event_id, updatedShowcase);
          }
          return {
            showcase: updatedShowcase,
            reward: rpcData,
            alreadyRewarded: Boolean(rpcData.already_rewarded),
          };
        }

        if (rpcError) {
          const isMissingRpc =
            rpcError.code === 'PGRST202' ||
            rpcError.message?.includes('does not exist') ||
            rpcError.message?.includes('function');

          const isLocalShowcaseFallback =
            isLocalFallbackAllowed(env) &&
            rpcError.code === 'P0001' &&
            rpcError.message?.includes('Showcase not found');

          if (!isMissingRpc && !isLocalShowcaseFallback) {
            console.error('Supabase approve_first_event_showcase_reward_atomic error:', rpcError);
            const err = new Error(rpcError.message || 'Reward approval failed');
            (err as any).code = rpcError.code || 'REWARD_APPROVAL_FAILED';
            throw err;
          }
        }
      } catch (err: any) {
        const isLocalShowcaseFallback =
          isLocalFallbackAllowed(env) &&
          (err.code === 'P0001' || err.message?.includes('Showcase not found'));

        if (err.code && err.code !== 'PGRST202' && !err.message?.includes('does not exist') && !isLocalShowcaseFallback) {
          throw err;
        }
        // Fall back to atomic in-process execution below
      }
    }

    // 2. Fallback Path: In-process execution under withOrganizationLock
    const freshShowcase = (await getShowcaseById(showcaseId, env)) || showcase;
    if (freshShowcase.reward_review_status === 'REWARDED' && freshShowcase.reward_status === 'REWARDED') {
      return {
        showcase: freshShowcase,
        reward: null,
        alreadyRewarded: true,
      };
    }

    // Strictly verify that the showcase meets all RM300 first-event criteria before crediting wallet
    const evaluated = await evaluateShowcaseRewardEligibility(freshShowcase.event_id, env);
    if (evaluated.reward_review_status === 'NOT_ELIGIBLE') {
      const err = new Error(
        'Showcase does not meet the RM300 first-event reward criteria (event must be paid and started/concluded, media must have at least 3 photos or 1 video, description must be at least 50 characters, showcase must be published, and this must be the owner\'s first eligible showcase reward).'
      );
      (err as any).code = 'SHOWCASE_NOT_ELIGIBLE';
      throw err;
    }

    const now = new Date().toISOString();

    // Trigger the idempotent RM300 showcase reward function anchored to ownerUserId
    const rewardResult = await grantShowcaseCredit(
      {
        organizationId: freshShowcase.organization_id,
        eventId: freshShowcase.event_id,
        ownerUserId: ownerUserId || undefined,
        createdBy: isUUID(reviewerId) ? reviewerId : undefined,
        referenceId: `showcase_${freshShowcase.id}`,
        metadata: {
          showcase_id: freshShowcase.id,
          event_id: freshShowcase.event_id,
          owner_user_id: ownerUserId,
          reviewed_by: reviewerId,
          approved_at: now,
        },
      },
      env
    );

    // Update ONLY reward fields; leave review_status and publication_status independent
    const updatedShowcase = await updateShowcase(
      freshShowcase.event_id,
      {
        owner_user_id: ownerUserId || freshShowcase.owner_user_id,
        reward_review_status: 'REWARDED',
        reward_reviewed_by: isUUID(reviewerId) ? reviewerId : null,
        reward_reviewed_at: now,
        reward_rejection_reason: null,
        reward_transaction_id: rewardResult.transaction?.id || null,
        reward_granted_at: freshShowcase.reward_granted_at || now,
        reward_status: 'REWARDED',
      },
      env,
      true
    );

    if (ownerUserId) {
      const nowIso = new Date().toISOString();
      localOwnerShowcaseRewardsCache.set(ownerUserId, {
        owner_user_id: ownerUserId,
        organization_id: updatedShowcase.organization_id,
        event_id: updatedShowcase.event_id,
        showcase_id: updatedShowcase.id,
        transaction_id: updatedShowcase.reward_transaction_id || null,
        amount: 300,
        rewarded_at: updatedShowcase.reward_granted_at || nowIso,
        created_at: updatedShowcase.reward_granted_at || nowIso,
      });
    }

    return {
      showcase: updatedShowcase,
      reward: rewardResult,
      alreadyRewarded: rewardResult.alreadyGranted,
    };
    });
  });
}

// Alias for backward compatibility
export const approveShowcaseReview = approveShowcaseReward;

/**
 * Reject Showcase First-Event Reward with mandatory reason
 * (Showcase visibility remains live/published - only the financial reward is rejected)
 * Does NOT alter review_status (editorial event review).
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
    },
    env,
    true
  );
}

// Alias for backward compatibility
export const rejectShowcaseReview = rejectShowcaseReward;

/**
 * Approve Event Review (Editorial / Quality verification)
 * Separate from Showcase First-Event Reward Approval!
 */
export async function approveEventReview(
  showcaseId: string,
  reviewerId: string,
  env?: Record<string, any>
): Promise<EventShowcaseRecord> {
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
      review_status: 'APPROVED',
      reviewed_by: isUUID(reviewerId) ? reviewerId : null,
      reviewed_at: now,
      rejection_reason: null,
    },
    env,
    true
  );
}

/**
 * Reject Event Review (Editorial / Quality feedback)
 * Separate from Showcase First-Event Reward Approval!
 * Does NOT unpublish showcase or affect reward status.
 */
export async function rejectEventReview(
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
      reviewed_by: isUUID(reviewerId) ? reviewerId : null,
      reviewed_at: now,
    },
    env,
    true
  );
}

/**
 * Get Owner Showcase Reward Status
 * Checks whether an owner has already received their one-time lifetime reward
 */
export async function getOwnerShowcaseRewardStatus(
  ownerUserId: string,
  env?: Record<string, any>
): Promise<{
  hasReceivedReward: boolean;
  eligible: boolean;
  reward: any | null;
}> {
  if (!ownerUserId) {
    return { hasReceivedReward: false, eligible: false, reward: null };
  }

  // 1. Check local cache
  const localReward = localOwnerShowcaseRewardsCache.get(ownerUserId);
  if (localReward) {
    return { hasReceivedReward: true, eligible: false, reward: localReward };
  }

  // 2. Check Supabase
  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data } = await supabase
      .from('owner_showcase_rewards')
      .select('*')
      .eq('owner_user_id', ownerUserId)
      .maybeSingle();

    if (data) {
      return { hasReceivedReward: true, eligible: false, reward: data };
    }
  }

  // 3. Comprehensive check across user_rewards, wallet_transactions, and organization ledgers
  const hasReceived = (await hasUserReceivedShowcaseCredit(ownerUserId, env)) || (await hasUserClaimedReward(ownerUserId, 'SHOWCASE_REWARD', env));
  if (hasReceived) {
    let orgId: string | undefined = undefined;
    if (isSupabaseConfigured(env)) {
      const supabase = getSupabaseServerClient(env);
      const { data: tx } = await supabase
        .from('wallet_transactions')
        .select('organization_id')
        .eq('owner_user_id', ownerUserId)
        .eq('transaction_type', 'SHOWCASE_CREDIT')
        .maybeSingle();
      if (tx?.organization_id) orgId = tx.organization_id;
      if (!orgId) {
        const { data: ur } = await supabase
          .from('user_rewards')
          .select('organization_id')
          .eq('user_id', ownerUserId)
          .eq('reward_type', 'SHOWCASE_REWARD')
          .maybeSingle();
        if (ur?.organization_id) orgId = ur.organization_id;
      }
    }
    return {
      hasReceivedReward: true,
      eligible: false,
      reward: {
        owner_user_id: ownerUserId,
        organization_id: orgId,
        amount: 300,
        reward_type: 'SHOWCASE_CREDIT',
      },
    };
  }

  return { hasReceivedReward: false, eligible: true, reward: null };
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
 * - If showcase already exists for this event: updates status to PUBLISHED and preserves existing data/updates.
 * - If showcase does not exist yet: safely creates and publishes a showcase for this event,
 *   ensuring uniqueness (no duplicate showcases).
 * - Enforces event existence and showcase eligibility.
 * - Adds server-side logging showing eventId received, event existence, showcase lookup result, showcase ID, and publish/update result.
 */
export async function publishShowcase(
  eventId: string,
  updatesOrEnv?: {
    owner_user_id?: string | null;
    title?: string | null;
    description?: string | null;
    client_name?: string | null;
    client_logo_url?: string | null;
    cover_image_url?: string | null;
  } | Record<string, any>,
  possibleEnv?: Record<string, any>
): Promise<EventShowcaseRecord> {
  let updates: {
    owner_user_id?: string | null;
    title?: string | null;
    description?: string | null;
    client_name?: string | null;
    client_logo_url?: string | null;
    cover_image_url?: string | null;
  } | undefined = undefined;

  let env: Record<string, any> | undefined = undefined;

  if (updatesOrEnv) {
    if (
      'SUPABASE_URL' in updatesOrEnv ||
      'VITE_SUPABASE_URL' in updatesOrEnv ||
      'DATABASE_URL' in updatesOrEnv ||
      'SUPABASE_SERVICE_ROLE_KEY' in updatesOrEnv
    ) {
      env = updatesOrEnv as Record<string, any>;
    } else {
      updates = updatesOrEnv as any;
      env = possibleEnv;
    }
  } else {
    env = possibleEnv;
  }

  console.log(`[Showcase Publish] eventId received: ${eventId}`);

  const event = await getEventById(eventId, env);
  console.log(`[Showcase Publish] event existence: ${!!event}${event ? ` (id=${event.id}, name="${event.name}")` : ''}`);
  if (!event) {
    const err = new Error('Event not found');
    (err as any).code = 'EVENT_NOT_FOUND';
    (err as any).status = 404;
    throw err;
  }

  const eligibility = isEventEligibleForShowcase(event);
  if (!eligibility.eligible) {
    const err = new Error(eligibility.reason || 'Event is not eligible for showcase');
    (err as any).code = eligibility.code || 'EVENT_NOT_COMPLETED';
    (err as any).status = 422;
    throw err;
  }

  const existing = await getShowcaseByEventId(eventId, env);
  console.log(`[Showcase Publish] showcase lookup result: ${existing ? `Found existing showcase (id=${existing.id}, status=${existing.status})` : 'None found (will create and publish new showcase)'}`);

  if (existing && existing.status === 'BLOCKED') {
    const err = new Error('Cannot publish a blocked showcase. Please contact support.');
    (err as any).code = 'SHOWCASE_BLOCKED';
    (err as any).status = 403;
    throw err;
  }

  const titleToUse = updates?.title !== undefined && updates.title !== null
    ? updates.title.trim()
    : (existing?.title || event.name?.trim() || 'Event Showcase');

  // Build payload with strict null semantics:
  // Present key with null value clears field; omitted key preserves existing value.
  const payload: Record<string, any> = {
    title: titleToUse,
  };
  if (updates?.description !== undefined) {
    payload.description = updates.description !== null ? updates.description.trim() : null;
  }
  if (updates?.client_name !== undefined) {
    payload.client_name = updates.client_name !== null ? updates.client_name.trim() : null;
  }
  if (updates?.client_logo_url !== undefined) {
    payload.client_logo_url = updates.client_logo_url !== null ? updates.client_logo_url.trim() : null;
  }
  if (updates?.cover_image_url !== undefined) {
    payload.cover_image_url = updates.cover_image_url !== null ? updates.cover_image_url.trim() : null;
  }
  if (updates?.owner_user_id !== undefined) {
    payload.owner_user_id = isUUID(updates.owner_user_id) ? updates.owner_user_id : null;
  }

  let resolvedGameId = event.game_id || (event.game_theme_id ? (await getThemeById(event.game_theme_id, env))?.game_id : undefined);
  if (isSupabaseConfigured(env) && (!resolvedGameId || !isUUID(resolvedGameId))) {
    try {
      const supabaseClient = getSupabaseServerClient(env);
      const { data: sysGame } = await supabaseClient.from('games').select('id').eq('is_system', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (sysGame?.id && isUUID(sysGame.id)) {
        resolvedGameId = sysGame.id;
      }
    } catch {}
  }
  if (resolvedGameId && isUUID(resolvedGameId)) {
    payload.game_id = resolvedGameId;
  }

  // Authoritative Production Path: Single Atomic PostgreSQL RPC under SECURITY DEFINER
  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    let rpcMissing = false;

    try {
      console.log(`[Showcase Publish] invoking publish_event_showcase_atomic RPC for event ${eventId}`);
      const { data: rpcData, error: rpcError } = await supabase.rpc('publish_event_showcase_atomic', {
        p_event_id: eventId,
        p_payload: payload,
        p_owner_user_id: isUUID(updates?.owner_user_id) ? updates.owner_user_id : null,
      });

      if (!rpcError && rpcData) {
        const publishedRecord = (typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData) as EventShowcaseRecord;
        if (isLocalFallbackAllowed(env)) {
          localShowcasesCache.set(eventId, publishedRecord);
          saveLocalShowcases(env);
        }
        await notifyShowcaseEvent('SHOWCASE_PUBLISHED', publishedRecord, env).catch((notifyErr) => {
          console.warn('Failed to send showcase published notification:', notifyErr);
        });
        console.log(`[Showcase Publish] showcase ID: ${publishedRecord.id}`);
        console.log(`[Showcase Publish] publish/update result: status=${publishedRecord.status}, publication_status=${publishedRecord.publication_status}, event_id=${publishedRecord.event_id}`);
        return publishedRecord;
      }

      if (rpcError) {
        console.warn(`[Showcase Publish] publish_event_showcase_atomic RPC returned error:`, rpcError);

        // Map known database operational codes to status/code
        if (rpcError.code === 'P0003' || String(rpcError.message || '').includes('blocked showcase') || String(rpcError.message || '').includes('blocked by administrators')) {
          const err = new Error('Cannot publish a blocked showcase. Please contact support.');
          (err as any).code = 'SHOWCASE_BLOCKED';
          (err as any).status = 403;
          throw err;
        }
        if (rpcError.code === 'P0002' || String(rpcError.message || '').includes('Event not found')) {
          const err = new Error('Event not found');
          (err as any).code = 'EVENT_NOT_FOUND';
          (err as any).status = 404;
          throw err;
        }
        if (rpcError.code === 'P0004' || String(rpcError.message || '').includes('confirmed, paid event')) {
          const err = new Error('Showcase requires a confirmed, paid event.');
          (err as any).code = 'EVENT_UNPAID';
          (err as any).status = 422;
          throw err;
        }
        if (rpcError.code === 'P0005' || String(rpcError.message || '').includes('cancelled or expired')) {
          const err = new Error(eligibility.reason || 'Showcase is not available for cancelled or expired events.');
          (err as any).code = eligibility.code || 'SHOWCASE_NOT_ELIGIBLE';
          (err as any).status = 422;
          throw err;
        }
        if (rpcError.code === 'P0007' || String(rpcError.message || '').includes('deleted')) {
          const err = new Error('Event Showcase has been deleted');
          (err as any).code = 'SHOWCASE_DELETED';
          (err as any).status = 404;
          throw err;
        }

        if (shouldFallbackFromRpcError(rpcError)) {
          console.warn('[Showcase Publish] publish_event_showcase_atomic RPC missing or failed with schema error, falling back to direct table publish:', rpcError.message);
          rpcMissing = true;
        } else if (!isLocalFallbackAllowed(env)) {
          const dbErr = new Error(`Database error publishing showcase: ${rpcError.message || 'Unknown error'}`);
          (dbErr as any).code = rpcError.code;
          (dbErr as any).details = rpcError.details;
          throw dbErr;
        }
      }
    } catch (err: any) {
      if (
        err.status ||
        err.code === 'SHOWCASE_BLOCKED' ||
        err.code === 'EVENT_NOT_FOUND' ||
        err.code === 'EVENT_UNPAID' ||
        err.code === 'SHOWCASE_NOT_ELIGIBLE' ||
        err.code === 'SHOWCASE_DELETED'
      ) {
        throw err;
      }
      if (!rpcMissing && !isLocalFallbackAllowed(env)) {
        throw err;
      }
    }

    if (rpcMissing) {
      try {
        console.log(`[Showcase Publish] executing direct Supabase table publish for event ${eventId}`);
        const now = new Date().toISOString();
        let savedRecord: EventShowcaseRecord | null = null;

        if (existing) {
          // Update existing showcase to PUBLISHED
          const updateFields: Record<string, any> = {
            title: titleToUse,
            status: 'PUBLISHED',
            publication_status: 'PUBLISHED',
            published_at: existing.published_at || now,
            updated_at: now,
          };
          if (updates?.description !== undefined) {
            updateFields.description = updates.description !== null ? updates.description.trim() : null;
          }
          if (updates?.client_name !== undefined) {
            updateFields.client_name = updates.client_name !== null ? updates.client_name.trim() : null;
          }
          if (updates?.client_logo_url !== undefined) {
            updateFields.client_logo_url = updates.client_logo_url !== null ? updates.client_logo_url.trim() : null;
          }
          if (updates?.cover_image_url !== undefined) {
            updateFields.cover_image_url = updates.cover_image_url !== null ? updates.cover_image_url.trim() : null;
          }
          if (updates?.owner_user_id !== undefined && isUUID(updates.owner_user_id)) {
            updateFields.owner_user_id = updates.owner_user_id;
          }

          let { data: updateData, error: updateErr } = await supabase
            .from('event_showcases')
            .update(updateFields)
            .eq('id', existing.id)
            .select()
            .single();

          if (updateErr && isMissingColumnError(updateErr, 'owner_user_id')) {
            delete updateFields.owner_user_id;
            const retry = await supabase.from('event_showcases').update(updateFields).eq('id', existing.id).select().single();
            updateData = retry.data;
            updateErr = retry.error;
          }

          if (updateErr) {
            console.error('[Showcase Publish] direct update error:', updateErr);
            if (!isLocalFallbackAllowed(env)) {
              const dbErr = new Error(`Database error updating showcase: ${updateErr.message}`);
              (dbErr as any).code = updateErr.code;
              (dbErr as any).details = updateErr.details;
              throw dbErr;
            }
          } else if (updateData) {
            savedRecord = updateData as EventShowcaseRecord;
          }
        } else {
          // Create brand new showcase with PUBLISHED status
          let ownerUserId = updates?.owner_user_id || null;
          if (!ownerUserId) {
            const org = await getOrganizationById(event.organization_id, env);
            ownerUserId = org?.owner_id || null;
          }

          const insertFields: Record<string, any> = {
            id: crypto.randomUUID(),
            event_id: eventId,
            organization_id: event.organization_id,
            game_id: isUUID(resolvedGameId) ? resolvedGameId : null,
            owner_user_id: isUUID(ownerUserId) ? ownerUserId : null,
            created_by: isUUID(ownerUserId) ? ownerUserId : null,
            title: titleToUse,
            description: updates?.description !== undefined ? (updates.description !== null ? updates.description.trim() : null) : null,
            client_name: updates?.client_name !== undefined ? (updates.client_name !== null ? updates.client_name.trim() : null) : null,
            client_logo_url: updates?.client_logo_url !== undefined ? (updates.client_logo_url !== null ? updates.client_logo_url.trim() : null) : null,
            cover_image_url: updates?.cover_image_url !== undefined ? (updates.cover_image_url !== null ? updates.cover_image_url.trim() : null) : null,
            status: 'PUBLISHED',
            publication_status: 'PUBLISHED',
            review_status: 'DRAFT',
            reward_review_status: 'NOT_ELIGIBLE',
            reward_status: 'PENDING',
            published_at: now,
            created_at: now,
            updated_at: now,
          };

          let { data: insertData, error: insertErr } = await supabase
            .from('event_showcases')
            .insert(insertFields)
            .select()
            .single();

          if (insertErr && (insertErr.code === '23502' || String(insertErr.message || '').includes('game_id')) && !insertFields.game_id) {
            try {
              const { data: sysGame } = await supabase.from('games').select('id').eq('is_system', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
              if (sysGame?.id) {
                insertFields.game_id = sysGame.id;
                const retry = await supabase.from('event_showcases').insert(insertFields).select().single();
                insertData = retry.data;
                insertErr = retry.error;
              }
            } catch {}
          }

          if (insertErr && isMissingColumnError(insertErr, 'game_id')) {
            delete insertFields.game_id;
            const retry = await supabase.from('event_showcases').insert(insertFields).select().single();
            insertData = retry.data;
            insertErr = retry.error;
          }

          if (insertErr && isMissingColumnError(insertErr, 'created_by')) {
            delete insertFields.created_by;
            const retry = await supabase.from('event_showcases').insert(insertFields).select().single();
            insertData = retry.data;
            insertErr = retry.error;
          }

          if (insertErr && isMissingColumnError(insertErr, 'owner_user_id')) {
            delete insertFields.owner_user_id;
            const retry = await supabase.from('event_showcases').insert(insertFields).select().single();
            insertData = retry.data;
            insertErr = retry.error;
          }
          if (insertErr && isMissingColumnError(insertErr, 'reward_review_status')) {
            delete insertFields.reward_review_status;
            const retry = await supabase.from('event_showcases').insert(insertFields).select().single();
            insertData = retry.data;
            insertErr = retry.error;
          }

          if (insertErr) {
            // If collision with concurrent insert, fetch existing and update
            if (insertErr.code === '23505' || String(insertErr.message || '').includes('duplicate key') || String(insertErr.message || '').includes('unique')) {
              console.log('[Showcase Publish] unique collision on insert, recovering by updating existing row');
              const freshlyFound = await getShowcaseByEventId(eventId, env);
              if (freshlyFound) {
                const retryUpdateFields: Record<string, any> = {
                  title: titleToUse,
                  status: 'PUBLISHED',
                  publication_status: 'PUBLISHED',
                  published_at: freshlyFound.published_at || now,
                  updated_at: now,
                };
                if (updates?.description !== undefined) {
                  retryUpdateFields.description = updates.description !== null ? updates.description.trim() : null;
                }
                if (updates?.client_name !== undefined) {
                  retryUpdateFields.client_name = updates.client_name !== null ? updates.client_name.trim() : null;
                }
                if (updates?.client_logo_url !== undefined) {
                  retryUpdateFields.client_logo_url = updates.client_logo_url !== null ? updates.client_logo_url.trim() : null;
                }
                if (updates?.cover_image_url !== undefined) {
                  retryUpdateFields.cover_image_url = updates.cover_image_url !== null ? updates.cover_image_url.trim() : null;
                }
                const { data: retryData, error: retryErr } = await supabase
                  .from('event_showcases')
                  .update(retryUpdateFields)
                  .eq('id', freshlyFound.id)
                  .select()
                  .single();

                if (!retryErr && retryData) {
                  savedRecord = retryData as EventShowcaseRecord;
                } else if (retryErr && !isLocalFallbackAllowed(env)) {
                  throw retryErr;
                }
              }
            } else if (!isLocalFallbackAllowed(env)) {
              console.error('[Showcase Publish] direct insert error:', insertErr);
              const dbErr = new Error(`Database error creating showcase: ${insertErr.message}`);
              (dbErr as any).code = insertErr.code;
              (dbErr as any).details = insertErr.details;
              throw dbErr;
            }
          } else if (insertData) {
            savedRecord = insertData as EventShowcaseRecord;
          }
        }

        if (savedRecord) {
          if (isLocalFallbackAllowed(env)) {
            localShowcasesCache.set(eventId, savedRecord);
            saveLocalShowcases(env);
          }
          await notifyShowcaseEvent('SHOWCASE_PUBLISHED', savedRecord, env).catch((notifyErr) => {
            console.warn('Failed to send showcase published notification:', notifyErr);
          });
          return savedRecord;
        }
      } catch (directErr: any) {
        if (
          directErr.status ||
          directErr.code === 'SHOWCASE_BLOCKED' ||
          directErr.code === 'EVENT_NOT_FOUND' ||
          directErr.code === 'EVENT_UNPAID' ||
          directErr.code === 'SHOWCASE_NOT_ELIGIBLE' ||
          directErr.code === 'SHOWCASE_DELETED'
        ) {
          throw directErr;
        }
        if (!isLocalFallbackAllowed(env)) {
          throw directErr;
        }
      }
    }
  }

  // Fallback path: In-process execution (for local development and mock unit testing ONLY)
  const now = new Date().toISOString();
  let result: EventShowcaseRecord;
  if (existing) {
    result = {
      ...existing,
      title: titleToUse,
      description: updates?.description !== undefined ? (updates.description ? updates.description.trim() : null) : existing.description,
      client_name: updates?.client_name !== undefined ? (updates.client_name ? updates.client_name.trim() : null) : existing.client_name,
      client_logo_url: updates?.client_logo_url !== undefined ? (updates.client_logo_url ? updates.client_logo_url.trim() : null) : existing.client_logo_url,
      cover_image_url: updates?.cover_image_url !== undefined ? (updates.cover_image_url ? updates.cover_image_url.trim() : null) : existing.cover_image_url,
      status: 'PUBLISHED',
      publication_status: 'PUBLISHED',
      published_at: existing.published_at || now,
      updated_at: now,
    };
    localShowcasesCache.set(eventId, result);
    saveLocalShowcases(env);
    await notifyShowcaseEvent('SHOWCASE_PUBLISHED', result, env).catch(() => {});
  } else {
    const org = await getOrganizationById(event.organization_id, env);
    const owner_user_id = updates?.owner_user_id || org?.owner_id || null;
    result = {
      id: crypto.randomUUID(),
      event_id: event.id,
      organization_id: event.organization_id,
      owner_user_id: isUUID(owner_user_id) ? owner_user_id : null,
      created_by: isUUID(owner_user_id) ? owner_user_id : null,
      title: titleToUse,
      description: updates?.description !== undefined ? (updates.description ? updates.description.trim() : null) : null,
      client_name: updates?.client_name !== undefined ? (updates.client_name ? updates.client_name.trim() : null) : null,
      client_logo_url: updates?.client_logo_url !== undefined ? (updates.client_logo_url ? updates.client_logo_url.trim() : null) : null,
      cover_image_url: updates?.cover_image_url !== undefined ? (updates.cover_image_url ? updates.cover_image_url.trim() : null) : null,
      status: 'PUBLISHED',
      review_status: 'DRAFT',
      publication_status: 'PUBLISHED',
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
      published_at: now,
      created_at: now,
      updated_at: now,
    };
    localShowcasesCache.set(eventId, result);
    saveLocalShowcases(env);
    await notifyShowcaseEvent('SHOWCASE_PUBLISHED', result, env).catch(() => {});
  }

  console.log(`[Showcase Publish] showcase ID: ${result.id}`);
  console.log(`[Showcase Publish] publish/update result: status=${result.status}, publication_status=${result.publication_status}, event_id=${result.event_id}`);

  return result;
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

  const res = await updateShowcase(
    eventId,
    {
      status: 'UNPUBLISHED',
      publication_status: 'UNPUBLISHED',
    },
    env
  );
  await notifyShowcaseEvent('SHOWCASE_UNPUBLISHED', res, env).catch(() => {});
  return res;
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
    if (isSupabaseConfigured(env)) {
      const supabase = getSupabaseServerClient(env);
      const { error: rpcError } = await supabase.rpc('delete_event_showcase_atomic', {
        p_event_id: eventId,
      });
      if (rpcError) {
        const { error: deleteError } = await supabase.from('event_showcases').delete().eq('event_id', eventId);
        if (deleteError && !isLocalFallbackAllowed(env)) {
          throw new Error(`Database error deleting showcase: ${deleteError.message}`);
        }
      }
    }

    localShowcasesCache.delete(eventId);
    saveLocalShowcases(env);
    return true;
  } catch (err: any) {
    if (!isLocalFallbackAllowed(env)) {
      throw err;
    }
    console.warn('Error deleting showcase from Supabase:', err.message);
    localShowcasesCache.delete(eventId);
    saveLocalShowcases(env);
    return true;
  }
}


