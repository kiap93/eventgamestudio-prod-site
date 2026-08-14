import { getSupabaseServerClient } from '../supabase.js';
import { EventRecord, EventStatus, EventWithDetails, GameThemeRecord, GameRecord } from './types.js';
import { getThemeById } from './themes.js';
import { getGameById } from './games.js';
import crypto from 'node:crypto';

/**
 * Calculates current real-time status of an event based on time windows.
 */
export function calculateEventStatus(event: {
  status: EventStatus;
  starts_at: string;
  expires_at: string;
}): EventStatus {
  if (event.status === 'cancelled') return 'cancelled';
  if (event.status === 'draft') return 'draft';

  const now = new Date().getTime();
  const startsAt = new Date(event.starts_at).getTime();
  const expiresAt = new Date(event.expires_at).getTime();

  if (now < startsAt) {
    return 'scheduled';
  }
  if (now >= expiresAt) {
    return 'expired';
  }
  return 'live';
}

/**
 * Generate a short, unique, user-friendly alphanumeric token for public event links (e.g. 7KQ2M9X)
 */
export function generatePublicToken(length: number = 7): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // base32 without ambiguous 0/O/1/I
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * List all events for an organization, enriched with theme, game, and calculated status.
 */
export async function getEventsByOrgId(
  organizationId: string,
  env?: Record<string, any>
): Promise<EventWithDetails[]> {
  const supabase = getSupabaseServerClient(env);

  const { data: eventsData, error: eventsError } = await supabase
    .from('events')
    .select('*')
    .eq('organization_id', organizationId)
    .order('starts_at', { ascending: false });

  if (eventsError) {
    console.error('Error in getEventsByOrgId:', eventsError);
    throw new Error(`Failed to list events: ${eventsError.message}`);
  }

  const events = (eventsData || []) as EventRecord[];
  if (events.length === 0) return [];

  // Fetch related game themes and games to enrich event list
  const themeIds = Array.from(new Set(events.map((e) => e.game_theme_id).filter(Boolean)));
  const { data: themesData } = await supabase
    .from('game_themes')
    .select('*, games(id, name, slug, game_type)')
    .in('id', themeIds);

  const themesMap = new Map<string, any>();
  if (themesData) {
    for (const t of themesData) {
      themesMap.set(t.id, t);
    }
  }

  return events.map((event) => {
    const theme = themesMap.get(event.game_theme_id) || null;
    const game = theme?.games || null;
    const calculated = calculateEventStatus(event);

    return {
      ...event,
      calculated_status: calculated,
      game_theme: theme,
      game: game
        ? {
            id: game.id,
            name: game.name,
            slug: game.slug,
            game_type: game.game_type || 'catch-brand',
          }
        : null,
    };
  });
}

/**
 * Get single event by ID with full details.
 */
