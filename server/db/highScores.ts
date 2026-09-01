import { getSupabaseServerClient, isLocalFallbackAllowed } from '../supabase.js';
import {
  EventHighScoreRecord,
  EventLeaderboardEntry,
  EventScoreStats,
} from './types.js';
import { getEventById, getEventByPublicToken } from './events.js';
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

// In-memory cache for quick access and test fallback: Map<eventId, EventHighScoreRecord[]>
const localHighScoresCache = new Map<string, EventHighScoreRecord[]>();

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

// Initial load
loadLocalHighScores();

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
}> {
  const { event_id, metadata = {} } = params;

  if (!event_id || typeof event_id !== 'string' || event_id === 'undefined' || event_id === 'null' || !event_id.trim()) {
    const err: any = new Error('Valid event_id is required');
    err.status = 400;
    throw err;
  }

  // Verify event existence (supports UUID, token, or local id)
  let event = await getEventById(event_id, env);
  if (!event) {
    event = await getEventByPublicToken(event_id, env);
  }
  if (!event) {
    const err: any = new Error(`Event with ID or token "${event_id}" was not found`);
    err.status = 404;
    throw err;
  }

  if (event.status === 'cancelled') {
    const err: any = new Error('Cannot submit scores to a cancelled event');
    err.status = 400;
    throw err;
  }

  const resolvedEventId = event.id;

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
    metadata,
    created_at: createdAt,
  };

  // Check existing scores in cache/db to calculate rank and high score flag
  const currentHighest = currentEventScores.length > 0
    ? Math.max(...currentEventScores.map((s) => s.score))
    : 0;

  const isNewHighScore = scoreNum > currentHighest;

  // Insert into local cache
  currentEventScores.push(newRecord);
  // Sort descending by score, then ascending by created_at
  currentEventScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  localHighScoresCache.set(resolvedEventId, currentEventScores);
  saveLocalHighScores();

  // Try saving into Supabase if it's a valid UUID
  if (isUUID(resolvedEventId)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('event_high_scores')
        .insert({
          id: recordId,
          event_id: resolvedEventId,
          player_name: playerName,
          score: scoreNum,
          metadata,
          created_at: createdAt,
        })
        .select('*')
        .single();

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

  // Calculate player's 1-based rank
  const rank = currentEventScores.findIndex((s) => s.id === recordId) + 1;

  return {
    score: newRecord,
    rank: rank > 0 ? rank : 1,
    isNewHighScore,
    totalEntries: currentEventScores.length,
  };
}

/**
 * Retrieve high score leaderboard for a specific event with rank.
 * Scores from Event A NEVER appear in Event B.
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
}> {
  if (!eventId || typeof eventId !== 'string' || eventId === 'undefined' || eventId === 'null' || !eventId.trim()) {
    return { scores: [], totalCount: 0, page: 1, limit: 20 };
  }

  const limit = Math.min(Math.max(1, options.limit || 20), 100);
  const page = Math.max(1, options.page || 1);
  const offset = (page - 1) * limit;

  if (!isUUID(eventId)) {
    try {
      const ev = await getEventByPublicToken(eventId, env);
      if (ev && isUUID(ev.id)) {
        return getEventHighScores(ev.id, options, env);
      }
    } catch {
      // ignore
    }
    if (!isLocalFallbackAllowed(env)) {
      throw new Error(`Event ID "${eventId}" is not a valid UUID in production.`);
    }
    return getLocalEventHighScores(eventId, limit, page);
  }

  try {
    const supabase = getSupabaseServerClient(env);
    const { data, error, count } = await supabase
      .from('event_high_scores')
      .select('*', { count: 'exact' })
      .eq('event_id', eventId)
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Database error fetching leaderboard: ${error.message}`);
      }
      console.warn(`Notice from Supabase getEventHighScores (${error.message}). Reading from local cache.`);
      return getLocalEventHighScores(eventId, limit, page);
    }

    if (data) {
      const entries: EventLeaderboardEntry[] = data.map((item: any, idx: number) => ({
        id: item.id,
        event_id: item.event_id,
        player_name: item.player_name,
        score: item.score,
        metadata: item.metadata,
        created_at: item.created_at,
        rank: offset + idx + 1,
      }));

      return {
        scores: entries,
        totalCount: count ?? entries.length,
        page,
        limit,
      };
    }

    if (!isLocalFallbackAllowed(env)) {
      return { scores: [], totalCount: 0, page, limit };
    }
    return getLocalEventHighScores(eventId, limit, page);
  } catch (err: any) {
    if (!isLocalFallbackAllowed(env)) {
      throw err;
    }
    console.warn('Error reading high scores from Supabase, using local fallback:', err.message);
    return getLocalEventHighScores(eventId, limit, page);
  }
}

/**
 * Local cache fallback reader for high scores
 */
function getLocalEventHighScores(
  eventId: string,
  limit: number,
  page: number
): {
  scores: EventLeaderboardEntry[];
  totalCount: number;
  page: number;
  limit: number;
} {
  const allScores = localHighScoresCache.get(eventId) || [];
  // Ensure sorted by score desc, then created_at asc
  const sorted = [...allScores].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const totalCount = sorted.length;
  const offset = (page - 1) * limit;
  const pageItems = sorted.slice(offset, offset + limit);

  const scores: EventLeaderboardEntry[] = pageItems.map((item, idx) => ({
    ...item,
    rank: offset + idx + 1,
  }));

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
): Promise<EventScoreStats> {
  const { scores, totalCount } = await getEventHighScores(eventId, { limit: 1000 }, env);

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
