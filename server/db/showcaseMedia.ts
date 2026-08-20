import { getSupabaseServerClient } from '../supabase.js';
import { EventShowcaseMediaRecord, ShowcaseMediaType } from './types.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const uploadsDir = path.join(process.cwd(), 'uploads');
const LOCAL_MEDIA_FILE = path.join(uploadsDir, 'showcase_media.json');

function ensureUploadsDir() {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

function readLocalMedia(): EventShowcaseMediaRecord[] {
  try {
    ensureUploadsDir();
    if (!fs.existsSync(LOCAL_MEDIA_FILE)) {
      return [];
    }
    const data = fs.readFileSync(LOCAL_MEDIA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading local showcase media fallback:', err);
    return [];
  }
}

function writeLocalMedia(mediaList: EventShowcaseMediaRecord[]) {
  try {
    ensureUploadsDir();
    fs.writeFileSync(LOCAL_MEDIA_FILE, JSON.stringify(mediaList, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing local showcase media fallback:', err);
  }
}

/**
 * List all media records for a given showcase, sorted by sort_order ASC
 */
export async function getShowcaseMedia(
  showcaseId: string,
  orgId?: string,
  env?: Record<string, any>
): Promise<EventShowcaseMediaRecord[]> {
  const supabase = getSupabaseServerClient(env);

  try {
    let query = supabase
      .from('event_showcase_media')
      .select('*')
      .eq('showcase_id', showcaseId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('Supabase getShowcaseMedia query error, checking local fallback:', error.message);
      const localList = readLocalMedia().filter(
        (m) => m.showcase_id === showcaseId && (!orgId || m.organization_id === orgId)
      );
      return localList.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }

    return (data || []) as EventShowcaseMediaRecord[];
  } catch (err: any) {
    console.warn('getShowcaseMedia exception, returning local fallback:', err.message);
    const localList = readLocalMedia().filter(
      (m) => m.showcase_id === showcaseId && (!orgId || m.organization_id === orgId)
    );
    return localList.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }
}

/**
 * Get a single media item by ID
 */
export async function getShowcaseMediaById(
  mediaId: string,
  env?: Record<string, any>
): Promise<EventShowcaseMediaRecord | null> {
  const supabase = getSupabaseServerClient(env);

  try {
    const { data, error } = await supabase
      .from('event_showcase_media')
      .select('*')
      .eq('id', mediaId)
      .maybeSingle();

    if (error) {
      console.warn('Supabase getShowcaseMediaById query error, checking local fallback:', error.message);
      const localList = readLocalMedia();
      return localList.find((m) => m.id === mediaId) || null;
    }

    if (data) return data as EventShowcaseMediaRecord;

    const localList = readLocalMedia();
    return localList.find((m) => m.id === mediaId) || null;
  } catch (err: any) {
    console.warn('getShowcaseMediaById exception, checking local fallback:', err.message);
    const localList = readLocalMedia();
    return localList.find((m) => m.id === mediaId) || null;
  }
}

/**
 * Insert a new showcase media record
 */
export async function createShowcaseMedia(
  params: {
    showcase_id: string;
    organization_id: string;
    media_type: ShowcaseMediaType;
    media_url: string;
    thumbnail_url?: string | null;
    file_name: string;
    file_size: number;
    mime_type: string;
    sort_order?: number;
  },
  env?: Record<string, any>
): Promise<EventShowcaseMediaRecord> {
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  // If sort_order not provided, compute highest + 1
  let sortOrder = params.sort_order;
  if (sortOrder === undefined || sortOrder === null) {
    const existing = await getShowcaseMedia(params.showcase_id, params.organization_id, env);
    const maxOrder = existing.reduce((max, item) => Math.max(max, item.sort_order ?? 0), -1);
    sortOrder = maxOrder + 1;
  }

  const record: EventShowcaseMediaRecord = {
    id,
    showcase_id: params.showcase_id,
    organization_id: params.organization_id,
    media_type: params.media_type,
    media_url: params.media_url,
    thumbnail_url: params.thumbnail_url || null,
    file_name: params.file_name,
    file_size: params.file_size,
    mime_type: params.mime_type,
    sort_order: sortOrder,
    created_at: now,
    updated_at: now,
  };

  try {
    const { data, error } = await supabase
      .from('event_showcase_media')
      .insert(record)
      .select()
      .single();

    if (error) {
      console.warn('Supabase createShowcaseMedia error, writing to local fallback:', error.message);
      const localList = readLocalMedia();
      localList.push(record);
      writeLocalMedia(localList);
      return record;
    }

    // Also mirror to local fallback
    const localList = readLocalMedia();
    const idx = localList.findIndex((m) => m.id === id);
    if (idx >= 0) localList[idx] = data as EventShowcaseMediaRecord;
    else localList.push(data as EventShowcaseMediaRecord);
    writeLocalMedia(localList);

    return data as EventShowcaseMediaRecord;
  } catch (err: any) {
    console.warn('createShowcaseMedia exception, writing to local fallback:', err.message);
    const localList = readLocalMedia();
    localList.push(record);
    writeLocalMedia(localList);
    return record;
  }
}

/**
 * Update media details (e.g. thumbnail_url or sort_order)
 */
export async function updateShowcaseMedia(
  mediaId: string,
  updates: Partial<Pick<EventShowcaseMediaRecord, 'thumbnail_url' | 'sort_order' | 'file_name'>>,
  env?: Record<string, any>
): Promise<EventShowcaseMediaRecord | null> {
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  const payload: any = {
    ...updates,
    updated_at: now,
  };

  try {
    const { data, error } = await supabase
      .from('event_showcase_media')
      .update(payload)
      .eq('id', mediaId)
      .select()
      .single();

    if (error) {
      console.warn('Supabase updateShowcaseMedia error, updating local fallback:', error.message);
      const localList = readLocalMedia();
      const idx = localList.findIndex((m) => m.id === mediaId);
      if (idx >= 0) {
        localList[idx] = { ...localList[idx], ...payload };
        writeLocalMedia(localList);
        return localList[idx];
      }
      return null;
    }

    const localList = readLocalMedia();
    const idx = localList.findIndex((m) => m.id === mediaId);
    if (idx >= 0) {
      localList[idx] = data as EventShowcaseMediaRecord;
      writeLocalMedia(localList);
    }

    return data as EventShowcaseMediaRecord;
  } catch (err: any) {
    console.warn('updateShowcaseMedia exception, updating local fallback:', err.message);
    const localList = readLocalMedia();
    const idx = localList.findIndex((m) => m.id === mediaId);
    if (idx >= 0) {
      localList[idx] = { ...localList[idx], ...payload };
      writeLocalMedia(localList);
      return localList[idx];
    }
    return null;
  }
}

/**
 * Reorder multiple media items for a showcase
 */
export async function reorderShowcaseMedia(
  showcaseId: string,
  mediaIds: string[],
  orgId?: string,
  env?: Record<string, any>
): Promise<EventShowcaseMediaRecord[]> {
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  // Update in Supabase
  try {
    for (let index = 0; index < mediaIds.length; index++) {
      const id = mediaIds[index];
      await supabase
        .from('event_showcase_media')
        .update({ sort_order: index, updated_at: now })
        .eq('id', id)
        .eq('showcase_id', showcaseId);
    }
  } catch (err: any) {
    console.warn('Supabase reorderShowcaseMedia error, updating local:', err.message);
  }

  // Update in local fallback
  const localList = readLocalMedia();
  mediaIds.forEach((id, index) => {
    const idx = localList.findIndex((m) => m.id === id && m.showcase_id === showcaseId);
    if (idx >= 0) {
      localList[idx].sort_order = index;
      localList[idx].updated_at = now;
    }
  });
  writeLocalMedia(localList);

  return getShowcaseMedia(showcaseId, orgId, env);
}

/**
 * Delete a media item by ID
 */
export async function deleteShowcaseMedia(
  mediaId: string,
  showcaseId: string,
  orgId: string,
  env?: Record<string, any>
): Promise<boolean> {
  const supabase = getSupabaseServerClient(env);

  try {
    const { error } = await supabase
      .from('event_showcase_media')
      .delete()
      .eq('id', mediaId)
      .eq('showcase_id', showcaseId)
      .eq('organization_id', orgId);

    if (error) {
      console.warn('Supabase deleteShowcaseMedia error, removing from local fallback:', error.message);
    }
  } catch (err: any) {
    console.warn('deleteShowcaseMedia exception:', err.message);
  }

  // Also remove from local fallback
  const localList = readLocalMedia();
  const filtered = localList.filter((m) => m.id !== mediaId);
  writeLocalMedia(filtered);

  return true;
}
