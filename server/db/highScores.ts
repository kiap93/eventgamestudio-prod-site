import { getSupabaseServerClient } from '../supabase.js';
import {
  EventHighScoreRecord,
  EventLeaderboardEntry,
  EventScoreStats,
} from './types.js';
import { getEventById } from './events.js';
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

  if (!event_id || typeof event_id !== 'string') {
    throw new Error('Valid event_id is required');
  }

  // Verify event existence
  const event = await getEventById(event_id, env);
  if (!event) {
    throw new Error(`Event with ID "${event_id}" was not found`);
  }

  if (event.status === 'cancelled') {
    throw new Error('Cannot submit scores to a cancelled event');
  }

  // Validate score: must be a non-negative integer
  const scoreNum = Math.floor(Number(params.score));
  if (isNaN(scoreNum) || scoreNum < 0) {
    throw new Error('Score must be a non-negative integer');
  }
  // Sanity upper bound (e.g. 1,000,000 max achievable in game session)
  if (scoreNum > 1000000) {
    throw new Error('Score exceeds maximum allowed session threshold');
  }

  const playerName = sanitizePlayerName(params.player_name);
  const recordId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const newRecord: EventHighScoreRecord = {
    id: recordId,
    event_id,
    player_name: playerName,
    score: scoreNum,
    metadata,
    created_at: createdAt,
  };

  // Check existing scores in cache/db to calculate rank and high score flag
  let currentEventScores = localHighScoresCache.get(event_id) || [];
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
  localHighScoresCache.set(event_id, currentEventScores);
  saveLocalHighScores();

  // Try saving into Supabase
  try {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('event_high_scores')
      .insert({
        id: recordId,
        event_id,
        player_name: playerName,
        score: scoreNum,
        metadata,
        created_at: createdAt,
      })
      .select('*')
      .single();

    if (error) {
      console.warn(`Notice from Supabase high score insert (${error.message}). Saved to local fallback store.`);
    }
  } catch (err: any) {
    console.warn('Supabase high score insert fallback notice:', err.message);
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
  if (!eventId) {
    return { scores: [], totalCount: 0, page: 1, limit: 20 };
  }

  const limit = Math.min(Math.max(1, options.limit || 20), 100);
  const page = Math.max(1, options.page || 1);
  const offset = (page - 1) * limit;

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

    return getLocalEventHighScores(eventId, limit, page);
  } catch (err: any) {
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
    };
  }

  const uniquePlayerNames = new Set(scores.map((s) => s.player_name.toLowerCase()));
  const highScore = Math.max(...scores.map((s) => s.score));
  const sumScores = scores.reduce((acc, s) => acc + s.score, 0);
  const averageScore = Math.round(sumScores / scores.length);

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
  if (!eventId || !scoreId) return false;

  // Remove from local cache
  const list = localHighScoresCache.get(eventId) || [];
  const filtered = list.filter((s) => s.id !== scoreId);
  localHighScoresCache.set(eventId, filtered);
  saveLocalHighScores();

  // Remove from Supabase
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

  return true;
}

/**
 * Clear all high scores for an event (Leaderboard reset action)
 */
export async function clearEventHighScores(
  eventId: string,
  env?: Record<string, any>
): Promise<boolean> {
  if (!eventId) return false;

  // Clear in local cache
  localHighScoresCache.set(eventId, []);
  saveLocalHighScores();

  // Clear in Supabase
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

  return true;
}