export async function getEventById(
  eventId: string,
  env?: Record<string, any>
): Promise<EventWithDetails | null> {
  const supabase = getSupabaseServerClient(env);

  const { data: event, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();

  if (error) {
    console.error('Error in getEventById:', error);
    throw new Error(`Failed to get event: ${error.message}`);
  }

  if (!event) return null;

  const eventRecord = event as EventRecord;
  let theme: GameThemeRecord | null = null;
  let game: GameRecord | null = null;

  if (eventRecord.game_theme_id) {
    theme = await getThemeById(eventRecord.game_theme_id, env);
    if (theme && theme.game_id) {
      game = await getGameById(theme.game_id, env);
    }
  }

  return {
    ...eventRecord,
    calculated_status: calculateEventStatus(eventRecord),
    game_theme: theme,
    game: game
      ? {
          id: game.id,
          name: game.name,
          slug: game.slug,
          game_type: game.game_type || 'catch-brand',
        }
      : null,
  };
}

/**
 * Public resolution endpoint: Get event by public token (no login required).
 */
export async function getEventByPublicToken(
  publicToken: string,
  env?: Record<string, any>
): Promise<EventWithDetails | null> {
  const supabase = getSupabaseServerClient(env);

  const { data: event, error } = await supabase
    .from('events')
    .select('*')
    .eq('public_token', publicToken.trim().toUpperCase())
    .maybeSingle();

  if (error) {
    console.error('Error in getEventByPublicToken:', error);
    throw new Error(`Failed to get public event: ${error.message}`);
  }

  if (!event) return null;

  const eventRecord = event as EventRecord;
  const theme = await getThemeById(eventRecord.game_theme_id, env);

  let game: GameRecord | null = null;
  if (theme?.game_id) {
    game = await getGameById(theme.game_id, env);
  }

  // Also fetch organization details
  let orgName = 'Studio';
  let orgSlug = 'studio';
  const { data: orgData } = await supabase
    .from('organizations')
    .select('name, slug')
    .eq('id', eventRecord.organization_id)
    .maybeSingle();

  if (orgData) {
    orgName = orgData.name;
    orgSlug = orgData.slug;
  }

  return {
    ...eventRecord,
    calculated_status: calculateEventStatus(eventRecord),
    game_theme: theme,
    game: game
      ? {
          id: game.id,
          name: game.name,
          slug: game.slug,
          game_type: game.game_type || 'catch-brand',
        }
      : null,
    organization_name: orgName,
    organization_slug: orgSlug,
  };
}

/**
 * Create a new Event.
 * Verifies that the referenced Game Theme belongs to the same Organization.
 */
export async function createEvent(
  params: {
    organization_id: string;
    game_theme_id: string;
    name: string;
    event_date?: string | null;
    starts_at: string;
    expires_at: string;
    status?: EventStatus;
    created_by?: string | null;
  },
  env?: Record<string, any>
): Promise<EventRecord> {
  const supabase = getSupabaseServerClient(env);

  // 1. Verify organization isolation: The theme must belong to this organization!
  const theme = await getThemeById(params.game_theme_id, env);
  if (!theme) {
    throw new Error('Selected Game Theme not found');
  }

  if (theme.organization_id !== params.organization_id) {
    throw new Error('Security Error: Game Theme does not belong to your organization');
  }

  // 2. Validate time boundaries
  const startsAtTime = new Date(params.starts_at).getTime();
  const expiresAtTime = new Date(params.expires_at).getTime();

  if (isNaN(startsAtTime) || isNaN(expiresAtTime)) {
    throw new Error('Invalid start or expiry date/time');
  }

  if (expiresAtTime <= startsAtTime) {
    throw new Error('Expiry time must be later than start time');
  }

  // 3. Generate collision-resistant unique token
  let token = generatePublicToken();
  let attempts = 0;
  while (attempts < 5) {
    const { data: existing } = await supabase
      .from('events')
      .select('id')
      .eq('public_token', token)
      .maybeSingle();

    if (!existing) break;
    token = generatePublicToken();
    attempts++;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const initialStatus = params.status || 'scheduled';

  const { data, error } = await supabase
    .from('events')
    .insert({
      id,
      organization_id: params.organization_id,
      game_theme_id: params.game_theme_id,
      name: params.name.trim(),
      event_date: params.event_date || params.starts_at.split('T')[0],
      starts_at: new Date(params.starts_at).toISOString(),
      expires_at: new Date(params.expires_at).toISOString(),
      status: initialStatus,
      public_token: token,
      created_by: params.created_by || null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    console.error('Error in createEvent:', error);
    throw new Error(`Failed to create event: ${error.message}`);
  }

  return data as EventRecord;
}

/**
 * Update an existing Event.
 * If game_theme_id is changed, validates that the new theme belongs to the event's organization.
 * Note: Keeps the original public_token intact!
 */
export async function updateEvent(
  eventId: string,
  updates: {
    name?: string;
    game_theme_id?: string;
    event_date?: string | null;
    starts_at?: string;
    expires_at?: string;
    status?: EventStatus;
  },
  env?: Record<string, any>
): Promise<EventRecord> {
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  // 1. Fetch current event
  const existing = await getEventById(eventId, env);
  if (!existing) {
    throw new Error('Event not found');
  }

  const payload: any = {
    updated_at: now,
  };

  if (updates.name !== undefined) {
    payload.name = updates.name.trim();
  }

  if (updates.event_date !== undefined) {
    payload.event_date = updates.event_date;
  }

  if (updates.starts_at !== undefined) {
    payload.starts_at = new Date(updates.starts_at).toISOString();
  }

  if (updates.expires_at !== undefined) {
    payload.expires_at = new Date(updates.expires_at).toISOString();
  }

  if (updates.status !== undefined) {
    payload.status = updates.status;
  }

  // 2. If changing theme, verify organizational isolation
  if (updates.game_theme_id !== undefined && updates.game_theme_id !== existing.game_theme_id) {
    const newTheme = await getThemeById(updates.game_theme_id, env);
    if (!newTheme) {
      throw new Error('New Game Theme not found');
    }
    if (newTheme.organization_id !== existing.organization_id) {
      throw new Error('Security Error: Game Theme belongs to another organization');
    }
    payload.game_theme_id = updates.game_theme_id;
  }

  // 3. Validate times if both are present or one changed
  const finalStarts = payload.starts_at || existing.starts_at;
  const finalExpires = payload.expires_at || existing.expires_at;
  if (new Date(finalExpires).getTime() <= new Date(finalStarts).getTime()) {
    throw new Error('Expiry time must be later than start time');
  }

  const { data, error } = await supabase
    .from('events')
    .update(payload)
    .eq('id', eventId)
    .select()
    .single();

  if (error) {
    console.error('Error in updateEvent:', error);
    throw new Error(`Failed to update event: ${error.message}`);
  }

  return data as EventRecord;
}

/**
 * Cancel an event (sets status to 'cancelled')
 */
export async function cancelEvent(eventId: string, env?: Record<string, any>): Promise<EventRecord> {
  return await updateEvent(eventId, { status: 'cancelled' }, env);
}

/**
 * Delete an event from database
 */
export async function deleteEvent(eventId: string, env?: Record<string, any>): Promise<void> {
  const supabase = getSupabaseServerClient(env);
  const { error } = await supabase.from('events').delete().eq('id', eventId);

  if (error) {
    console.error('Error in deleteEvent:', error);
    throw new Error(`Failed to delete event: ${error.message}`);
  }
}
