import crypto from 'node:crypto';
import { getSupabaseServerClient, isSupabaseConfigured, isLocalFallbackAllowed, assertProductionPricingSafe } from '../supabase.js';
import { GamePricingRecord, GamePricingTier } from './types.js';

export interface CreateGamePricingParams {
  min_days: number;
  max_days?: number | null;
  price: number;
  currency?: string;
  is_active?: boolean;
  is_base?: boolean;
}

export interface UpdateGamePricingParams {
  min_days?: number;
  max_days?: number | null;
  price?: number;
  currency?: string;
  is_active?: boolean;
  is_base?: boolean;
}

export interface ResolvedGamePriceQuote {
  price: number;
  currency: string;
  tierId: string;
  tier: GamePricingRecord;
  ruleLabel: string;
  durationDays: number;
}

// Canonical default pricing templates for the core games
export const DEFAULT_GAME_PRICING_TEMPLATES: Record<string, Array<{ min_days: number; max_days: number | null; price: number; is_base: boolean }>> = {
  'catch-brand': [
    { min_days: 1, max_days: 1, price: 1400.00, is_base: true },
    { min_days: 2, max_days: 2, price: 1900.00, is_base: false },
    { min_days: 3, max_days: 3, price: 2200.00, is_base: false },
    { min_days: 4, max_days: 4, price: 2400.00, is_base: false },
    { min_days: 5, max_days: 5, price: 2500.00, is_base: false },
    { min_days: 6, max_days: 6, price: 2600.00, is_base: false },
    { min_days: 7, max_days: 7, price: 2800.00, is_base: false },
    { min_days: 8, max_days: 14, price: 3500.00, is_base: false },
    { min_days: 15, max_days: 30, price: 4500.00, is_base: false },
    { min_days: 31, max_days: 60, price: 6000.00, is_base: false },
    { min_days: 61, max_days: 90, price: 8000.00, is_base: false },
    { min_days: 91, max_days: null, price: 10000.00, is_base: false },
  ],
  'memory-match': [
    { min_days: 1, max_days: 1, price: 1200.00, is_base: true },
    { min_days: 2, max_days: 2, price: 1600.00, is_base: false },
    { min_days: 3, max_days: 3, price: 1900.00, is_base: false },
    { min_days: 4, max_days: 4, price: 2100.00, is_base: false },
    { min_days: 5, max_days: 5, price: 2300.00, is_base: false },
    { min_days: 6, max_days: 6, price: 2400.00, is_base: false },
    { min_days: 7, max_days: 7, price: 2600.00, is_base: false },
    { min_days: 8, max_days: 14, price: 3200.00, is_base: false },
    { min_days: 15, max_days: 30, price: 4200.00, is_base: false },
    { min_days: 31, max_days: 60, price: 5500.00, is_base: false },
    { min_days: 61, max_days: 90, price: 7500.00, is_base: false },
    { min_days: 91, max_days: null, price: 9500.00, is_base: false },
  ],
  'reaction-tap': [
    { min_days: 1, max_days: 1, price: 1000.00, is_base: true },
    { min_days: 2, max_days: 2, price: 1400.00, is_base: false },
    { min_days: 3, max_days: 3, price: 1700.00, is_base: false },
    { min_days: 4, max_days: 4, price: 1900.00, is_base: false },
    { min_days: 5, max_days: 5, price: 2000.00, is_base: false },
    { min_days: 6, max_days: 6, price: 2200.00, is_base: false },
    { min_days: 7, max_days: 7, price: 2400.00, is_base: false },
    { min_days: 8, max_days: 14, price: 3000.00, is_base: false },
    { min_days: 15, max_days: 30, price: 4000.00, is_base: false },
    { min_days: 31, max_days: 60, price: 5000.00, is_base: false },
    { min_days: 61, max_days: 90, price: 7000.00, is_base: false },
    { min_days: 91, max_days: null, price: 9000.00, is_base: false },
  ],
};

// In-memory cache for fast lookups and local/test development
export const localGamePricingCache = new Map<string, GamePricingRecord[]>();

/**
 * Format a human-readable duration label for a pricing tier
 */
