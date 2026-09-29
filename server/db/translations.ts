/**
 * Translations Database Access Layer
 * Supports Event & Showcase User-Generated Content Translations and Asynchronous Translation Jobs
 */

import { getSupabaseServerClient, isLocalFallbackAllowed, isSupabaseConfigured } from '../supabase.js';

export interface EventTranslationRecord {
  id: string;
  event_id: string;
  language_code: string;
  title: string;
  description?: string | null;
  game_instructions?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShowcaseTranslationRecord {
  id: string;
  showcase_id: string;
  language_code: string;
  title: string;
  description?: string | null;
  cta_text?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TranslationJobRecord {
  id: string;
  entity_type: 'event' | 'showcase' | 'game_instructions';
  entity_id: string;
  source_language: string;
  target_language: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  provider: string;
  error?: string | null;
  result?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

// In-memory cache for tests and local fallback environments
export const localEventTranslationsCache = new Map<string, EventTranslationRecord>();
export const localShowcaseTranslationsCache = new Map<string, ShowcaseTranslationRecord>();
export const localTranslationJobsCache = new Map<string, TranslationJobRecord>();

function getEventTranslationKey(eventId: string, lang: string): string {
  return `${eventId}:${lang.toLowerCase()}`;
}

function getShowcaseTranslationKey(showcaseId: string, lang: string): string {
  return `${showcaseId}:${lang.toLowerCase()}`;
}

// ============================================================================
// EVENT TRANSLATIONS
// ============================================================================

export async function getEventTranslations(eventId: string): Promise<EventTranslationRecord[]> {
  if (!eventId) return [];

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase
        .from('event_translations')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (data && data.length > 0) {
        // Sync local cache
        for (const item of data) {
          localEventTranslationsCache.set(getEventTranslationKey(eventId, item.language_code), item);
        }
        return data as EventTranslationRecord[];
      }
    } catch (err) {
      if (!isLocalFallbackAllowed()) throw err;
    }
  }

  // Local fallback
  const results: EventTranslationRecord[] = [];
  for (const item of localEventTranslationsCache.values()) {
    if (item.event_id === eventId) {
      results.push(item);
    }
  }
  return results;
}

export async function getEventTranslation(
  eventId: string,
  languageCode: string
): Promise<EventTranslationRecord | null> {
  if (!eventId || !languageCode) return null;

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase
        .from('event_translations')
        .select('*')
        .eq('event_id', eventId)
        .eq('language_code', languageCode)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        localEventTranslationsCache.set(getEventTranslationKey(eventId, languageCode), data);
        return data as EventTranslationRecord;
      }
    } catch (err) {
      if (!isLocalFallbackAllowed()) throw err;
    }
  }

  return localEventTranslationsCache.get(getEventTranslationKey(eventId, languageCode)) || null;
}

export async function upsertEventTranslation(
  eventId: string,
  languageCode: string,
  fields: {
    title: string;
    description?: string | null;
    game_instructions?: string | null;
  }
): Promise<EventTranslationRecord> {
  const now = new Date().toISOString();
  const payload = {
    event_id: eventId,
    language_code: languageCode,
    title: fields.title.trim(),
    description: fields.description !== undefined ? fields.description : null,
    game_instructions: fields.game_instructions !== undefined ? fields.game_instructions : null,
    updated_at: now,
  };

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase
        .from('event_translations')
        .upsert(payload, { onConflict: 'event_id,language_code' })
        .select()
        .single();

      if (error) throw error;
      localEventTranslationsCache.set(getEventTranslationKey(eventId, languageCode), data);
      return data as EventTranslationRecord;
    } catch (err) {
      if (!isLocalFallbackAllowed()) throw err;
    }
  }

  const existing = localEventTranslationsCache.get(getEventTranslationKey(eventId, languageCode));
  const record: EventTranslationRecord = {
    id: existing?.id || `trans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    ...payload,
    created_at: existing?.created_at || now,
  };
  localEventTranslationsCache.set(getEventTranslationKey(eventId, languageCode), record);
  return record;
}

export async function deleteEventTranslation(
  eventId: string,
  languageCode: string
): Promise<boolean> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseServerClient();
      const { error } = await supabase
        .from('event_translations')
        .delete()
        .eq('event_id', eventId)
        .eq('language_code', languageCode);

      if (error) throw error;
    } catch (err) {
      if (!isLocalFallbackAllowed()) throw err;
    }
  }

  localEventTranslationsCache.delete(getEventTranslationKey(eventId, languageCode));
  return true;
}

// ============================================================================
// SHOWCASE TRANSLATIONS
// ============================================================================

export async function getShowcaseTranslations(showcaseId: string): Promise<ShowcaseTranslationRecord[]> {
  if (!showcaseId) return [];

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase
        .from('showcase_translations')
        .select('*')
        .eq('showcase_id', showcaseId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (data && data.length > 0) {
        for (const item of data) {
          localShowcaseTranslationsCache.set(getShowcaseTranslationKey(showcaseId, item.language_code), item);
        }
        return data as ShowcaseTranslationRecord[];
      }
    } catch (err) {
      if (!isLocalFallbackAllowed()) throw err;
    }
  }

  const results: ShowcaseTranslationRecord[] = [];
  for (const item of localShowcaseTranslationsCache.values()) {
    if (item.showcase_id === showcaseId) {
      results.push(item);
    }
  }
  return results;
}

export async function upsertShowcaseTranslation(
  showcaseId: string,
  languageCode: string,
  fields: {
    title: string;
    description?: string | null;
    cta_text?: string | null;
  }
): Promise<ShowcaseTranslationRecord> {
  const now = new Date().toISOString();
  const payload = {
    showcase_id: showcaseId,
    language_code: languageCode,
    title: fields.title.trim(),
    description: fields.description !== undefined ? fields.description : null,
    cta_text: fields.cta_text !== undefined ? fields.cta_text : null,
    updated_at: now,
  };

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase
        .from('showcase_translations')
        .upsert(payload, { onConflict: 'showcase_id,language_code' })
        .select()
        .single();

      if (error) throw error;
      localShowcaseTranslationsCache.set(getShowcaseTranslationKey(showcaseId, languageCode), data);
      return data as ShowcaseTranslationRecord;
    } catch (err) {
      if (!isLocalFallbackAllowed()) throw err;
    }
  }

  const existing = localShowcaseTranslationsCache.get(getShowcaseTranslationKey(showcaseId, languageCode));
  const record: ShowcaseTranslationRecord = {
    id: existing?.id || `strans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    ...payload,
    created_at: existing?.created_at || now,
  };
  localShowcaseTranslationsCache.set(getShowcaseTranslationKey(showcaseId, languageCode), record);
  return record;
}

