import { getSupabaseServerClient } from '../supabase.js';
import { EventShowcaseRecord, ShowcaseStatus } from './types.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Local storage fallback path for environments where Supabase migration is not yet run
const LOCAL_SHOWCASES_FILE = path.join(process.cwd(), 'uploads', 'showcases.json');

// In-memory cache for fast reads and reliable fallback
const localShowcasesCache = new Map<string, EventShowcaseRecord>();

function loadLocalShowcases(): void {
  try {
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

function saveLocalShowcases(): void {
  try {
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
      // If table does not exist or network issue, fallback to local cache
      console.warn(`Notice from Supabase query for event_showcases (${error.message}). Checking local fallback store.`);
      return localShowcasesCache.get(eventId) || null;
    }

    if (data) {
      const record = data as EventShowcaseRecord;
      localShowcasesCache.set(eventId, record);
      return record;
    }

    return null;
  } catch (err) {
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
      console.warn(`Notice from Supabase query for event_showcase id (${error.message}). Checking local fallback store.`);
      for (const item of localShowcasesCache.values()) {
        if (item.id === showcaseId) return item;
      }
      return null;
    }

    if (data) {
      const record = data as EventShowcaseRecord;
      localShowcasesCache.set(record.event_id, record);
      return record;
    }

    return null;
  } catch (err) {
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
      console.warn(`Notice from Supabase query for event_showcases by org (${error.message}). Checking local fallback store.`);
      return Array.from(localShowcasesCache.values()).filter(
        (sc) => sc.organization_id === organizationId
      );
    }

    const list = (data || []) as EventShowcaseRecord[];
    for (const item of list) {
      localShowcasesCache.set(item.event_id, item);
    }
    return list;
  } catch (err) {
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
      console.warn('Notice inserting into Supabase event_showcases:', error.message);
      // Save to local cache & file
      localShowcasesCache.set(params.event_id, record);
      saveLocalShowcases();
      return record;
    }

    const saved = data as EventShowcaseRecord;
    localShowcasesCache.set(params.event_id, saved);
    saveLocalShowcases();
    return saved;
  } catch (err) {
    console.warn('Error saving showcase to Supabase, falling back to local file store:', err);
    localShowcasesCache.set(params.event_id, record);
    saveLocalShowcases();
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

  if (updates.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
    nextPublishedAt = now;
  }

  const updatedRecord: EventShowcaseRecord = {
    ...existing,
    title: updates.title !== undefined ? updates.title.trim() : existing.title,
    description: updates.description !== undefined ? (updates.description ? updates.description.trim() : null) : existing.description,
    client_name: updates.client_name !== undefined ? (updates.client_name ? updates.client_name.trim() : null) : existing.client_name,
    client_logo_url: updates.client_logo_url !== undefined ? (updates.client_logo_url ? updates.client_logo_url.trim() : null) : existing.client_logo_url,
    cover_image_url: updates.cover_image_url !== undefined ? (updates.cover_image_url ? updates.cover_image_url.trim() : null) : existing.cover_image_url,
    status: updates.status !== undefined ? updates.status : existing.status,
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
        published_at: updatedRecord.published_at,
        updated_at: now,
      })
      .eq('event_id', eventId)
      .select()
      .single();

    if (error) {
      console.warn('Notice updating Supabase event_showcases:', error.message);
      localShowcasesCache.set(eventId, updatedRecord);
      saveLocalShowcases();
      return updatedRecord;
    }

    const saved = data as EventShowcaseRecord;
    localShowcasesCache.set(eventId, saved);
    saveLocalShowcases();
    return saved;
  } catch (err) {
    console.warn('Error updating showcase in Supabase, using local fallback:', err);
    localShowcasesCache.set(eventId, updatedRecord);
    saveLocalShowcases();
    return updatedRecord;
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

  const now = new Date().toISOString();
  return await updateShowcase(
    eventId,
    {
      status: 'PUBLISHED',
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
    },
    env
  );
}