export function formatPricingDurationLabel(minDays: number, maxDays: number | null): string {
  if (minDays === maxDays) {
    return `${minDays} day${minDays > 1 ? 's' : ''}`;
  }
  if (maxDays === null) {
    return `${minDays}+ days`;
  }
  return `${minDays}–${maxDays} days`;
}

/**
 * Build default pricing tiers for a game
 */
export function buildDefaultPricingTiers(gameId: string, gameTypeOrSlug?: string): GamePricingRecord[] {
  const normKey = String(gameTypeOrSlug || 'catch-brand').toLowerCase();
  let templateKey = 'catch-brand';
  if (normKey.includes('memory')) {
    templateKey = 'memory-match';
  } else if (normKey.includes('reaction')) {
    templateKey = 'reaction-tap';
  }

  const template = DEFAULT_GAME_PRICING_TEMPLATES[templateKey] || DEFAULT_GAME_PRICING_TEMPLATES['catch-brand'];
  const now = new Date().toISOString();

  return template.map((tier) => ({
    id: crypto.randomUUID(),
    game_id: gameId,
    min_days: tier.min_days,
    max_days: tier.max_days,
    price: tier.price,
    currency: 'MYR',
    is_active: true,
    is_base: tier.is_base,
    created_at: now,
    updated_at: now,
  }));
}

/**
 * Retrieve all pricing tiers for a specific game
 */
export async function getGamePricing(gameId: string, env?: any): Promise<GamePricingRecord[]> {
  if (!gameId) {
    throw new Error('Game ID is required to fetch game pricing.');
  }

  assertProductionPricingSafe(env);

  const supabase = getSupabaseServerClient(env);
  if (supabase && isSupabaseConfigured(env)) {
    try {
      const { data, error } = await supabase
        .from('game_pricing')
        .select('*')
        .eq('game_id', gameId)
        .order('min_days', { ascending: true });

      if (error) {
        console.error('Error fetching game_pricing from Supabase:', error);
        throw {
          status: 503,
          code: 'PRICING_SERVICE_UNAVAILABLE',
          message: 'Pricing service temporarily unavailable. Please try again or contact support.',
        };
      }

      if (data && data.length > 0) {
        const sorted = data.map((d: any) => ({
          id: d.id,
          game_id: d.game_id,
          min_days: Number(d.min_days),
          max_days: d.max_days !== null && d.max_days !== undefined ? Number(d.max_days) : null,
          price: Number(d.price),
          currency: d.currency || 'MYR',
          is_active: Boolean(d.is_active),
          is_base: Boolean(d.is_base),
          created_at: d.created_at,
          updated_at: d.updated_at,
        }));
        localGamePricingCache.set(gameId, sorted);
        return sorted;
      }

      // If no pricing found in DB for this game, return empty array (do NOT auto-seed)
      localGamePricingCache.set(gameId, []);
      return [];
    } catch (err: any) {
      if (err?.status === 503 || err?.code === 'NO_PRICING_TIER') throw err;
      console.error('Supabase query exception in getGamePricing:', err);
      throw {
        status: 503,
        code: 'PRICING_SERVICE_UNAVAILABLE',
        message: 'Pricing service temporarily unavailable. Please try again or contact support.',
      };
    }
  }

  // Local/Test mode fallback
  if (isLocalFallbackAllowed(env)) {
    if (!localGamePricingCache.has(gameId)) {
      const canonicalGames = ['catch-brand', 'memory-match', 'reaction-tap'];
      const rawSlug = gameId.replace(/^game-/, '');
      if (canonicalGames.includes(gameId) || canonicalGames.includes(rawSlug)) {
        const defaults = buildDefaultPricingTiers(gameId);
        localGamePricingCache.set(gameId, defaults);
      } else {
        localGamePricingCache.set(gameId, []);
      }
    }
    return localGamePricingCache.get(gameId) || [];
  }

  throw {
    status: 503,
    code: 'PRICING_SERVICE_UNAVAILABLE',
    message: 'Pricing service temporarily unavailable: database is unconfigured in production mode.',
  };
}

/**
 * Retrieve active pricing tiers for a specific game
 */
export async function getActiveGamePricing(gameId: string, env?: any): Promise<GamePricingRecord[]> {
  const allTiers = await getGamePricing(gameId, env);
  return allTiers.filter((t) => t.is_active);
}

/**
 * Retrieve a specific game pricing tier by its primary key ID.
 */
