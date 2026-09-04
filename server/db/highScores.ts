import {
  getSupabaseServerClient,
  isLocalFallbackAllowed,
  assertProductionLeaderboardSafe,
  isProductionEnvironment,
} from '../supabase.js';
import {
  EventHighScoreRecord,
  EventLeaderboardEntry,
  EventScoreStats,
  ScoreEnvironment,
  SubmitEventScoreParams,
} from './types.js';
import {
  getEventById,
  getEventByPublicToken,
  isEventPlayable,
  deriveEventLifecycleStatus,
  getNormalizedEventDates,
  getNormalizedCurrentDate,
  isEventBeforeStartDate,
  localEventsCache,
  resolveEventGameType,
  resolveAuthoritativeMemoryMatchConfig,
} from './events.js';
import { isUUID, getThemeById } from './themes.js';
import {
  calculateMemoryMatchScore,
  validateMemoryMatchResult,
  MEMORY_MATCH_GAME_VERSION,
  MEMORY_MATCH_SCORING_VERSION,
} from '../games/memoryMatchScoring.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Local storage fallback file path for mock / test environments
const LOCAL_HIGH_SCORES_FILE = path.join(process.cwd(), 'uploads', 'event_high_scores.json');
const TEST_SCORES_CLEARED_FILE = path.join(process.cwd(), 'uploads', 'event_test_scores_cleared.json');

/**
 * Safe Session ID allowlist regex:
 * Supports:
 * - Catch The Brand generated IDs: cb_[timestamp]_[rand]
 * - Memory Match generated IDs: mm_[timestamp]_[rand]
 * - Standard UUIDs: e.g. 550e8400-e29b-41d4-a716-446655440000
 * - Platform / test tokens: session_[...], test_session_[...], cs_egs_[...]
 *
 * Strictly forbids:
 * - Empty strings and whitespace
 * - Values exceeding 100 characters
 * - Quotes (', ", `)
 * - PostgREST / SQL filter characters (., ,, (, ), :, ;, =, %, etc.)
 * - Any character outside [a-zA-Z0-9_-]
 */
export const SAFE_SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{1,100}$/;

export interface SessionIdValidationResult {
  isValid: boolean;
  error?: string;
  code?: string;
  status?: number;
}

export function checkSessionIdValidity(sessionId: unknown): SessionIdValidationResult {
  if (sessionId === undefined || sessionId === null) {
    return {
      isValid: false,
      error: 'Session ID cannot be empty',
      code: 'INVALID_SESSION_ID',
      status: 422,
    };
  }

  if (typeof sessionId !== 'string') {
    return {
      isValid: false,
      error: 'Session ID must be a string',
      code: 'INVALID_SESSION_ID',
      status: 422,
    };
  }

  const trimmed = sessionId.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      error: 'Session ID cannot be empty',
      code: 'INVALID_SESSION_ID',
      status: 422,
    };
  }

  if (trimmed.length > 100) {
    return {
      isValid: false,
      error: `Session ID is excessively long (${trimmed.length} characters, maximum 100 allowed)`,
      code: 'INVALID_SESSION_ID',
      status: 422,
    };
  }

  if (trimmed.includes("'") || trimmed.includes('"') || trimmed.includes('`')) {
    return {
      isValid: false,
      error: 'Session ID contains invalid characters: quotes are not allowed',
      code: 'INVALID_SESSION_ID',
      status: 422,
    };
  }

  // Filter-expression alteration characters: PostgREST commas, dots, parentheses, semicolons, colons, slashes, operators, spaces
  if (/[,.();:=&%\\/$\s*+~!?^<>{}\[\]|]/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Session ID contains invalid filter-expression characters',
      code: 'INVALID_SESSION_ID',
      status: 422,
    };
  }

  if (!SAFE_SESSION_ID_REGEX.test(trimmed)) {
    return {
      isValid: false,
      error: 'Malformed session ID: only alphanumeric characters, underscores, and hyphens are allowed',
      code: 'INVALID_SESSION_ID',
      status: 422,
    };
  }

  return { isValid: true };
}

export function isValidSessionId(sessionId: unknown): boolean {
  return checkSessionIdValidity(sessionId).isValid;
}

export function validateSessionId(sessionId: unknown, options?: { required?: boolean }): string {
  if (sessionId === undefined) {
    if (options?.required) {
      const err: any = new Error('Session ID cannot be empty');
      err.status = 422;
      err.code = 'INVALID_SESSION_ID';
      throw err;
    }
    return `session_${crypto.randomUUID().replace(/-/g, '')}`;
  }

  const result = checkSessionIdValidity(sessionId);
  if (!result.isValid) {
    const err: any = new Error(result.error);
    err.status = result.status || 422;
    err.code = result.code || 'INVALID_SESSION_ID';
    throw err;
  }

  return (sessionId as string).trim();
}

// In-memory cache for quick access and test fallback: Map<eventId, EventHighScoreRecord[]>
export const localHighScoresCache = new Map<string, EventHighScoreRecord[]>();

// In-flight score submissions promise map to protect concurrent duplicate requests in the same process
const inFlightScoreSubmissions = new Map<string, Promise<any>>();

// Persistent tracking of events that have transitioned to LIVE and had their TEST scores cleared
const testScoresClearedEvents = new Set<string>();

function loadLocalHighScores(env?: Record<string, any>): void {
  // Local JSON/file fallback must NOT be silently used in production.
  if (!isLocalFallbackAllowed(env)) return;
  try {
    if (fs.existsSync(LOCAL_HIGH_SCORES_FILE)) {
      const raw = fs.readFileSync(LOCAL_HIGH_SCORES_FILE, 'utf-8');
      const list = JSON.parse(raw) as EventHighScoreRecord[];
      localHighScoresCache.clear();
      for (const item of list) {
        const existing = localHighScoresCache.get(item.event_id) || [];
        existing.push(item);
        localHighScoresCache.set(item.event_id, existing);
      }
    }
  } catch (err) {
    console.warn('Warning: Could not load local high scores file:', err);
  }
}