// ============================================================================
// TRANSLATION JOBS
// ============================================================================

export async function createTranslationJob(params: {
  entity_type: 'event' | 'showcase' | 'game_instructions';
  entity_id: string;
  source_language: string;
  target_language: string;
  provider?: string;
}): Promise<TranslationJobRecord> {
  const now = new Date().toISOString();
  const payload = {
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    source_language: params.source_language,
    target_language: params.target_language,
    status: 'PENDING' as const,
    provider: params.provider || 'gemini',
    created_at: now,
    updated_at: now,
  };

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase
        .from('translation_jobs')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      localTranslationJobsCache.set(data.id, data);
      return data as TranslationJobRecord;
    } catch (err) {
      if (!isLocalFallbackAllowed()) throw err;
    }
  }

  const record: TranslationJobRecord = {
    id: `tjob_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    ...payload,
  };
  localTranslationJobsCache.set(record.id, record);
  return record;
}

export async function updateTranslationJob(
  jobId: string,
  update: {
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    error?: string | null;
    result?: Record<string, any> | null;
    completed_at?: string | null;
  }
): Promise<TranslationJobRecord | null> {
  const now = new Date().toISOString();
  const payload = {
    ...update,
    updated_at: now,
  };

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase
        .from('translation_jobs')
        .update(payload)
        .eq('id', jobId)
        .select()
        .single();

      if (error) throw error;
      localTranslationJobsCache.set(jobId, data);
      return data as TranslationJobRecord;
    } catch (err) {
      if (!isLocalFallbackAllowed()) throw err;
    }
  }

  const existing = localTranslationJobsCache.get(jobId);
  if (!existing) return null;
  const updated: TranslationJobRecord = {
    ...existing,
    ...payload,
  };
  localTranslationJobsCache.set(jobId, updated);
  return updated;
}

export async function getTranslationJob(jobId: string): Promise<TranslationJobRecord | null> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase
        .from('translation_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        localTranslationJobsCache.set(jobId, data);
        return data as TranslationJobRecord;
      }
    } catch (err) {
      if (!isLocalFallbackAllowed()) throw err;
    }
  }

  return localTranslationJobsCache.get(jobId) || null;
}

/**
 * Convenient object-parameter helper for saving event translations.
 */
export async function saveEventTranslation(args: {
  eventId: string;
  languageCode: string;
  title: string;
  description?: string | null;
  gameInstructions?: string | null;
  sourceLanguage?: string;
}): Promise<EventTranslationRecord> {
  return upsertEventTranslation(args.eventId, args.languageCode, {
    title: args.title,
    description: args.description,
    game_instructions: args.gameInstructions,
  });
}

export const getEventTranslationByLanguage = getEventTranslation;

/**
 * Convenient object-parameter helper for saving showcase translations.
 */
export async function saveShowcaseTranslation(args: {
  showcaseId: string;
  languageCode: string;
  title: string;
  description?: string | null;
  ctaText?: string | null;
  sourceLanguage?: string;
}): Promise<ShowcaseTranslationRecord> {
  return upsertShowcaseTranslation(args.showcaseId, args.languageCode, {
    title: args.title,
    description: args.description,
    cta_text: args.ctaText,
  });
}