export async function getGamePricingTierById(tierId: string, env?: any): Promise<GamePricingRecord | null> {
  if (!tierId) return null;

  assertProductionPricingSafe(env);

  const supabase = getSupabaseServerClient(env);
  if (supabase && isSupabaseConfigured(env)) {
    try {
      const { data, error } = await supabase
        .from('game_pricing')
        .select('*')
        .eq('id', tierId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching game_pricing tier by ID from Supabase:', error);
        throw {
          status: 503,
          code: 'PRICING_SERVICE_UNAVAILABLE',
          message: 'Pricing service temporarily unavailable. Please try again or contact support.',
        };
      }

      if (!data) return null;

      return {
        id: data.id,
        game_id: data.game_id,
        min_days: Number(data.min_days),
        max_days: data.max_days !== null && data.max_days !== undefined ? Number(data.max_days) : null,
        price: Number(data.price),
        currency: data.currency || 'MYR',
        is_active: Boolean(data.is_active),
        is_base: Boolean(data.is_base),
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    } catch (err: any) {
      if (err?.status === 503 || err?.code === 'PRICING_SERVICE_UNAVAILABLE') throw err;
      console.error('Supabase query exception in getGamePricingTierById:', err);
      throw {
        status: 503,
        code: 'PRICING_SERVICE_UNAVAILABLE',
        message: 'Pricing service temporarily unavailable. Please try again or contact support.',
      };
    }
  }

  // Local/Test mode fallback
  if (isLocalFallbackAllowed()) {
    for (const tiers of localGamePricingCache.values()) {
      const found = tiers.find((t) => t.id === tierId);
      if (found) return found;
    }
    const canonicalGames = ['catch-brand', 'memory-match', 'reaction-tap'];
    for (const gid of canonicalGames) {
      if (!localGamePricingCache.has(gid)) {
        const defaults = buildDefaultPricingTiers(gid);
        localGamePricingCache.set(gid, defaults);
        const found = defaults.find((t) => t.id === tierId);
        if (found) return found;
      }
    }
    return null;
  }

  throw {
    status: 503,
    code: 'PRICING_SERVICE_UNAVAILABLE',
    message: 'Pricing service temporarily unavailable: database is unconfigured in production mode.',
  };
}

/**
 * Authoritatively resolves a game's price for a given duration in calendar days.
 * Never trusts any client-provided price!
 * Fails closed if no active pricing tier covers the requested duration.
 */
export async function resolveGamePrice(
  gameId: string,
  durationDays: number,
  env?: any
): Promise<ResolvedGamePriceQuote> {
  if (!gameId) {
    throw {
      status: 400,
      code: 'GAME_ID_REQUIRED',
      message: 'A valid game ID is required to calculate event pricing.',
    };
  }

  const days = Math.max(1, Math.floor(Number(durationDays) || 1));
  const activeTiers = await getActiveGamePricing(gameId, env);

  if (!activeTiers || activeTiers.length === 0) {
    throw {
      status: 422,
      code: 'NO_PRICING_TIER',
      message: 'No pricing is configured for this game. Please contact the administrator.',
    };
  }

  // Find exact tier where min_days <= days and (max_days is null or max_days >= days)
  const matchedTiers = activeTiers.filter((t) => {
    if (days < t.min_days) return false;
    if (t.max_days === null || t.max_days === undefined) return true;
    return days <= t.max_days;
  });

  if (matchedTiers.length > 1) {
    console.error(`Multiple active pricing tiers match duration ${days} days for game ${gameId}:`, matchedTiers);
    throw {
      status: 409,
      code: 'AMBIGUOUS_PRICING_TIER',
      message: `Multiple active pricing tiers match duration of ${days} days for this game. Overlapping active tiers must be resolved in Developer Settings.`,
    };
  }

  const matchedTier = matchedTiers[0];

  // Business Rule: If no tier matches or price is invalid, FAIL CLOSED.
  // Never fall back to base tier, largest tier, or default price.
  if (!matchedTier || matchedTier.price <= 0) {
    throw {
      status: 422,
      code: 'NO_PRICING_TIER',
      message: `No pricing tier is configured for a ${days}-day event for this game.`,
    };
  }

  const ruleLabel = formatPricingDurationLabel(matchedTier.min_days, matchedTier.max_days);

  return {
    price: Number(matchedTier.price),
    currency: matchedTier.currency || 'MYR',
    tierId: matchedTier.id,
    tier: matchedTier,
    ruleLabel,
    durationDays: days,
  };
}

/**
 * Determines whether two duration ranges overlap.
 * Both ranges are inclusive: [min, max].
 * If max is null or undefined, the range is unbounded [min, +infinity).
 */
export function doPricingRangesOverlap(
  minA: number,
  maxA: number | null | undefined,
  minB: number,
  maxB: number | null | undefined
): boolean {
  const effectiveMaxA = (maxA === null || maxA === undefined) ? Infinity : maxA;
  const effectiveMaxB = (maxB === null || maxB === undefined) ? Infinity : maxB;
  return minA <= effectiveMaxB && minB <= effectiveMaxA;
}

/**
 * Validates that a proposed pricing tier range does not overlap with any other active tier for the same game.
 * Throws an OVERLAPPING_PRICING_TIER error (status 409) if an overlap is detected.
 */
export async function validateNoOverlappingPricingTier(
  gameId: string,
  minDays: number,
  maxDays: number | null | undefined,
  excludeTierId?: string,
  env?: any
): Promise<void> {
  const allTiers = await getGamePricing(gameId, env);
  const activeTiers = allTiers.filter(
    (t) => t.is_active && (!excludeTierId || t.id !== excludeTierId)
  );

  const conflicting = activeTiers.find((t) =>
    doPricingRangesOverlap(minDays, maxDays, t.min_days, t.max_days)
  );

  if (conflicting) {
    const newLabel = formatPricingDurationLabel(minDays, maxDays ?? null);
    const existingLabel = formatPricingDurationLabel(conflicting.min_days, conflicting.max_days);
    throw {
      status: 409,
      code: 'OVERLAPPING_PRICING_TIER',
      message: `Pricing tier range (${newLabel}) overlaps with existing active tier (${existingLabel}) for this game. Overlapping active ranges are not permitted.`,
    };
  }
}

/**
 * Create a new pricing tier for a game
 */
export async function createGamePricingTier(
  gameId: string,
  params: CreateGamePricingParams,
  env?: any
): Promise<GamePricingRecord> {
  const minDays = Math.max(1, Math.floor(Number(params.min_days) || 1));
  let maxDays: number | null = null;
  if (params.max_days !== null && params.max_days !== undefined) {
    const parsedMax = Math.floor(Number(params.max_days));
    if (isNaN(parsedMax) || parsedMax < minDays) {
      throw {
        status: 400,
        code: 'INVALID_DURATION_RANGE',
        message: 'Maximum days must be greater than or equal to minimum days.',
      };
    }
    maxDays = parsedMax;
  }
  const price = Number(params.price);
  const currency = String(params.currency || 'MYR').trim().toUpperCase();
  const isActive = params.is_active !== undefined ? Boolean(params.is_active) : true;
  const isBase = Boolean(params.is_base);

  if (isNaN(price) || price <= 0) {
    throw {
      status: 400,
      code: 'INVALID_PRICE',
      message: 'Price must be a positive number greater than zero.',
    };
  }

  // Reject overlapping active ranges for the same game
  if (isActive) {
    await validateNoOverlappingPricingTier(gameId, minDays, maxDays, undefined, env);
  }

  const supabase = getSupabaseServerClient(env);
  if (supabase && isSupabaseConfigured(env)) {
    // If setting as base, unset previous base
    if (isBase) {
      await supabase
        .from('game_pricing')
        .update({ is_base: false })
        .eq('game_id', gameId);
    }

    const { data, error } = await supabase
      .from('game_pricing')
      .insert({
        game_id: gameId,
        min_days: minDays,
        max_days: maxDays,
        price,
        currency,
        is_active: isActive,
        is_base: isBase,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('Failed to create game pricing tier:', error);
      if (
        error?.message &&
        (error.message.includes('overlaps with existing active tier') ||
          error.message.includes('OVERLAPPING_PRICING_TIER'))
      ) {
        throw {
          status: 409,
          code: 'OVERLAPPING_PRICING_TIER',
          message: error.message.replace(/^.*ERROR:\s*/, '').trim(),
        };
      }
      throw {
        status: 500,
        code: 'CREATE_PRICING_FAILED',
        message: 'Failed to create game pricing tier: ' + (error?.message || 'Unknown error'),
      };
    }

    // Invalidate local cache
    localGamePricingCache.delete(gameId);
    return {
      id: data.id,
      game_id: data.game_id,
      min_days: Number(data.min_days),
      max_days: data.max_days !== null && data.max_days !== undefined ? Number(data.max_days) : null,
      price: Number(data.price),
      currency: data.currency || 'MYR',
      is_active: Boolean(data.is_active),
      is_base: Boolean(data.is_base),
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  // Local fallback
  const existing = localGamePricingCache.get(gameId) || [];
  if (isBase) {
    existing.forEach((t) => (t.is_base = false));
  }
  const now = new Date().toISOString();
  const newTier: GamePricingRecord = {
    id: crypto.randomUUID(),
    game_id: gameId,
    min_days: minDays,
    max_days: maxDays,
    price,
    currency,
    is_active: isActive,
    is_base: isBase,
    created_at: now,
    updated_at: now,
  };
  existing.push(newTier);
  existing.sort((a, b) => a.min_days - b.min_days);
  localGamePricingCache.set(gameId, existing);
  return newTier;
}

/**
 * Update an existing pricing tier
 */
export async function updateGamePricingTier(
  tierId: string,
  params: UpdateGamePricingParams,
  env?: any
): Promise<GamePricingRecord> {
  const existingTier = await getGamePricingTierById(tierId, env);
  if (!existingTier) {
    throw { status: 404, code: 'TIER_NOT_FOUND', message: 'Pricing tier not found.' };
  }

  const gameId = existingTier.game_id;
  const targetMinDays = params.min_days !== undefined ? Math.max(1, Math.floor(Number(params.min_days))) : existingTier.min_days;
  let targetMaxDays = existingTier.max_days;
  if (params.max_days !== undefined) {
    if (params.max_days === null) {
      targetMaxDays = null;
    } else {
      const parsedMax = Math.floor(Number(params.max_days));
      if (isNaN(parsedMax) || parsedMax < targetMinDays) {
        throw {
          status: 400,
          code: 'INVALID_DURATION_RANGE',
          message: 'Maximum days must be greater than or equal to minimum days.',
        };
      }
      targetMaxDays = parsedMax;
    }
  } else if (targetMaxDays !== null && targetMaxDays < targetMinDays) {
    throw {
      status: 400,
      code: 'INVALID_DURATION_RANGE',
      message: 'Maximum days must be greater than or equal to minimum days.',
    };
  }

  const targetIsActive = params.is_active !== undefined ? Boolean(params.is_active) : existingTier.is_active;

  // Reject overlapping active ranges for the same game
  if (targetIsActive) {
    await validateNoOverlappingPricingTier(gameId, targetMinDays, targetMaxDays, tierId, env);
  }

  const supabase = getSupabaseServerClient(env);
  if (supabase && isSupabaseConfigured(env)) {
    // If setting as base, unset previous base
    if (params.is_base === true) {
      await supabase
        .from('game_pricing')
        .update({ is_base: false })
        .eq('game_id', gameId);
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (params.min_days !== undefined) updatePayload.min_days = targetMinDays;
    if (params.max_days !== undefined) updatePayload.max_days = targetMaxDays;
    if (params.price !== undefined) {
      const p = Number(params.price);
      if (isNaN(p) || p <= 0) throw { status: 400, code: 'INVALID_PRICE', message: 'Price must be greater than zero.' };
      updatePayload.price = p;
    }
    if (params.currency !== undefined) updatePayload.currency = String(params.currency).trim().toUpperCase();
    if (params.is_active !== undefined) updatePayload.is_active = targetIsActive;
    if (params.is_base !== undefined) updatePayload.is_base = Boolean(params.is_base);

    const { data, error } = await supabase
      .from('game_pricing')
      .update(updatePayload)
      .eq('id', tierId)
      .select('*')
      .single();

    if (error || !data) {
      if (
        error?.message &&
        (error.message.includes('overlaps with existing active tier') ||
          error.message.includes('OVERLAPPING_PRICING_TIER'))
      ) {
        throw {
          status: 409,
          code: 'OVERLAPPING_PRICING_TIER',
          message: error.message.replace(/^.*ERROR:\s*/, '').trim(),
        };
      }
      throw {
        status: 500,
        code: 'UPDATE_PRICING_FAILED',
        message: 'Failed to update pricing tier: ' + (error?.message || 'Unknown error'),
      };
    }

    localGamePricingCache.delete(data.game_id);
    return {
      id: data.id,
      game_id: data.game_id,
      min_days: Number(data.min_days),
      max_days: data.max_days !== null && data.max_days !== undefined ? Number(data.max_days) : null,
      price: Number(data.price),
      currency: data.currency || 'MYR',
      is_active: Boolean(data.is_active),
      is_base: Boolean(data.is_base),
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  // Local fallback
  for (const [gId, tiers] of localGamePricingCache.entries()) {
    const tier = tiers.find((t) => t.id === tierId);
    if (tier) {
      if (params.is_base === true) {
        tiers.forEach((t) => (t.is_base = false));
      }
      tier.min_days = targetMinDays;
      tier.max_days = targetMaxDays;
      if (params.price !== undefined) tier.price = Number(params.price);
      if (params.currency !== undefined) tier.currency = String(params.currency).trim().toUpperCase();
      tier.is_active = targetIsActive;
      if (params.is_base !== undefined) tier.is_base = Boolean(params.is_base);
      tier.updated_at = new Date().toISOString();
      tiers.sort((a, b) => a.min_days - b.min_days);
      return tier;
    }
  }

  throw { status: 404, code: 'TIER_NOT_FOUND', message: 'Pricing tier not found.' };
}

/**
 * Delete a pricing tier
 */
export async function deleteGamePricingTier(tierId: string, env?: any): Promise<boolean> {
  const supabase = getSupabaseServerClient(env);
  if (supabase && isSupabaseConfigured(env)) {
    const { data: tierData } = await supabase
      .from('game_pricing')
      .select('game_id')
      .eq('id', tierId)
      .single();

    const { error } = await supabase.from('game_pricing').delete().eq('id', tierId);
    if (error) {
      throw {
        status: 500,
        code: 'DELETE_PRICING_FAILED',
        message: 'Failed to delete pricing tier: ' + error.message,
      };
    }
    if (tierData?.game_id) {
      localGamePricingCache.delete(tierData.game_id);
    }
    return true;
  }

  // Local fallback
  for (const [gId, tiers] of localGamePricingCache.entries()) {
    const idx = tiers.findIndex((t) => t.id === tierId);
    if (idx !== -1) {
      tiers.splice(idx, 1);
      return true;
    }
  }
  return false;
}

/**
 * Set the base / 1-day price for a game
 */
export async function setGameBasePrice(
  gameId: string,
  price: number,
  currency: string = 'MYR',
  env?: any
): Promise<GamePricingRecord> {
  const validPrice = Number(price);
  if (isNaN(validPrice) || validPrice <= 0) {
    throw { status: 400, message: 'Base price must be greater than zero.' };
  }

  const existingTiers = await getGamePricing(gameId, env);
  const baseTier = existingTiers.find((t) => t.min_days === 1 && t.max_days === 1) || existingTiers.find((t) => t.is_base);

  if (baseTier) {
    return updateGamePricingTier(
      baseTier.id,
      {
        price: validPrice,
        currency,
        is_base: true,
        is_active: true,
      },
      env
    );
  }

  return createGamePricingTier(
    gameId,
    {
      min_days: 1,
      max_days: 1,
      price: validPrice,
      currency,
      is_base: true,
      is_active: true,
    },
    env
  );
}

/**
 * Bulk upsert / replace pricing tiers for a game
 */
export async function bulkUpsertGamePricing(
  gameId: string,
  tiers: Array<{
    id?: string;
    min_days: number;
    max_days?: number | null;
    price: number;
    currency?: string;
    is_active?: boolean;
    is_base?: boolean;
  }>,
  env?: any
): Promise<GamePricingRecord[]> {
  if (!gameId) {
    throw new Error('Game ID is required for bulk pricing upsert');
  }

  // Pre-validate that incoming active tiers do not overlap among themselves
  const activeIncoming = tiers.filter((t) => t.is_active !== false);
  for (let i = 0; i < activeIncoming.length; i++) {
    for (let j = i + 1; j < activeIncoming.length; j++) {
      const a = activeIncoming[i];
      const b = activeIncoming[j];
      const aMin = Math.max(1, Math.floor(Number(a.min_days) || 1));
      const aMax = a.max_days !== null && a.max_days !== undefined ? Math.floor(Number(a.max_days)) : null;
      const bMin = Math.max(1, Math.floor(Number(b.min_days) || 1));
      const bMax = b.max_days !== null && b.max_days !== undefined ? Math.floor(Number(b.max_days)) : null;

      if (doPricingRangesOverlap(aMin, aMax, bMin, bMax)) {
        const labelA = formatPricingDurationLabel(aMin, aMax);
        const labelB = formatPricingDurationLabel(bMin, bMax);
        throw {
          status: 409,
          code: 'OVERLAPPING_PRICING_TIER',
          message: `Bulk pricing update contains overlapping active ranges: (${labelA}) and (${labelB}). Overlapping active ranges are not permitted.`,
        };
      }
    }
  }

  const results: GamePricingRecord[] = [];
  for (const t of tiers) {
    if (t.id) {
      try {
        const updated = await updateGamePricingTier(t.id, t, env);
        results.push(updated);
        continue;
      } catch (err: any) {
        if (err?.code === 'OVERLAPPING_PRICING_TIER' || err?.status === 409) {
          throw err;
        }
        // If not found or other non-overlap error, fall through to create
      }
    }
    const created = await createGamePricingTier(gameId, t, env);
    results.push(created);
  }

  return results;
}

/**
 * Ensure default pricing tiers are seeded for a game if none exist
 */
export async function ensureDefaultGamePricing(
  gameId: string,
  gameTypeOrSlug?: string,
  env?: any
): Promise<GamePricingRecord[]> {
  const supabase = getSupabaseServerClient(env);
  if (supabase && isSupabaseConfigured(env)) {
    // Check if tiers already exist
    const { data: existing } = await supabase
      .from('game_pricing')
      .select('*')
      .eq('game_id', gameId)
      .order('min_days', { ascending: true });

    if (existing && existing.length > 0) {
      return existing.map((d: any) => ({
        id: d.id,
        game_id: d.game_id,
        min_days: Number(d.min_days),
        max_days: d.max_days !== null && d.max_days !== undefined ? Number(d.max_days) : null,
        price: Number(d.price),
        currency: d.currency || 'MYR',
        is_active: Boolean(d.is_active),
        is_base: Boolean(d.is_base),
        created_at: d.created_at,
        updated_at: d.updated_at,
      }));
    }

    // Determine game type if not provided
    let slug = gameTypeOrSlug;
    if (!slug) {
      const { data: g } = await supabase.from('games').select('slug, game_type').eq('id', gameId).single();
      slug = g?.slug || g?.game_type || 'catch-brand';
    }

    const defaultTiers = buildDefaultPricingTiers(gameId, slug);
    const insertPayload = defaultTiers.map((t) => ({
      game_id: t.game_id,
      min_days: t.min_days,
      max_days: t.max_days,
      price: t.price,
      currency: t.currency,
      is_active: t.is_active,
      is_base: t.is_base,
    }));

    const { data: inserted, error } = await supabase
      .from('game_pricing')
      .insert(insertPayload)
      .select('*')
      .order('min_days', { ascending: true });

    if (error || !inserted) {
      console.warn('Could not insert default game pricing:', error);
      return defaultTiers;
    }

    const mapped = inserted.map((d: any) => ({
      id: d.id,
      game_id: d.game_id,
      min_days: Number(d.min_days),
      max_days: d.max_days !== null && d.max_days !== undefined ? Number(d.max_days) : null,
      price: Number(d.price),
      currency: d.currency || 'MYR',
      is_active: Boolean(d.is_active),
      is_base: Boolean(d.is_base),
      created_at: d.created_at,
      updated_at: d.updated_at,
    }));
    localGamePricingCache.set(gameId, mapped);
    return mapped;
  }

  // Local fallback
  if (!localGamePricingCache.has(gameId)) {
    const defaults = buildDefaultPricingTiers(gameId, gameTypeOrSlug);
    localGamePricingCache.set(gameId, defaults);
  }
  return localGamePricingCache.get(gameId) || [];
}
