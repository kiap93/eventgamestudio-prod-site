import { getSupabaseServerClient, isLocalFallbackAllowed } from '../supabase.js';
import {
  EventHighScoreRecord,
  EventLeaderboardEntry,
  EventScoreStats,
  ScoreEnvironment,
} from './types.js';
import {
  getEventById,
  getEventByPublicToken,
  isEventPlayable,
  deriveEventLifecycleStatus,
  getNormalizedEventDates,
  getNormalizedCurrentDate,
  localEventsCache,
} from './events.js';
import { isUUID } from './themes.js';
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

// In-memory cache for quick access and test fallback: Map<eventId, EventHighScoreRecord[]>
export const localHighScoresCache = new Map<string, EventHighScoreRecord[]>();

// Persistent tracking of events that have transitioned to LIVE and had their TEST scores cleared
const testScoresClearedEvents = new Set<string>();

function loadLocalHighScores(): void {
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

function saveLocalHighScores(): void {
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

function loadTestScoresCleared(): void {
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

function saveTestScoresCleared(): void {
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

// Initial load
loadLocalHighScores();
loadTestScoresCleared();

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
  saveLocalHighScores();

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
  saveTestScoresCleared();

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
  params: {
    event_id: string;
    player_name?: string | null;
    score: number;
    metadata?: Record<string, any>;
  },
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
  const { event_id, metadata = {} } = params;

  if (!event_id || typeof event_id !== 'string' || event_id === 'undefined' || event_id === 'null' || !event_id.trim()) {
    const err: any = new Error('Valid event_id is required');
    err.status = 400;
    throw err;
  }

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

  // Validate game compatibility if metadata specifies a gameType
  if (metadata.gameType && event.game?.game_type) {
    if (metadata.gameType !== event.game.game_type) {
      const err: any = new Error(`Score submission gameType "${metadata.gameType}" does not match event gameType "${event.game.game_type}"`);
      err.status = 422;
      throw err;
    }
  }

  // Idempotency check: if sessionId / playId is provided, check if already recorded
  const sessionId = metadata.sessionId || metadata.session_id || metadata.playId || metadata.play_id;
  let currentEventScores = localHighScoresCache.get(resolvedEventId) || [];

  // Filter relevant scores according to current environment:
  // In LIVE mode: only compare against official LIVE scores
  // In TEST mode: compare against TEST scores
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

  if (sessionId && typeof sessionId === 'string' && sessionId.trim()) {
    const existingSessionRecord = currentEventScores.find(
      (s) =>
        s.metadata?.sessionId === sessionId ||
        s.metadata?.session_id === sessionId ||
        s.metadata?.playId === sessionId ||
        s.metadata?.play_id === sessionId
    );
    if (existingSessionRecord) {
      const rank = currentEventScores.findIndex((s) => s.id === existingSessionRecord.id) + 1;
      return {
        score: existingSessionRecord,
        rank: rank > 0 ? rank : 1,
        isNewHighScore: false,
        totalEntries: currentEventScores.length,
        mode: isTest ? 'TEST' : 'LIVE',
        score_environment: scoreEnvironment,
        is_test: isTest,
      };
    }
  }

  // Validate Memory Match specific metadata if present
  let scoreNum = Math.floor(Number(params.score));

  if (metadata.gameType === 'memory-match') {
    const moves = typeof metadata.moves === 'number' ? metadata.moves : 0;
    const duration = typeof metadata.duration === 'number' ? metadata.duration : 0;
    const matchedPairs = typeof metadata.matchedPairs === 'number' ? metadata.matchedPairs : 0;
    const totalPairs = typeof metadata.totalPairs === 'number' ? metadata.totalPairs : 8;

    const validation = validateMemoryMatchResult({
      moves,
      duration,
      matchedPairs,
      totalPairs,
      submittedScore: isNaN(scoreNum) ? undefined : scoreNum,
    });

    if (!validation.isValid) {
      const err: any = new Error(validation.reason || 'Invalid Memory Match score data');
      err.status = 422;
      throw err;
    }

    if (validation.expectedScore !== undefined) {
      scoreNum = validation.expectedScore;
    }

    // Embed version metadata
    metadata.gameVersion = metadata.gameVersion || MEMORY_MATCH_GAME_VERSION;
    metadata.scoringVersion = metadata.scoringVersion || MEMORY_MATCH_SCORING_VERSION;
    metadata.matchedPairs = matchedPairs;
    metadata.totalPairs = totalPairs;
    metadata.moves = moves;
    metadata.duration = duration;
    metadata.isVictory = matchedPairs === totalPairs;
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
    score_environment: scoreEnvironment,
    score_mode: isTest ? 'TEST' : 'LIVE',
    is_test: isTest,
    metadata: {
      ...metadata,
      score_environment: scoreEnvironment,
      score_mode: isTest ? 'TEST' : 'LIVE',
      is_test: isTest,
      is_official: !isTest,
    },
    created_at: createdAt,
  };

  // Check existing scores in cache/db to calculate rank and high score flag
  const currentHighest = currentEventScores.length > 0
    ? Math.max(...currentEventScores.map((s) => s.score))
    : 0;

  const isNewHighScore = scoreNum > currentHighest;

  // Insert into local cache
  const allEventScores = localHighScoresCache.get(resolvedEventId) || [];
  allEventScores.push(newRecord);
  allEventScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  localHighScoresCache.set(resolvedEventId, allEventScores);
  saveLocalHighScores();

  // Try saving into Supabase if it's a valid UUID
  if (isUUID(resolvedEventId)) {
    try {
      const supabase = getSupabaseServerClient(env);
      let insertPayload: Record<string, any> = {
        id: recordId,
        event_id: resolvedEventId,
        player_name: playerName,
        score: scoreNum,
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

      if (error && (error.message?.includes('column') || error.code === '42703')) {
        // Fallback for older database versions without new columns
        delete insertPayload.score_environment;
        delete insertPayload.score_mode;
        delete insertPayload.is_test;
        const retryRes = await supabase
          .from('event_high_scores')
          .insert(insertPayload)
          .select('*')
          .single();
        error = retryRes.error;
      }

      if (error) {
        if (!isLocalFallbackAllowed(env)) {
          throw new Error(`Database error saving high score: ${error.message}`);
        }
        console.warn(`Notice from Supabase high score insert (${error.message}). Saved to local fallback store.`);
      }
    } catch (err: any) {
      if (!isLocalFallbackAllowed(env)) {
        throw err;
      }
      console.warn('Supabase high score insert fallback notice:', err.message);
    }
  }

  // Calculate player's 1-based rank within current mode
  currentEventScores.push(newRecord);
  currentEventScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  const rank = currentEventScores.findIndex((s) => s.id === recordId) + 1;

  return {
    score: newRecord,
    rank: rank > 0 ? rank : 1,
    isNewHighScore,
    totalEntries: currentEventScores.length,
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

  // Remove from local cache
  const list = localHighScoresCache.get(eventId) || [];
  const filtered = list.filter((s) => s.id !== scoreId);
  localHighScoresCache.set(eventId, filtered);
  saveLocalHighScores();

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

  // Clear in local cache
  localHighScoresCache.set(eventId, []);
  saveLocalHighScores();

  // Record that test scores were cleared
  testScoresClearedEvents.add(eventId);
  saveTestScoresCleared();

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