function saveLocalHighScores(env?: Record<string, any>): void {
  // Local JSON/file fallback must NOT be silently used in production.
  if (!isLocalFallbackAllowed(env)) return;
  try {
    const list: EventHighScoreRecord[] = [];
    for (const items of localHighScoresCache.values()) {
      list.push(...items);
    }
    const dir = path.dirname(LOCAL_HIGH_SCORES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_HIGH_SCORES_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Warning: Could not save local high scores file:', err);
  }
}

function loadTestScoresCleared(env?: Record<string, any>): void {
  // Local JSON/file fallback must NOT be silently used in production.
  if (!isLocalFallbackAllowed(env)) return;
  try {
    if (fs.existsSync(TEST_SCORES_CLEARED_FILE)) {
      const raw = fs.readFileSync(TEST_SCORES_CLEARED_FILE, 'utf-8');
      const list = JSON.parse(raw) as string[];
      if (Array.isArray(list)) {
        for (const id of list) {
          if (id) testScoresClearedEvents.add(id);
        }
      }
    }
  } catch (err) {
    console.warn('Warning: Could not load test scores cleared file:', err);
  }
}

function saveTestScoresCleared(env?: Record<string, any>): void {
  // Local JSON/file fallback must NOT be silently used in production.
  if (!isLocalFallbackAllowed(env)) return;
  try {
    const dir = path.dirname(TEST_SCORES_CLEARED_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TEST_SCORES_CLEARED_FILE, JSON.stringify(Array.from(testScoresClearedEvents), null, 2), 'utf-8');
  } catch (err) {
    console.warn('Warning: Could not save test scores cleared file:', err);
  }
}

// Initial load only when local fallback is permitted (dev/test sandbox)
if (isLocalFallbackAllowed()) {
  loadLocalHighScores();
  loadTestScoresCleared();
}

/**
 * Determines whether an event is in TEST or LIVE scoring mode.
 * - If current date is before start date (or status is SCHEDULED/DRAFT) -> 'test'
 * - Once current date reaches start date and event is active -> 'live'
 * Server authoritatively determines environment based on event/session context.
 */
export function determineScoreEnvironment(
  event: any,
  now: Date | string = new Date()
): 'test' | 'live' {
  if (!event) return 'live';
  const { startDate } = getNormalizedEventDates(event);
  const curDate = getNormalizedCurrentDate(now);

  // Before the configured start date, the event is strictly in pre-event TEST mode (including Setup Day)
  if (startDate && curDate < startDate) {
    return 'test';
  }

  const rawStatus = (event.status || '').toUpperCase();
  const eventStatus = (event.event_status || '').toUpperCase();
  const isScheduled = rawStatus === 'SCHEDULED' || eventStatus === 'SCHEDULED';

  // An event in SCHEDULED status before its start date is in pre-event TEST mode
  if (isScheduled && (!startDate || curDate < startDate)) {
    return 'test';
  }

  return 'live';
}

/**
 * Clear test scores for an event when it transitions to LIVE mode or reaches its configured start date.
 * - Strictly removes all TEST scores.
 * - Strictly preserves LIVE scores if any already exist.
 * - Idempotent and safe across multiple worker instances.
 */
export async function clearEventTestScores(
  eventId: string,
  env?: Record<string, any>
): Promise<{ clearedCount: number }> {
  if (!eventId || eventId === 'undefined') return { clearedCount: 0 };

  // In production, ensure database safety and use Supabase exclusively as source of truth
  if (!isLocalFallbackAllowed(env)) {
    assertProductionLeaderboardSafe('clearEventTestScores', env);
    if (!isUUID(eventId)) {
      throw new Error(`Event ID "${eventId}" is not a valid UUID in production.`);
    }

    const supabase = getSupabaseServerClient(env);
    const { error: delErr } = await supabase
      .from('event_high_scores')
      .delete()
      .eq('event_id', eventId)
      .or('score_environment.in.(test,TEST),score_mode.eq.TEST,metadata->>score_mode.eq.TEST,metadata->>score_environment.eq.test,metadata->>is_test.eq.true');

    if (delErr) {
      throw new Error(`Database error clearing test scores in production: ${delErr.message}`);
    }

    // Update test_scores_cleared_at on the event record in database
    const nowIso = new Date().toISOString();
    await supabase
      .from('events')
      .update({
        test_scores_cleared_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', eventId);

    return { clearedCount: 0 };
  }

  let clearedCount = 0;

  // 1. Clear from local cache (strictly preserving LIVE scores)
  const cached = localHighScoresCache.get(eventId) || [];
  const remaining = cached.filter((s) => {
    const isTest =
      s.score_environment === 'test' ||
      s.score_environment === 'TEST' ||
      s.score_mode === 'TEST' ||
      s.is_test === true ||
      s.metadata?.score_environment === 'test' ||
      s.metadata?.score_environment === 'TEST' ||
      s.metadata?.score_mode === 'TEST' ||
      s.metadata?.is_test === true;
    if (isTest) clearedCount++;
    return !isTest;
  });
  localHighScoresCache.set(eventId, remaining);
  saveLocalHighScores(env);

  // 2. Clear from Supabase if UUID
  if (isUUID(eventId)) {
    try {
      const supabase = getSupabaseServerClient(env);
      await supabase
        .from('event_high_scores')
        .delete()
        .eq('event_id', eventId)
        .eq('score_environment', 'test');

      await supabase
        .from('event_high_scores')
        .delete()
        .eq('event_id', eventId)
        .eq('score_mode', 'TEST');

      await supabase
        .from('event_high_scores')
        .delete()
        .eq('event_id', eventId)
        .eq('metadata->>score_mode', 'TEST');

      await supabase
        .from('event_high_scores')
        .delete()
        .eq('event_id', eventId)
        .eq('metadata->>score_environment', 'test');

      await supabase
        .from('event_high_scores')
        .delete()
        .eq('event_id', eventId)
        .eq('metadata->>is_test', 'true');

      // Update test_scores_cleared_at on the event record in database
      const nowIso = new Date().toISOString();
      await supabase
        .from('events')
        .update({
          test_scores_cleared_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', eventId);
    } catch (err: any) {
      console.warn('Notice from Supabase clearEventTestScores:', err.message);
    }
  }

  // 3. Mark in persistent set and local events cache
  testScoresClearedEvents.add(eventId);
  saveTestScoresCleared(env);

  const cachedEv = localEventsCache.get(eventId);
  if (cachedEv) {
    cachedEv.test_scores_cleared_at = new Date().toISOString();
    localEventsCache.set(eventId, cachedEv);
  }

  return { clearedCount };
}

/**
 * Checks if test scores have already been cleared for this event.
 */
export function isEventTestScoresCleared(eventId: string, event?: any): boolean {
  if (!eventId || eventId === 'undefined') return false;
  if (event?.test_scores_cleared_at) return true;
  if (testScoresClearedEvents.has(eventId)) return true;
  const cached = localEventsCache.get(eventId);
  if (cached?.test_scores_cleared_at) return true;
  return false;
}

/**
 * Ensures test scores have been cleared when an event transitions into LIVE mode or reaches start date.
 * Idempotent: runs exactly once per event.
 */
export async function ensureTestScoresClearedForLiveEvent(
  eventId: string,
  event: any,
  env?: Record<string, any>
): Promise<boolean> {
  if (!eventId || eventId === 'undefined') return false;

  if (isEventTestScoresCleared(eventId, event)) {
    return false;
  }

  await clearEventTestScores(eventId, env);
  return true;
}

/**
 * Manually clears TEST scores for an event prior to its start date.
 *
 * Rules:
 * 1. Allowed ONLY before event start date (Asia/Singapore calendar date).
 * 2. Rejects with error if event has already reached its start date or is live/completed.
 * 3. Deletes ONLY test scores (score_environment='test', score_mode='TEST', is_test=true, etc.).
 * 4. Strictly preserves LIVE scores untouched.
 * 5. Does NOT set test_scores_cleared_at, so users can play and test again,
 *    and the automatic start-date clearing still runs when the event starts.
 * 6. Returns the number of cleared test scores.
 */
export async function manualClearEventTestScores(
  eventId: string,
  env?: Record<string, any>
): Promise<{ clearedCount: number; deleted_count: number }> {
  if (!eventId || typeof eventId !== 'string' || eventId === 'undefined' || eventId === 'null' || !eventId.trim()) {
    const err: any = new Error('Valid eventId is required');
    err.status = 400;
    throw err;
  }

  // 1. Resolve event
  let event = await getEventById(eventId, env).catch(() => null);
  if (!event) {
    event = await getEventByPublicToken(eventId, env, { allowUnpaid: true }).catch(() => null);
  }
  if (!event) {
    const err: any = new Error(`Event with ID "${eventId}" not found`);
    err.status = 404;
    throw err;
  }

  // 2. Safety Rule: Verify the event has NOT reached its start date
  const beforeStart = isEventBeforeStartDate(event);
  if (!beforeStart) {
    const err: any = new Error('Cannot manually clear test scores: Event has already reached its start date or is live.');
    err.status = 400;
    err.code = 'EVENT_ALREADY_STARTED';
    throw err;
  }

  // In production, execute on Supabase as the single authoritative source of truth
  if (!isLocalFallbackAllowed(env)) {
    assertProductionLeaderboardSafe('manualClearEventTestScores', env);
    const targetId = event.id;
    if (!isUUID(targetId)) {
      throw new Error(`Event ID "${targetId}" is not a valid UUID in production.`);
    }

    const supabase = getSupabaseServerClient(env);
    // Try using the existing stored procedure with p_update_event = FALSE
    const { data: rpcCount, error: rpcError } = await supabase.rpc('clear_event_test_scores', {
      p_event_id: targetId,
      p_update_event: false,
    });

    if (!rpcError && typeof rpcCount === 'number') {
      return { clearedCount: rpcCount, deleted_count: rpcCount };
    }

    // Direct multi-condition deletion if RPC is not available
    const { error: delErr } = await supabase
      .from('event_high_scores')
      .delete()
      .eq('event_id', targetId)
      .or('score_environment.in.(test,TEST),score_mode.eq.TEST,metadata->>score_mode.eq.TEST,metadata->>score_environment.eq.test,metadata->>is_test.eq.true');

    if (delErr) {
      throw new Error(`Database error clearing test scores: ${delErr.message}`);
    }

    return { clearedCount: 0, deleted_count: 0 };
  }

  let clearedCount = 0;

  // 3. Clear TEST scores from local cache (strictly preserving LIVE scores)
  const cached = localHighScoresCache.get(event.id) || localHighScoresCache.get(eventId) || [];
  const remaining = cached.filter((s) => {
    const isTest =
      s.score_environment === 'test' ||
      s.score_environment === 'TEST' ||
      s.score_mode === 'TEST' ||
      s.is_test === true ||
      s.metadata?.score_environment === 'test' ||
      s.metadata?.score_environment === 'TEST' ||
      s.metadata?.score_mode === 'TEST' ||
      s.metadata?.is_test === true;
    if (isTest) clearedCount++;
    return !isTest;
  });
  localHighScoresCache.set(event.id, remaining);
  if (eventId !== event.id) {
    localHighScoresCache.set(eventId, remaining);
  }
  saveLocalHighScores(env);

  // 4. Clear TEST scores from Supabase (if UUID)
  const targetId = event.id;
  if (isUUID(targetId)) {
    try {
      const supabase = getSupabaseServerClient(env);

      // Try using the existing stored procedure with p_update_event = FALSE
      const { data: rpcCount, error: rpcError } = await supabase.rpc('clear_event_test_scores', {
        p_event_id: targetId,
        p_update_event: false,
      });

      if (!rpcError && typeof rpcCount === 'number') {
        clearedCount = Math.max(clearedCount, rpcCount);
      } else {
        // Direct multi-condition deletion fallback if RPC is not available
        await supabase
          .from('event_high_scores')
          .delete()
          .eq('event_id', targetId)
          .eq('score_environment', 'test');

        await supabase
          .from('event_high_scores')
          .delete()
          .eq('event_id', targetId)
          .eq('score_mode', 'TEST');

        await supabase
          .from('event_high_scores')
          .delete()
          .eq('event_id', targetId)
          .eq('metadata->>score_mode', 'TEST');

        await supabase
          .from('event_high_scores')
          .delete()
          .eq('event_id', targetId)
          .eq('metadata->>score_environment', 'test');

        await supabase
          .from('event_high_scores')
          .delete()
          .eq('event_id', targetId)
          .eq('metadata->>is_test', 'true');
      }
    } catch (err: any) {
      console.warn('Notice from Supabase manualClearEventTestScores:', err.message);
    }
  }

  // NOTE: Intentionally do NOT add to testScoresClearedEvents or update test_scores_cleared_at,
  // allowing the user to generate new TEST scores before the start date,
  // and ensuring automatic clearing upon start date still executes.

  return { clearedCount, deleted_count: clearedCount };
}

/**
 * Returns the count of TEST scores for an event.
 */
export async function getEventTestScoresCount(
  eventId: string,
  env?: Record<string, any>
): Promise<number> {
  if (!eventId || eventId === 'undefined') return 0;

  // In production, query Supabase as authoritative source of truth
  if (!isLocalFallbackAllowed(env)) {
    assertProductionLeaderboardSafe('getEventTestScoresCount', env);
    if (!isUUID(eventId)) {
      throw new Error(`Event ID "${eventId}" is not a valid UUID in production.`);
    }

    const supabase = getSupabaseServerClient(env);
    const { count, error } = await supabase
      .from('event_high_scores')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .or('score_environment.in.(test,TEST),score_mode.eq.TEST,is_test.eq.true,metadata->>score_mode.eq.TEST,metadata->>score_environment.eq.test,metadata->>is_test.eq.true');

    if (error) {
      throw new Error(`Database error fetching test score count: ${error.message}`);
    }

    return count ?? 0;
  }

  // Check local cache in development/fallback mode
  const cached = localHighScoresCache.get(eventId) || [];
  const localTestCount = cached.filter((s) => {
    return (
      s.score_environment === 'test' ||
      s.score_environment === 'TEST' ||
      s.score_mode === 'TEST' ||
      s.is_test === true ||
      s.metadata?.score_environment === 'test' ||
      s.metadata?.score_environment === 'TEST' ||
      s.metadata?.score_mode === 'TEST' ||
      s.metadata?.is_test === true
    );
  }).length;

  if (isUUID(eventId)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { count, error } = await supabase
        .from('event_high_scores')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .or('score_environment.in.(test,TEST),score_mode.eq.TEST,is_test.eq.true');

      if (!error && typeof count === 'number') {
        return Math.max(count, localTestCount);
      }
    } catch (err: any) {
      console.warn('Notice querying test score count:', err.message);
    }
  }

  return localTestCount;
}

/**
 * Sanitizes and formats player nickname safely
 */
export function sanitizePlayerName(name?: string | null): string {
  if (!name || typeof name !== 'string') return 'Player';
  const trimmed = name.trim().replace(/[\r\n\t]/g, ' ').substring(0, 30);
  return trimmed.length > 0 ? trimmed : 'Player';
}

/**
 * Submit a game score to an Event High Score Board.
 * Untrusted score input is validated on the server.
 * Supports PREVIEW, TEST, and LIVE scoring tiers.
 */
export async function submitEventScore(
  params: SubmitEventScoreParams,
  env?: Record<string, any>
): Promise<{
  score: EventHighScoreRecord;
  rank: number;
  isNewHighScore: boolean;
  totalEntries: number;
  mode: 'TEST' | 'LIVE';
  score_environment: 'test' | 'live';
  is_test?: boolean;
}> {
  // Ensure production leaderboard safety: Supabase/Postgres is required in production
  assertProductionLeaderboardSafe('submitEventScore', env);

  const { event_id, metadata = {} } = params;

  if (!event_id || typeof event_id !== 'string' || event_id === 'undefined' || event_id === 'null' || !event_id.trim()) {
    const err: any = new Error('Valid event_id is required');
    err.status = 400;
    throw err;
  }

  // Session ID extraction & strict validation
  const hasProvidedSessionId =
    'session_id' in params ||
    'sessionId' in params ||
    Boolean(metadata && ('sessionId' in metadata || 'session_id' in metadata || 'playId' in metadata || 'play_id' in metadata));

  const candidateSessionId =
    params.session_id !== undefined ? params.session_id :
    params.sessionId !== undefined ? params.sessionId :
    metadata.sessionId !== undefined ? metadata.sessionId :
    metadata.session_id !== undefined ? metadata.session_id :
    metadata.playId !== undefined ? metadata.playId :
    metadata.play_id !== undefined ? metadata.play_id :
    undefined;

  if (hasProvidedSessionId) {
    if (candidateSessionId === undefined || candidateSessionId === null || (typeof candidateSessionId === 'string' && !candidateSessionId.trim())) {
      const err: any = new Error('Session ID cannot be empty');
      err.status = 422;
      err.code = 'INVALID_SESSION_ID';
      throw err;
    }
  }

  // Strictly validate candidateSessionId against safe format allowlist
  const cleanSessionId = validateSessionId(candidateSessionId, { required: hasProvidedSessionId });

  // Consistently synchronize validated session ID across params and metadata
  params.session_id = cleanSessionId;
  metadata.sessionId = cleanSessionId;
  metadata.session_id = cleanSessionId;

  // Concurrency guard: deduplicate simultaneous submissions in the same runtime process
  const inFlightKey = `${event_id.trim()}:${cleanSessionId}`;
  const existingInFlight = inFlightScoreSubmissions.get(inFlightKey);
  if (existingInFlight) {
    return await existingInFlight;
  }

  const submissionExecution = executeSubmitEventScore(params, cleanSessionId, metadata, env);
  inFlightScoreSubmissions.set(inFlightKey, submissionExecution);
  try {
    return await submissionExecution;
  } finally {
    inFlightScoreSubmissions.delete(inFlightKey);
  }
}

/**
 * Internal execution logic for score submission with multi-tier idempotency.
 */
async function executeSubmitEventScore(
  params: SubmitEventScoreParams,
  cleanSessionId: string | undefined,
  metadata: Record<string, any>,
  env?: Record<string, any>
): Promise<{
  score: EventHighScoreRecord;
  rank: number;
  isNewHighScore: boolean;
  totalEntries: number;
  mode: 'TEST' | 'LIVE';
  score_environment: 'test' | 'live';
  is_test?: boolean;
}> {
  const { event_id } = params;

  // Reject studio preview score submissions from reaching official event leaderboards
  if (
    metadata.score_environment === 'PREVIEW' ||
    metadata.isStudioPreview === true ||
    (metadata.isEventPreview === true && !metadata.isEventTest && !metadata.is_test && metadata.score_environment !== 'TEST')
  ) {
    const err: any = new Error('Studio preview scores cannot be submitted to event leaderboards');
    err.status = 403;
    err.code = 'PREVIEW_SCORE_FORBIDDEN';
    throw err;
  }

  // Verify event existence (supports UUID, token, or local id)
  let event = await getEventById(event_id, env);
  if (!event) {
    event = await getEventByPublicToken(event_id, env, { allowUnpaid: true });
  }
  if (!event) {
    const err: any = new Error(`Event with ID or token "${event_id}" was not found`);
    err.status = 404;
    throw err;
  }

  const rawStatus = (event.status || '').toLowerCase();
  const eventStatus = (event.event_status || '').toUpperCase();
  const payStatus = (event.payment_status || '').toUpperCase();
  const cancelReason = event.cancel_reason || null;

  if (rawStatus === 'cancelled' || eventStatus === 'CANCELLED' || cancelReason) {
    const err: any = new Error('Cannot submit scores to a cancelled event');
    err.status = 400;
    err.code = 'EVENT_CANCELLED';
    throw err;
  }

  if (rawStatus === 'draft' || eventStatus === 'DRAFT') {
    const err: any = new Error('Cannot submit scores to an unpaid or draft event');
    err.status = 403;
    err.code = 'PAYMENT_REQUIRED';
    throw err;
  }

  const now = new Date();
  const { startDate, endDate } = getNormalizedEventDates(event);
  const curDate = getNormalizedCurrentDate(now);
  const derivedStatus = deriveEventLifecycleStatus(event, now);

  if (derivedStatus === 'COMPLETED' || (endDate && curDate > endDate)) {
    const err: any = new Error('Cannot submit scores to a completed event');
    err.status = 403;
    err.code = 'EVENT_COMPLETED';
    throw err;
  }

  // Determine scoring environment:
  // Server-authoritative determination based on event/session context:
  // Client-provided flags (metadata.isTest, metadata.isPreview, etc.) must NOT be authoritative.
  const authoritativeEnv = determineScoreEnvironment(event, now);
  const isTest = authoritativeEnv === 'test';
  const scoreEnvironment: 'test' | 'live' = isTest ? 'test' : 'live';

  const resolvedEventId = event.id;

  if (scoreEnvironment === 'live') {
    // Official live scoring requires payment
    if (payStatus !== 'PAID') {
      const err: any = new Error('Cannot submit live scores to an unpaid or draft event');
      err.status = 403;
      err.code = 'PAYMENT_REQUIRED';
      throw err;
    }

    // Clear TEST scores exactly once when the event transitions to LIVE mode
    await ensureTestScoresClearedForLiveEvent(resolvedEventId, event, env);
  }

  // Authoritatively resolve the game type of the event (does NOT trust client metadata)
  const eventGameType = await resolveEventGameType(event, env);

  // Validate game compatibility if metadata specifies a gameType
  if (metadata.gameType) {
    const requestedGameType = String(metadata.gameType).toLowerCase().trim();
    if (requestedGameType !== eventGameType) {
      const err: any = new Error(`Score submission gameType "${metadata.gameType}" does not match event gameType "${eventGameType}"`);
      err.status = 422;
      err.code = 'GAME_TYPE_MISMATCH';
      throw err;
    }
  }

  // Helper to format duplicate/existing result gracefully with current leaderboard rank
  const formatExistingResult = (existingRecord: EventHighScoreRecord) => {
    let currentEventScores = localHighScoresCache.get(resolvedEventId) || [];
    if (scoreEnvironment === 'live') {
      currentEventScores = currentEventScores.filter((s) => {
        const isItemTest =
          s.score_environment === 'test' ||
          s.score_environment === 'TEST' ||
          s.score_mode === 'TEST' ||
          s.is_test === true ||
          s.metadata?.score_environment === 'test' ||
          s.metadata?.score_environment === 'TEST' ||
          s.metadata?.score_mode === 'TEST' ||
          s.metadata?.is_test === true;
        return !isItemTest;
      });
    } else {
      currentEventScores = currentEventScores.filter((s) => {
        const isItemTest =
          s.score_environment === 'test' ||
          s.score_environment === 'TEST' ||
          s.score_mode === 'TEST' ||
          s.is_test === true ||
          s.metadata?.score_environment === 'test' ||
          s.metadata?.score_environment === 'TEST' ||
          s.metadata?.score_mode === 'TEST' ||
          s.metadata?.is_test === true ||
          (!s.score_environment && !s.score_mode);
        return isItemTest;
      });
    }

    const rank = currentEventScores.findIndex((s) => s.id === existingRecord.id) + 1;
    return {
      score: existingRecord,
      rank: rank > 0 ? rank : 1,
      isNewHighScore: false,
      totalEntries: currentEventScores.length,
      mode: (existingRecord.score_mode || (isTest ? 'TEST' : 'LIVE')) as 'TEST' | 'LIVE',
      score_environment: scoreEnvironment,
      is_test: isTest,
    };
  };

  // GLOBAL IDEMPOTENCY PRE-CHECK:
  // 1. Fast-path: Check local in-memory cache ONLY when local fallback is permitted (dev/test sandbox)
  if (cleanSessionId) {
    if (isLocalFallbackAllowed(env)) {
      const localScores = localHighScoresCache.get(resolvedEventId) || [];
      const cachedRecord = localScores.find(
        (s) =>
          s.session_id === cleanSessionId ||
          s.metadata?.sessionId === cleanSessionId ||
          s.metadata?.session_id === cleanSessionId ||
          s.metadata?.playId === cleanSessionId ||
          s.metadata?.play_id === cleanSessionId
      );
      if (cachedRecord) {
        return formatExistingResult(cachedRecord);
      }
    }

    // 2. Global DB Check: Multiple Cloudflare Worker instances can receive the same request.
    // Database is the authoritative source of truth across worker instances.
    if (isUUID(resolvedEventId)) {
      try {
        if (!SAFE_SESSION_ID_REGEX.test(cleanSessionId)) {
          const err: any = new Error('Invalid session ID for database query filter');
          err.status = 422;
          err.code = 'INVALID_SESSION_ID';
          throw err;
        }

        const supabase = getSupabaseServerClient(env);
        const { data: existingDbRow, error: fetchErr } = await supabase
          .from('event_high_scores')
          .select('*')
          .eq('event_id', resolvedEventId)
          .or(`session_id.eq.${cleanSessionId},metadata->>sessionId.eq.${cleanSessionId},metadata->>session_id.eq.${cleanSessionId}`)
          .limit(1)
          .maybeSingle();

        if (!fetchErr && existingDbRow) {
          const canonicalRecord: EventHighScoreRecord = {
            id: existingDbRow.id,
            event_id: existingDbRow.event_id,
            player_name: existingDbRow.player_name,
            score: existingDbRow.score,
            session_id: existingDbRow.session_id || cleanSessionId,
            score_environment: existingDbRow.score_environment,
            score_mode: existingDbRow.score_mode,
            is_test: existingDbRow.is_test,
            metadata: existingDbRow.metadata,
            created_at: existingDbRow.created_at,
          };

          // Synchronize to local cache if local fallback is allowed
          if (isLocalFallbackAllowed(env)) {
            const currentList = localHighScoresCache.get(resolvedEventId) || [];
            if (!currentList.some((s) => s.id === canonicalRecord.id)) {
              currentList.push(canonicalRecord);
              currentList.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
              });
              localHighScoresCache.set(resolvedEventId, currentList);
              saveLocalHighScores(env);
            }
          }

          return formatExistingResult(canonicalRecord);
        }
      } catch (dbCheckErr: any) {
        if (!isLocalFallbackAllowed(env)) {
          throw dbCheckErr;
        }
        console.warn('Notice from Supabase session idempotency lookup:', dbCheckErr.message);
      }
    }
  }

  // Validate game-specific scoring rules
  let scoreNum = Math.floor(Number(params.score));

  if (eventGameType === 'memory-match') {
    // AUTOMATIC MEMORY MATCH VALIDATION:
    // The server enforces Memory Match validation based on the authoritative event configuration,
    // regardless of whether metadata.gameType was supplied or omitted.
    const moves = typeof metadata.moves === 'number'
      ? metadata.moves
      : (metadata.moves !== undefined && metadata.moves !== null && !isNaN(Number(metadata.moves)) ? Number(metadata.moves) : undefined);

    const duration = typeof metadata.duration === 'number'
      ? metadata.duration
      : (metadata.duration !== undefined && metadata.duration !== null && !isNaN(Number(metadata.duration)) ? Number(metadata.duration) : undefined);

    const matchedPairs = typeof metadata.matchedPairs === 'number'
      ? metadata.matchedPairs
      : (metadata.matchedPairs !== undefined && metadata.matchedPairs !== null && !isNaN(Number(metadata.matchedPairs)) ? Number(metadata.matchedPairs) : undefined);

    // Authoritatively resolve total pairs from event configuration:
    // submitted event -> authoritative event/theme/game config -> Memory Match config -> authoritative totalPairs
    const mmConfig = await resolveAuthoritativeMemoryMatchConfig(event, env);
    const authoritativeTotalPairs = mmConfig.authoritativeTotalPairs;

    // Validate:
    // 1. matchedPairs >= 0
    if (typeof matchedPairs !== 'number' || isNaN(matchedPairs) || matchedPairs < 0 || !Number.isInteger(matchedPairs)) {
      const err: any = new Error('Matched pairs must be a non-negative integer');
      err.status = 422;
      err.code = 'INVALID_MEMORY_MATCH_SCORE';
      throw err;
    }

    // 2. matchedPairs <= authoritative totalPairs
    if (matchedPairs > authoritativeTotalPairs) {
      const err: any = new Error(
        `Matched pairs (${matchedPairs}) cannot exceed authoritative total pairs (${authoritativeTotalPairs})`
      );
      err.status = 422;
      err.code = 'INVALID_MEMORY_MATCH_SCORE';
      throw err;
    }

    // 3. Client claimed totalPairs cannot exceed authoritative totalPairs
    if (
      metadata.totalPairs !== undefined &&
      metadata.totalPairs !== null &&
      Number(metadata.totalPairs) > authoritativeTotalPairs
    ) {
      const err: any = new Error(
        `Client claimed totalPairs (${metadata.totalPairs}) exceeds authoritative total pairs (${authoritativeTotalPairs})`
      );
      err.status = 422;
      err.code = 'INVALID_MEMORY_MATCH_SCORE';
      throw err;
    }

    // NEVER trust client-provided metadata.totalPairs for authoritative score validation!
    // The server always uses the authoritativeTotalPairs derived from event configuration:
    // (If actual event = 48 pairs and client claims = 8 pairs, the server still uses 48)
    const totalPairs = authoritativeTotalPairs;

    const validation = validateMemoryMatchResult({
      moves: moves as any,
      duration: duration as any,
      matchedPairs: matchedPairs as any,
      totalPairs,
      submittedScore: isNaN(scoreNum) ? undefined : scoreNum,
    });

    if (!validation.isValid) {
      const err: any = new Error(validation.reason || 'Invalid Memory Match score data');
      err.status = 422;
      err.code = 'INVALID_MEMORY_MATCH_SCORE';
      throw err;
    }

    if (validation.expectedScore !== undefined) {
      scoreNum = validation.expectedScore;
    }

    // Embed authoritative Memory Match metadata
    metadata.gameType = 'memory-match';
    metadata.gameVersion = metadata.gameVersion || MEMORY_MATCH_GAME_VERSION;
    metadata.scoringVersion = metadata.scoringVersion || MEMORY_MATCH_SCORING_VERSION;
    metadata.matchedPairs = matchedPairs;
    metadata.totalPairs = totalPairs;
    metadata.moves = moves;
    metadata.duration = duration;
    metadata.isVictory = matchedPairs === totalPairs;
  } else if (eventGameType === 'catch-brand') {
    // CATCH THE BRAND VALIDATION:
    // Preserve existing Catch The Brand validation and behavior.
    if (!metadata.gameType) {
      metadata.gameType = 'catch-brand';
    }
  }

  // Validate score: must be a non-negative integer
  if (isNaN(scoreNum) || scoreNum < 0) {
    const err: any = new Error('Score must be a non-negative integer');
    err.status = 422;
    throw err;
  }
  // Sanity upper bound (e.g. 1,000,000 max achievable in game session)
  if (scoreNum > 1000000) {
    const err: any = new Error('Score exceeds maximum allowed session threshold');
    err.status = 422;
    throw err;
  }

  const playerName = sanitizePlayerName(params.player_name);
  const recordId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const newRecord: EventHighScoreRecord = {
    id: recordId,
    event_id: resolvedEventId,
    player_name: playerName,
    score: scoreNum,
    session_id: cleanSessionId || null,
    score_environment: scoreEnvironment,
    score_mode: isTest ? 'TEST' : 'LIVE',
    is_test: isTest,
    metadata: {
      ...metadata,
      sessionId: cleanSessionId,
      session_id: cleanSessionId,
      score_environment: scoreEnvironment,
      score_mode: isTest ? 'TEST' : 'LIVE',
      is_test: isTest,
      is_official: !isTest,
    },
    created_at: createdAt,
  };

  // Check existing scores in cache/db to calculate rank and high score flag
  let currentEventScores = localHighScoresCache.get(resolvedEventId) || [];
  if (scoreEnvironment === 'live') {
    currentEventScores = currentEventScores.filter((s) => {
      const isItemTest =
        s.score_environment === 'test' ||
        s.score_environment === 'TEST' ||
        s.score_mode === 'TEST' ||
        s.is_test === true ||
        s.metadata?.score_environment === 'test' ||
        s.metadata?.score_environment === 'TEST' ||
        s.metadata?.score_mode === 'TEST' ||
        s.metadata?.is_test === true;
      return !isItemTest;
    });
  } else {
    currentEventScores = currentEventScores.filter((s) => {
      const isItemTest =
        s.score_environment === 'test' ||
        s.score_environment === 'TEST' ||
        s.score_mode === 'TEST' ||
        s.is_test === true ||
        s.metadata?.score_environment === 'test' ||
        s.metadata?.score_environment === 'TEST' ||
        s.metadata?.score_mode === 'TEST' ||
        s.metadata?.is_test === true ||
        (!s.score_environment && !s.score_mode);
      return isItemTest;
    });
  }

  const currentHighest = currentEventScores.length > 0
    ? Math.max(...currentEventScores.map((s) => s.score))
    : 0;

  const isNewHighScore = scoreNum > currentHighest;

  let finalRecord: EventHighScoreRecord = newRecord;
  let isDuplicateFromDb = false;

  // Try saving into Supabase if it's a valid UUID
  if (isUUID(resolvedEventId)) {
    try {
      const supabase = getSupabaseServerClient(env);
      let insertPayload: Record<string, any> = {
        id: recordId,
        event_id: resolvedEventId,
        player_name: playerName,
        score: scoreNum,
        session_id: cleanSessionId || null,
        score_environment: scoreEnvironment,
        score_mode: isTest ? 'TEST' : 'LIVE',
        is_test: isTest,
        metadata: newRecord.metadata,
        created_at: createdAt,
      };

      let { data, error } = await supabase
        .from('event_high_scores')
        .insert(insertPayload)
        .select('*')
        .single();

      if (error && (error.message?.includes('column "session_id"') || error.code === '42703')) {
        // Fallback for older database versions without session_id column
        delete insertPayload.session_id;
        if (error.message?.includes('column') || error.code === '42703') {
          delete insertPayload.score_environment;
          delete insertPayload.score_mode;
          delete insertPayload.is_test;
        }
        const retryRes = await supabase
          .from('event_high_scores')
          .insert(insertPayload)
          .select('*')
          .single();
        error = retryRes.error;
        data = retryRes.data;
      }

      // Check if duplicate key violation (e.g. Postgres code 23505 or unique index conflict)
      const isUniqueViolation =
        error &&
        (error.code === '23505' ||
          error.message?.includes('duplicate key') ||
          error.message?.includes('uq_event_high_scores_event_session') ||
          error.message?.includes('unique constraint'));

      if (isUniqueViolation && cleanSessionId) {
        if (!SAFE_SESSION_ID_REGEX.test(cleanSessionId)) {
          const err: any = new Error('Invalid session ID for database query filter');
          err.status = 422;
          err.code = 'INVALID_SESSION_ID';
          throw err;
        }

        // Handled gracefully: another concurrent request/worker won the insert race.
        // Fetch the winner's canonical database record.
        const { data: winningRow } = await supabase
          .from('event_high_scores')
          .select('*')
          .eq('event_id', resolvedEventId)
          .or(`session_id.eq.${cleanSessionId},metadata->>sessionId.eq.${cleanSessionId},metadata->>session_id.eq.${cleanSessionId}`)
          .limit(1)
          .maybeSingle();

        if (winningRow) {
          finalRecord = {
            id: winningRow.id,
            event_id: winningRow.event_id,
            player_name: winningRow.player_name,
            score: winningRow.score,
            session_id: winningRow.session_id || cleanSessionId,
            score_environment: winningRow.score_environment,
            score_mode: winningRow.score_mode,
            is_test: winningRow.is_test,
            metadata: winningRow.metadata,
            created_at: winningRow.created_at,
          };
          isDuplicateFromDb = true;
        }
      } else if (error) {
        if (!isLocalFallbackAllowed(env)) {
          throw new Error(`Database error saving high score: ${error.message}`);
        }
        console.warn(`Notice from Supabase high score insert (${error.message}). Saved to local fallback store.`);
      } else if (data) {
        finalRecord = {
          id: data.id,
          event_id: data.event_id,
          player_name: data.player_name,
          score: data.score,
          session_id: data.session_id || cleanSessionId,
          score_environment: data.score_environment,
          score_mode: data.score_mode,
          is_test: data.is_test,
          metadata: data.metadata,
          created_at: data.created_at,
        };
      }
    } catch (err: any) {
      if (!isLocalFallbackAllowed(env)) {
        throw err;
      }
      console.warn('Supabase high score insert fallback notice:', err.message);
    }
  }

  let rank = 1;
  let totalEntries = 1;
  let calculatedNewHighScore = false;

  if (!isLocalFallbackAllowed(env)) {
    // Authoritative calculation from Postgres / Supabase in production
    try {
      const supabase = getSupabaseServerClient(env);
      let higherScoresQuery = supabase
        .from('event_high_scores')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', resolvedEventId)
        .gt('score', finalRecord.score);

      if (scoreEnvironment === 'live') {
        higherScoresQuery = higherScoresQuery
          .neq('score_environment', 'test')
          .neq('score_mode', 'TEST')
          .neq('metadata->>score_mode', 'TEST');
      }

      const { count: higherCount } = await higherScoresQuery;
      rank = (higherCount ?? 0) + 1;

      let totalQuery = supabase
        .from('event_high_scores')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', resolvedEventId);

      if (scoreEnvironment === 'live') {
        totalQuery = totalQuery
          .neq('score_environment', 'test')
          .neq('score_mode', 'TEST')
          .neq('metadata->>score_mode', 'TEST');
      }

      const { count: totalCount } = await totalQuery;
      totalEntries = totalCount ?? 1;
      calculatedNewHighScore = rank === 1 && !isDuplicateFromDb;
    } catch {
      rank = 1;
      totalEntries = 1;
      calculatedNewHighScore = !isDuplicateFromDb;
    }
  } else {
    // Development / test fallback cache execution
    const allEventScores = localHighScoresCache.get(resolvedEventId) || [];
    if (cleanSessionId) {
      const existingIdx = allEventScores.findIndex(
        (s) =>
          s.id === finalRecord.id ||
          s.session_id === cleanSessionId ||
          s.metadata?.sessionId === cleanSessionId ||
          s.metadata?.session_id === cleanSessionId
      );
      if (existingIdx >= 0) {
        allEventScores[existingIdx] = finalRecord;
      } else {
        allEventScores.push(finalRecord);
      }
    } else {
      allEventScores.push(finalRecord);
    }

    allEventScores.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    localHighScoresCache.set(resolvedEventId, allEventScores);
    saveLocalHighScores(env);

    // Re-calculate player's 1-based rank within current mode
    let finalModeScores = allEventScores;
    if (scoreEnvironment === 'live') {
      finalModeScores = finalModeScores.filter((s) => {
        const isItemTest =
          s.score_environment === 'test' ||
          s.score_environment === 'TEST' ||
          s.score_mode === 'TEST' ||
          s.is_test === true ||
          s.metadata?.score_environment === 'test' ||
          s.metadata?.score_environment === 'TEST' ||
          s.metadata?.score_mode === 'TEST' ||
          s.metadata?.is_test === true;
        return !isItemTest;
      });
    } else {
      finalModeScores = finalModeScores.filter((s) => {
        const isItemTest =
          s.score_environment === 'test' ||
          s.score_environment === 'TEST' ||
          s.score_mode === 'TEST' ||
          s.is_test === true ||
          s.metadata?.score_environment === 'test' ||
          s.metadata?.score_environment === 'TEST' ||
          s.metadata?.score_mode === 'TEST' ||
          s.metadata?.is_test === true ||
          (!s.score_environment && !s.score_mode);
        return isItemTest;
      });
    }

    const calculatedRank = finalModeScores.findIndex((s) => s.id === finalRecord.id) + 1;
    rank = calculatedRank > 0 ? calculatedRank : 1;
    totalEntries = finalModeScores.length;
    calculatedNewHighScore = !isDuplicateFromDb && isNewHighScore;
  }

  return {
    score: finalRecord,
    rank,
    isNewHighScore: calculatedNewHighScore,
    totalEntries,
    mode: isTest ? 'TEST' : 'LIVE',
    score_environment: scoreEnvironment,
    is_test: isTest,
  };
}

/**
 * Retrieve high score leaderboard for a specific event with rank.
 * Scores from Event A NEVER appear in Event B.
 * Respects 3-tier score environments (TEST vs LIVE).
 */
export async function getEventHighScores(
  eventId: string,
  options: { limit?: number; page?: number } = {},
  env?: Record<string, any>
): Promise<{
  scores: EventLeaderboardEntry[];
  totalCount: number;
  page: number;
  limit: number;
  score_environment: 'test' | 'live';
  is_test_mode: boolean;
}> {
  if (!eventId || typeof eventId !== 'string' || eventId === 'undefined' || eventId === 'null' || !eventId.trim()) {
    return { scores: [], totalCount: 0, page: 1, limit: 20, score_environment: 'live', is_test_mode: false };
  }

  // Ensure production leaderboard safety: Supabase/Postgres is required in production
  assertProductionLeaderboardSafe('getEventHighScores', env);

  const limit = Math.min(Math.max(1, options.limit || 20), 100);
  const page = Math.max(1, options.page || 1);
  const offset = (page - 1) * limit;

  // Resolve event to check current lifecycle environment
  let event = await getEventById(eventId, env).catch(() => null);
  if (!event) {
    event = await getEventByPublicToken(eventId, env, { allowUnpaid: true }).catch(() => null);
  }

  const scoreEnvironment = event ? determineScoreEnvironment(event) : 'live';
  const isTestMode = scoreEnvironment === 'test';

  // If live, ensure pre-event test scores have been cleared exactly once
  if (event && scoreEnvironment === 'live') {
    await ensureTestScoresClearedForLiveEvent(event.id, event, env);
  }

  if (!isUUID(eventId)) {
    if (event && isUUID(event.id)) {
      return getEventHighScores(event.id, options, env);
    }
    if (!isLocalFallbackAllowed(env)) {
      throw new Error(`Event ID "${eventId}" is not a valid UUID in production.`);
    }
    const localRes = getLocalEventHighScores(eventId, limit, page, scoreEnvironment);
    return { ...localRes, score_environment: scoreEnvironment, is_test_mode: isTestMode };
  }

  try {
    const supabase = getSupabaseServerClient(env);
    let query = supabase
      .from('event_high_scores')
      .select('*', { count: 'exact' })
      .eq('event_id', eventId);

    // In LIVE mode: NEVER return TEST scores
    if (scoreEnvironment === 'live') {
      query = query
        .neq('score_environment', 'test')
        .neq('score_mode', 'TEST')
        .neq('metadata->>score_mode', 'TEST');
    }

    const { data, error, count } = await query
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Database error fetching leaderboard: ${error.message}`);
      }
      console.warn(`Notice from Supabase getEventHighScores (${error.message}). Reading from local cache.`);
      const localRes = getLocalEventHighScores(eventId, limit, page, scoreEnvironment);
      return { ...localRes, score_environment: scoreEnvironment, is_test_mode: isTestMode };
    }

    if (data) {
      const entries: EventLeaderboardEntry[] = data.map((item: any, idx: number) => {
        const itemIsTest =
          item.score_environment === 'test' ||
          item.score_environment === 'TEST' ||
          item.score_mode === 'TEST' ||
          item.is_test === true ||
          item.metadata?.score_environment === 'test' ||
          item.metadata?.score_environment === 'TEST' ||
          item.metadata?.score_mode === 'TEST' ||
          item.metadata?.is_test === true;

        const itemScoreEnv: 'test' | 'live' = itemIsTest ? 'test' : 'live';

        return {
          id: item.id,
          event_id: item.event_id,
          player_name: item.player_name,
          score: item.score,
          session_id: item.session_id || item.metadata?.sessionId || item.metadata?.session_id || null,
          score_environment: itemScoreEnv,
          score_mode: itemIsTest ? 'TEST' : 'LIVE',
          is_test: itemIsTest,
          metadata: item.metadata,
          created_at: item.created_at,
          rank: offset + idx + 1,
        };
      });

      return {
        scores: entries,
        totalCount: count ?? entries.length,
        page,
        limit,
        score_environment: scoreEnvironment,
        is_test_mode: isTestMode,
      };
    }

    if (!isLocalFallbackAllowed(env)) {
      return {
        scores: [],
        totalCount: 0,
        page,
        limit,
        score_environment: scoreEnvironment,
        is_test_mode: isTestMode,
      };
    }

    const localRes = getLocalEventHighScores(eventId, limit, page, scoreEnvironment);
    return { ...localRes, score_environment: scoreEnvironment, is_test_mode: isTestMode };
  } catch (err: any) {
    if (!isLocalFallbackAllowed(env)) {
      throw err;
    }
    console.warn('Error reading high scores from Supabase, using local fallback:', err.message);
    const localRes = getLocalEventHighScores(eventId, limit, page, scoreEnvironment);
    return { ...localRes, score_environment: scoreEnvironment, is_test_mode: isTestMode };
  }
}

/**
 * Local cache fallback reader for high scores
 */
function getLocalEventHighScores(
  eventId: string,
  limit: number,
  page: number,
  scoreEnvironment: 'test' | 'live' | 'TEST' | 'LIVE' = 'live'
): {
  scores: EventLeaderboardEntry[];
  totalCount: number;
  page: number;
  limit: number;
} {
  const isTargetTest = String(scoreEnvironment).toLowerCase() === 'test';
  const allScores = localHighScoresCache.get(eventId) || [];
  // Filter by score environment
  const filtered = allScores.filter((s) => {
    const isTest =
      s.score_environment === 'test' ||
      s.score_environment === 'TEST' ||
      s.score_mode === 'TEST' ||
      s.is_test === true ||
      s.metadata?.score_environment === 'test' ||
      s.metadata?.score_environment === 'TEST' ||
      s.metadata?.score_mode === 'TEST' ||
      s.metadata?.is_test === true;
    return isTargetTest ? isTest || (!s.score_environment && !s.score_mode) : !isTest;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const totalCount = sorted.length;
  const offset = (page - 1) * limit;
  const pageItems = sorted.slice(offset, offset + limit);

  const scores: EventLeaderboardEntry[] = pageItems.map((item, idx) => {
    const itemIsTest =
      item.score_environment === 'test' ||
      item.score_environment === 'TEST' ||
      item.score_mode === 'TEST' ||
      item.is_test === true ||
      item.metadata?.score_environment === 'test' ||
      item.metadata?.score_environment === 'TEST' ||
      item.metadata?.score_mode === 'TEST' ||
      item.metadata?.is_test === true ||
      isTargetTest;

    return {
      ...item,
      score_environment: itemIsTest ? 'test' : 'live',
      score_mode: itemIsTest ? 'TEST' : 'LIVE',
      is_test: itemIsTest,
      rank: offset + idx + 1,
    };
  });

  return {
    scores,
    totalCount,
    page,
    limit,
  };
}

/**
 * Get summary stats for an event's score activity (for admin & event dashboards)
 */
export async function getEventScoreStats(
  eventId: string,
  env?: Record<string, any>
): Promise<EventScoreStats & { score_environment?: 'test' | 'live' | 'TEST' | 'LIVE'; is_test_mode?: boolean }> {
  const { scores, totalCount, score_environment, is_test_mode } = await getEventHighScores(eventId, { limit: 1000 }, env);

  if (scores.length === 0) {
    return {
      totalEntries: 0,
      uniquePlayers: 0,
      highScore: 0,
      averageScore: 0,
      latestScoreAt: null,
      completedCount: 0,
      completionRate: 0,
      averageMoves: null,
      averageDuration: null,
      gameTypeBreakdown: {},
      score_environment,
      is_test_mode,
    };
  }

  const uniquePlayerNames = new Set(scores.map((s) => s.player_name.toLowerCase()));
  const highScore = Math.max(...scores.map((s) => s.score));
  const sumScores = scores.reduce((acc, s) => acc + s.score, 0);
  const averageScore = Math.round(sumScores / scores.length);

  // Extended game metrics
  let completedCount = 0;
  let totalMoves = 0;
  let countMoves = 0;
  let totalDuration = 0;
  let countDuration = 0;

  const gameTypeBreakdown: Record<string, any> = {};

  for (const s of scores) {
    const meta = s.metadata || {};
    const gType = meta.gameType || 'generic';

    if (!gameTypeBreakdown[gType]) {
      gameTypeBreakdown[gType] = {
        totalPlays: 0,
        completedPlays: 0,
        totalScore: 0,
        highScore: 0,
        totalMoves: 0,
        countMoves: 0,
        totalDuration: 0,
        countDuration: 0,
      };
    }

    const gb = gameTypeBreakdown[gType];
    gb.totalPlays += 1;
    gb.totalScore += s.score;
    if (s.score > gb.highScore) gb.highScore = s.score;

    const isComplete = meta.isVictory === true || (meta.matchedPairs && meta.matchedPairs === (meta.totalPairs || 8));
    if (isComplete) {
      completedCount += 1;
      gb.completedPlays += 1;
    }

    if (typeof meta.moves === 'number' && meta.moves >= 0) {
      totalMoves += meta.moves;
      countMoves += 1;
      gb.totalMoves += meta.moves;
      gb.countMoves += 1;
    }

    if (typeof meta.duration === 'number' && meta.duration >= 0) {
      totalDuration += meta.duration;
      countDuration += 1;
      gb.totalDuration += meta.duration;
      gb.countDuration += 1;
    }
  }

  const formattedBreakdown: Record<string, any> = {};
  for (const [key, val] of Object.entries(gameTypeBreakdown)) {
    formattedBreakdown[key] = {
      totalPlays: val.totalPlays,
      completedPlays: val.completedPlays,
      averageScore: val.totalPlays > 0 ? Math.round(val.totalScore / val.totalPlays) : 0,
      highScore: val.highScore,
      averageMoves: val.countMoves > 0 ? Math.round(val.totalMoves / val.countMoves) : null,
      averageDuration: val.countDuration > 0 ? Math.round(val.totalDuration / val.countDuration) : null,
    };
  }

  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const averageMoves = countMoves > 0 ? Math.round(totalMoves / countMoves) : null;
  const averageDuration = countDuration > 0 ? Math.round(totalDuration / countDuration) : null;

  // Latest score timestamp
  const latestTimestamp = scores.reduce((latest, s) => {
    const time = new Date(s.created_at).getTime();
    return time > latest ? time : latest;
  }, 0);

  return {
    totalEntries: totalCount,
    uniquePlayers: uniquePlayerNames.size,
    highScore,
    averageScore,
    latestScoreAt: latestTimestamp > 0 ? new Date(latestTimestamp).toISOString() : null,
    completedCount,
    completionRate,
    averageMoves,
    averageDuration,
    gameTypeBreakdown: formattedBreakdown,
    score_environment,
    is_test_mode,
  };
}

/**
 * Delete a specific high score entry (Admin action)
 */
export async function deleteEventScore(
  eventId: string,
  scoreId: string,
  env?: Record<string, any>
): Promise<boolean> {
  if (!eventId || !scoreId || eventId === 'undefined' || scoreId === 'undefined') return false;

  // In production, execute on Supabase as the single authoritative source of truth
  if (!isLocalFallbackAllowed(env)) {
    assertProductionLeaderboardSafe('deleteEventScore', env);
    if (!isUUID(eventId) || !isUUID(scoreId)) {
      throw new Error(`Invalid UUIDs in production: eventId="${eventId}", scoreId="${scoreId}"`);
    }

    const supabase = getSupabaseServerClient(env);
    const { error } = await supabase
      .from('event_high_scores')
      .delete()
      .eq('id', scoreId)
      .eq('event_id', eventId);

    if (error) {
      throw new Error(`Database error deleting high score: ${error.message}`);
    }
    return true;
  }

  // Remove from local cache
  const list = localHighScoresCache.get(eventId) || [];
  const filtered = list.filter((s) => s.id !== scoreId);
  localHighScoresCache.set(eventId, filtered);
  saveLocalHighScores(env);

  // Remove from Supabase if valid UUID
  if (isUUID(eventId) && isUUID(scoreId)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { error } = await supabase
        .from('event_high_scores')
        .delete()
        .eq('id', scoreId)
        .eq('event_id', eventId);

      if (error) {
        console.warn(`Notice from Supabase delete high score (${error.message})`);
      }
    } catch (err: any) {
      console.warn('Supabase delete high score notice:', err.message);
    }
  }

  return true;
}

/**
 * Clear all high scores for an event (Leaderboard reset action)
 */
export async function clearEventHighScores(
  eventId: string,
  env?: Record<string, any>
): Promise<boolean> {
  if (!eventId || eventId === 'undefined') return false;

  // In production, execute on Supabase as the single authoritative source of truth
  if (!isLocalFallbackAllowed(env)) {
    assertProductionLeaderboardSafe('clearEventHighScores', env);
    if (!isUUID(eventId)) {
      throw new Error(`Event ID "${eventId}" is not a valid UUID in production.`);
    }

    const supabase = getSupabaseServerClient(env);
    const { error } = await supabase
      .from('event_high_scores')
      .delete()
      .eq('event_id', eventId);

    if (error) {
      throw new Error(`Database error clearing high scores: ${error.message}`);
    }
    return true;
  }

  // Clear in local cache
  localHighScoresCache.set(eventId, []);
  saveLocalHighScores(env);

  // Record that test scores were cleared
  testScoresClearedEvents.add(eventId);
  saveTestScoresCleared(env);

  // Clear in Supabase if valid UUID
  if (isUUID(eventId)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { error } = await supabase
        .from('event_high_scores')
        .delete()
        .eq('event_id', eventId);

      if (error) {
        console.warn(`Notice from Supabase clear high scores (${error.message})`);
      }
    } catch (err: any) {
      console.warn('Supabase clear high scores notice:', err.message);
    }
  }

  return true;
}
