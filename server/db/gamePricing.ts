import crypto from 'node:crypto';
import { getSupabaseServerClient, isSupabaseConfigured, isLocalFallbackAllowed, assertProductionPricingSafe } from '../supabase.js';
import { GamePricingRecord, GamePricingTier } from './types.js';
import { getAllPlatformGames } from './games.js';
import { getDefaultPricingCountry, DEFAULT_PRICING_COUNTRY } from './platformSettings.js';
import { getCurrencyForCountry, isValidCountryCode } from '../../src/lib/countryUtils.js';
import { executeWithResilience } from './supabaseResilience.js';
import { recordDbOperation } from './dbMetrics.js';

export interface CreateGamePricingParams {
  min_days: number;
  max_days?: number | null;
  price: number;
  currency?: string;
  country_code?: string;
  is_active?: boolean;
  is_base?: boolean;
}

export interface UpdateGamePricingParams {
  min_days?: number;
  max_days?: number | null;
  price?: number;
  currency?: string;
  country_code?: string;
  is_active?: boolean;
  is_base?: boolean;
}

export interface ResolvedGamePriceSuccess {
  success: true;
  price: number;
  currency: string;
  pricingId: string;
  tierId: string;
  tier: GamePricingRecord;
  ruleLabel: string;
  durationDays: number;
  requestedCountry: string;
  pricingCountry: string;
  isFallback: boolean;
  fallbackLevel: 0 | 1 | 2;
  message?: string;
  error?: undefined;
}

export interface ResolvedGamePriceFailure {
  success: false;
  price?: undefined;
  currency?: undefined;
  pricingId?: undefined;
  tierId?: undefined;
  tier?: undefined;
  ruleLabel?: undefined;
  durationDays?: number;
  error: 'NO_PRICING_TIER' | 'AMBIGUOUS_PRICING_TIER' | 'GAME_ID_REQUIRED' | 'PRICING_SERVICE_UNAVAILABLE' | string;
  message?: string;
  requestedCountry: string;
  pricingCountry: string | null;
  isFallback: boolean;
  fallbackLevel?: null;
  defaultCountry?: string;
  status?: number;
  code?: string;
}

export type ResolvedGamePriceQuote = ResolvedGamePriceSuccess | ResolvedGamePriceFailure;

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
  'match-3': [
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
export function buildDefaultPricingTiers(
  gameId: string,
  gameTypeOrSlug?: string,
  countryCode?: string,
  currency?: string
): GamePricingRecord[] {
  const normKey = String(gameTypeOrSlug || gameId || 'catch-brand').toLowerCase();
  let templateKey = 'catch-brand';
  if (normKey.includes('match-3') || normKey.includes('match3')) {
    templateKey = 'match-3';
  } else if (normKey.includes('memory')) {
    templateKey = 'memory-match';
  } else if (normKey.includes('reaction')) {
    templateKey = 'reaction-tap';
  }

  const template = DEFAULT_GAME_PRICING_TEMPLATES[templateKey] || DEFAULT_GAME_PRICING_TEMPLATES['catch-brand'];
  const now = new Date().toISOString();
  const cCode = countryCode ? countryCode.trim().toUpperCase() : DEFAULT_PRICING_COUNTRY;
  const curr = currency ? currency.trim().toUpperCase() : (getCurrencyForCountry(cCode) || 'USD');

  return template.map((tier) => ({
    id: crypto.randomUUID(),
    game_id: gameId,
    country_code: cCode,
    min_days: tier.min_days,
    max_days: tier.max_days,
    price: tier.price,
    currency: curr,
    is_active: true,
    is_base: tier.is_base,
    created_at: now,
    updated_at: now,
  }));
}

/**
 * Retrieve pricing tiers for a specific game, optionally filtered by country.
 */
export async function getGamePricing(
  gameId: string,
  countryOrEnv?: string | any,
  env?: any
): Promise<GamePricingRecord[]> {
  if (!gameId) {
    throw new Error('Game ID is required to fetch game pricing.');
  }

  let filterCountry: string | undefined = undefined;
  let actualEnv: any = env;

  if (typeof countryOrEnv === 'string') {
    filterCountry = countryOrEnv.trim().toUpperCase();
  } else if (countryOrEnv && typeof countryOrEnv === 'object') {
    actualEnv = countryOrEnv;
  }

  assertProductionPricingSafe(actualEnv);

  // In local dev/test, if explicit mock tiers were seeded into cache, use them immediately
  if (isLocalFallbackAllowed(actualEnv) && localGamePricingCache.has(gameId)) {
    const cached = localGamePricingCache.get(gameId) || [];
    const normalized = cached.map((t) => {
      let cCode = (t.country_code || '').trim().toUpperCase();
      if (!cCode && t.currency === 'MYR') {
        cCode = 'MY';
      }
      return {
        ...t,
        country_code: cCode,
        currency: t.currency || (cCode ? getCurrencyForCountry(cCode) : undefined) || 'USD',
      };
    });
    return filterCountry
      ? normalized.filter((t) => (t.country_code || '').toUpperCase() === filterCountry)
      : normalized;
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId);
  const supabase = getSupabaseServerClient(actualEnv);
  if (supabase && isSupabaseConfigured(actualEnv) && isUuid) {
    try {
      const { data, error } = await executeWithResilience(
        async () => {
          let query = supabase
            .from('game_pricing')
            .select('id, game_id, country_code, min_days, max_days, price, currency, is_active, is_base')
            .eq('game_id', gameId);

          if (filterCountry) {
            query = query.eq('country_code', filterCountry);
          }

          return await query.order('min_days', { ascending: true });
        },
        {
          operation: 'getGamePricing',
          maxRetries: 3,
          initialDelayMs: 200,
          env: actualEnv,
        }
      );

      if (error) {
        console.error('Error fetching game_pricing from Supabase:', error);
        throw {
          status: 503,
          code: 'PRICING_SERVICE_UNAVAILABLE',
          message: 'Pricing service temporarily unavailable. Please try again or contact support.',
        };
      }

      if (data && data.length > 0) {
        const sorted = data.map((d: any) => {
          let cCode = d.country_code ? String(d.country_code).trim().toUpperCase() : '';
          if (!cCode && d.currency === 'MYR') {
            cCode = 'MY';
          }
          return {
            id: d.id,
            game_id: d.game_id,
            country_code: cCode,
            min_days: Number(d.min_days),
            max_days: d.max_days !== null && d.max_days !== undefined ? Number(d.max_days) : null,
            price: Number(d.price),
            currency: d.currency || (cCode ? getCurrencyForCountry(cCode) : undefined) || '',
            is_active: Boolean(d.is_active),
            is_base: Boolean(d.is_base),
            created_at: d.created_at,
            updated_at: d.updated_at,
          };
        });
        if (!filterCountry) {
          localGamePricingCache.set(gameId, sorted);
        }
        return sorted;
      }

      // In local dev/test, if explicit mock tiers were seeded into cache, use them
      if (isLocalFallbackAllowed(actualEnv) && localGamePricingCache.has(gameId)) {
        const cached = localGamePricingCache.get(gameId) || [];
        if (cached.length > 0) {
          const normalized = cached.map((t) => {
            let cCode = (t.country_code || '').trim().toUpperCase();
            if (!cCode && t.currency === 'MYR') {
              cCode = 'MY';
            }
            return {
              ...t,
              country_code: cCode,
              currency: t.currency || (cCode ? getCurrencyForCountry(cCode) : undefined) || 'USD',
            };
          });
          return filterCountry
            ? normalized.filter((t) => (t.country_code || '').toUpperCase() === filterCountry)
            : normalized;
        }
      }

      if (isLocalFallbackAllowed(actualEnv) && !localGamePricingCache.has(gameId)) {
        await ensureDefaultGamePricing(gameId, gameId, 'MY', undefined, actualEnv).catch(() => []);
        await ensureDefaultGamePricing(gameId, gameId, 'US', undefined, actualEnv).catch(() => []);
        const seeded = localGamePricingCache.get(gameId) || [];
        if (seeded.length > 0) {
          const normalized = seeded.map((t) => {
            let cCode = (t.country_code || '').trim().toUpperCase();
            if (!cCode && t.currency === 'MYR') {
              cCode = 'MY';
            }
            return {
              ...t,
              country_code: cCode,
              currency: t.currency || (cCode ? getCurrencyForCountry(cCode) : undefined) || 'USD',
            };
          });
          return filterCountry
            ? normalized.filter((t) => (t.country_code || '').toUpperCase() === filterCountry)
            : normalized;
        }
      }

      if (!filterCountry) {
        localGamePricingCache.set(gameId, []);
      }
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
  if (isLocalFallbackAllowed(actualEnv)) {
    if (!localGamePricingCache.has(gameId)) {
      await ensureDefaultGamePricing(gameId, gameId, 'MY', undefined, actualEnv).catch(() => []);
      await ensureDefaultGamePricing(gameId, gameId, 'US', undefined, actualEnv).catch(() => []);
    }
    const cached = localGamePricingCache.get(gameId) || [];
    const normalized = cached.map((t) => {
      let cCode = (t.country_code || '').trim().toUpperCase();
      if (!cCode && t.currency === 'MYR') {
        cCode = 'MY';
      }
      return {
        ...t,
        country_code: cCode,
        currency: t.currency || (cCode ? getCurrencyForCountry(cCode) : undefined) || 'USD',
      };
    });
    return filterCountry
      ? normalized.filter((t) => (t.country_code || '').toUpperCase() === filterCountry)
      : normalized;
  }

  throw {
    status: 503,
    code: 'PRICING_SERVICE_UNAVAILABLE',
    message: 'Pricing service temporarily unavailable: database is unconfigured in production mode.',
  };
}

/**
 * Retrieve active pricing tiers for a specific game, optionally filtered by country
 */
export async function getActiveGamePricing(
  gameId: string,
  countryOrEnv?: string | any,
  env?: any
): Promise<GamePricingRecord[]> {
  const allTiers = await getGamePricing(gameId, countryOrEnv, env);
  return allTiers.filter((t) => t.is_active);
}

/**
 * Retrieve a specific game pricing tier by its primary key ID.
 */
export async function getGamePricingTierById(tierId: string, env?: any): Promise<GamePricingRecord | null> {
  if (!tierId) return null;

  assertProductionPricingSafe(env);

  // If local fallback is allowed, check local cache (e.g. test or local dev tiers)
  if (isLocalFallbackAllowed(env)) {
    for (const tiers of localGamePricingCache.values()) {
      const found = tiers.find((t) => t.id === tierId);
      if (found) {
        let cCode = (found.country_code || '').trim().toUpperCase();
        if (!cCode && found.currency === 'MYR') cCode = 'MY';
        return {
          ...found,
          country_code: cCode,
          currency: found.currency || (cCode ? getCurrencyForCountry(cCode) : undefined) || 'USD',
        };
      }
    }
  }

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

      let cCode = data.country_code ? String(data.country_code).trim().toUpperCase() : '';
      if (!cCode && data.currency === 'MYR') {
        cCode = 'MY';
      }
      return {
        id: data.id,
        game_id: data.game_id,
        country_code: cCode,
        min_days: Number(data.min_days),
        max_days: data.max_days !== null && data.max_days !== undefined ? Number(data.max_days) : null,
        price: Number(data.price),
        currency: data.currency || (cCode ? getCurrencyForCountry(cCode) : undefined) || '',
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
      if (found) {
        let cCode = (found.country_code || '').trim().toUpperCase();
        if (!cCode && found.currency === 'MYR') cCode = 'MY';
        return {
          ...found,
          country_code: cCode,
          currency: found.currency || (cCode ? getCurrencyForCountry(cCode) : undefined) || 'USD',
        };
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
 *
 * FORMAL RESOLUTION ALGORITHM:
 * 1. requestedCountry matching tier?
 *    YES → return requested-country tier (isFallback: false, fallbackLevel: 0)
 * 2. requestedCountry has no matching tier.
 * 3. Does US (DEFAULT_PRICING_COUNTRY) have ANY active tier for this game?
 *    YES:
 *       Does US have matching duration?
 *          YES → return US tier (isFallback: true, fallbackLevel: 1)
 *          NO  → return NO_PRICING_TIER / Contact Us (DO NOT continue to MY!)
 * 4. US has ZERO active tiers for this game.
 * 5. Does MY have matching duration?
 *    YES → return MY tier (isFallback: true, fallbackLevel: 2)
 *    NO  → return NO_PRICING_TIER / Contact Us
 */
export async function resolveGamePrice(
  gameId: string,
  durationDays: number,
  countryCode?: string,
  env?: any,
  options?: { throwOnError?: boolean; defaultCountry?: string }
): Promise<ResolvedGamePriceQuote> {
  if (!gameId) {
    const fail: ResolvedGamePriceQuote = {
      success: false,
      error: 'GAME_ID_REQUIRED',
      message: 'A valid game ID is required to calculate event pricing.',
      requestedCountry: countryCode || 'US',
      pricingCountry: null,
      isFallback: false,
    };
    if (options?.throwOnError) {
      throw { status: 400, code: 'GAME_ID_REQUIRED', message: fail.message };
    }
    return fail;
  }

  const days = Math.max(1, Math.floor(Number(durationDays) || 1));
  const defaultCountry = (options?.defaultCountry && options.defaultCountry.trim())
    ? options.defaultCountry.trim().toUpperCase()
    : (await getDefaultPricingCountry(env)) || 'US';
  const normDefaultCountry = defaultCountry.trim().toUpperCase();
  const defaultCountryCurrency = (getCurrencyForCountry(normDefaultCountry) || 'USD').toUpperCase();
  const secondaryFallbackCountry = 'MY';

  // Primary configured markets that strictly fail closed when designated domestic pricing is missing
  const PRIMARY_STRICT_MARKETS = new Set(['US', 'MY', 'SG']);

  const rawCountry = countryCode ? countryCode.trim().toUpperCase() : '';
  const isExplicitCountry = Boolean(rawCountry && isValidCountryCode(rawCountry));
  const requestedCountry = isExplicitCountry ? rawCountry : normDefaultCountry;

  // Retrieve all active pricing tiers for this game across all countries
  const activeTiers = await getActiveGamePricing(gameId, undefined, env);

  if (!activeTiers || activeTiers.length === 0) {
    const fail: ResolvedGamePriceQuote = {
      success: false,
      error: 'NO_PRICING_TIER',
      message: 'No pricing is configured for this game. Please contact the administrator.',
      requestedCountry,
      pricingCountry: null,
      isFallback: false,
      defaultCountry: normDefaultCountry,
    };
    if (options?.throwOnError) {
      throw {
        status: 422,
        code: 'NO_PRICING_TIER',
        message: fail.message,
        requestedCountry,
        defaultCountry: normDefaultCountry,
      };
    }
    return fail;
  }

  // Canonical helper to find active tiers covering the requested duration
  const findMatchingDuration = (tiersList: GamePricingRecord[]) => {
    return tiersList.filter((t) => {
      if (!t.is_active || t.price <= 0) return false;
      if (days < t.min_days) return false;
      if (t.max_days === null || t.max_days === undefined) return true;
      return days <= t.max_days;
    });
  };

  // =========================================================================
  // PRIORITY A — Valid organization country and currency settings
  // If the organization has an explicitly configured country, first look for
  // an active tier matching all dimensions: (game_id, country_code, currency, duration).
  // =========================================================================
  if (isExplicitCountry) {
    const expectedCurrency = (getCurrencyForCountry(requestedCountry) || 'USD').toUpperCase();
    const requestedTiers = activeTiers.filter(
      (t) =>
        (t.country_code || '').toUpperCase() === requestedCountry &&
        (t.currency || '').toUpperCase() === expectedCurrency &&
        t.price > 0
    );
    const matchedRequested = findMatchingDuration(requestedTiers);

    if (matchedRequested.length > 1) {
      console.error(`Multiple active pricing tiers match duration ${days} days for game ${gameId} in country ${requestedCountry} (${expectedCurrency}):`, matchedRequested);
      const fail: ResolvedGamePriceFailure = {
        success: false,
        error: 'AMBIGUOUS_PRICING_TIER',
        message: `Multiple active pricing tiers match duration of ${days} days for this game in country ${requestedCountry} (${expectedCurrency}). Overlapping active tiers must be resolved in Developer Settings.`,
        requestedCountry,
        pricingCountry: requestedCountry,
        isFallback: false,
      };
      if (options?.throwOnError) {
        throw { status: 409, code: 'AMBIGUOUS_PRICING_TIER', message: fail.message };
      }
      return fail;
    }

    if (matchedRequested.length === 1) {
      const matched = matchedRequested[0];
      const ruleLabel = formatPricingDurationLabel(matched.min_days, matched.max_days);
      return {
        success: true,
        price: Number(matched.price),
        currency: (matched.currency || expectedCurrency).toUpperCase(),
        pricingId: matched.id,
        tierId: matched.id,
        tier: matched,
        ruleLabel,
        durationDays: days,
        requestedCountry,
        pricingCountry: requestedCountry,
        isFallback: false,
        fallbackLevel: 0,
      };
    }

    // Step A.2: Explicit primary market (US, MY, SG) with no matching tier fails closed.
    // Malaysia must use MYR. Singapore must use SGD. US must use USD.
    // They MUST NEVER cross-fallback to another country or currency.
    if (PRIMARY_STRICT_MARKETS.has(requestedCountry)) {
      const fail: ResolvedGamePriceQuote = {
        success: false,
        error: 'NO_PRICING_TIER',
        message: `No pricing tier is configured for a ${days}-day event for this game in country ${requestedCountry}.`,
        requestedCountry,
        pricingCountry: null,
        isFallback: false,
        defaultCountry: normDefaultCountry,
      };
      if (options?.throwOnError) {
        throw {
          status: 422,
          code: 'NO_PRICING_TIER',
          message: fail.message,
          requestedCountry,
          defaultCountry: normDefaultCountry,
        };
      }
      return fail;
    }

    // Step A.3: Non-primary international market without domestic tiers (e.g. VN, FR):
    // If default country (US) has active tiers for this game, US is the sole fallback market.
    // If US has no tier for this duration, fail closed — NEVER fall through to MYR (Case A).
    // If US has ZERO active tiers for this game, secondary fallback MY is attempted (Case B).
    const defTiers = activeTiers.filter(
      (t) =>
        (t.country_code || '').toUpperCase() === normDefaultCountry &&
        (t.currency || '').toUpperCase() === defaultCountryCurrency &&
        t.price > 0
    );
    const matchedDef = findMatchingDuration(defTiers);

    if (matchedDef.length > 1) {
      const fail: ResolvedGamePriceFailure = {
        success: false,
        error: 'AMBIGUOUS_PRICING_TIER',
        message: `Multiple active fallback pricing tiers match duration of ${days} days for this game in default country ${normDefaultCountry}.`,
        requestedCountry,
        pricingCountry: normDefaultCountry,
        isFallback: true,
      };
      if (options?.throwOnError) {
        throw { status: 409, code: 'AMBIGUOUS_PRICING_TIER', message: fail.message };
      }
      return fail;
    }

    if (matchedDef.length === 1) {
      const matched = matchedDef[0];
      const ruleLabel = formatPricingDurationLabel(matched.min_days, matched.max_days);
      return {
        success: true,
        price: Number(matched.price),
        currency: (matched.currency || defaultCountryCurrency).toUpperCase(),
        pricingId: matched.id,
        tierId: matched.id,
        tier: matched,
        ruleLabel,
        durationDays: days,
        requestedCountry,
        pricingCountry: normDefaultCountry,
        isFallback: true,
        fallbackLevel: 1,
      };
    }

    // Default country has ZERO active tiers for this game -> attempt secondary fallback MY (Case B)
    if (defTiers.length === 0) {
      const myTiers = activeTiers.filter(
        (t) =>
          (t.country_code || '').toUpperCase() === secondaryFallbackCountry &&
          (t.currency || '').toUpperCase() === 'MYR' &&
          t.price > 0
      );
      const matchedMY = findMatchingDuration(myTiers);

      if (matchedMY.length > 1) {
        const fail: ResolvedGamePriceFailure = {
          success: false,
          error: 'AMBIGUOUS_PRICING_TIER',
          message: `Multiple active fallback pricing tiers match duration of ${days} days for this game in secondary fallback country ${secondaryFallbackCountry}.`,
          requestedCountry,
          pricingCountry: secondaryFallbackCountry,
          isFallback: true,
        };
        if (options?.throwOnError) {
          throw { status: 409, code: 'AMBIGUOUS_PRICING_TIER', message: fail.message };
        }
        return fail;
      }

      if (matchedMY.length === 1) {
        const matched = matchedMY[0];
        const ruleLabel = formatPricingDurationLabel(matched.min_days, matched.max_days);
        return {
          success: true,
          price: Number(matched.price),
          currency: 'MYR',
          pricingId: matched.id,
          tierId: matched.id,
          tier: matched,
          ruleLabel,
          durationDays: days,
          requestedCountry,
          pricingCountry: secondaryFallbackCountry,
          isFallback: true,
          fallbackLevel: 2,
        };
      }
    }

    // Default country has tiers but none for this duration, or secondary fallback has no matching tier:
    // Strictly fail closed.
    const fail: ResolvedGamePriceQuote = {
      success: false,
      error: 'NO_PRICING_TIER',
      message: `No pricing tier is configured for a ${days}-day event for this game.`,
      requestedCountry,
      pricingCountry: null,
      isFallback: false,
      defaultCountry: normDefaultCountry,
    };
    if (options?.throwOnError) {
      throw {
        status: 422,
        code: 'NO_PRICING_TIER',
        message: fail.message,
        requestedCountry,
        defaultCountry: normDefaultCountry,
      };
    }
    return fail;
  }

  // =========================================================================
  // PRIORITY B — USD default when country/currency settings are missing
  // Organization has NO configured country setting (genuinely unconfigured).
  // Attempt default pricing country (US / USD) for the requested duration.
  // =========================================================================
  const defTiers = activeTiers.filter(
    (t) =>
      (t.country_code || '').toUpperCase() === normDefaultCountry &&
      (t.currency || '').toUpperCase() === defaultCountryCurrency &&
      t.price > 0
  );
  const matchedDef = findMatchingDuration(defTiers);

  if (matchedDef.length > 1) {
    const fail: ResolvedGamePriceFailure = {
      success: false,
      error: 'AMBIGUOUS_PRICING_TIER',
      message: `Multiple active fallback pricing tiers match duration of ${days} days for this game in default country ${normDefaultCountry}.`,
      requestedCountry: normDefaultCountry,
      pricingCountry: normDefaultCountry,
      isFallback: true,
    };
    if (options?.throwOnError) {
      throw { status: 409, code: 'AMBIGUOUS_PRICING_TIER', message: fail.message };
    }
    return fail;
  }

  if (matchedDef.length === 1) {
    const matched = matchedDef[0];
    const ruleLabel = formatPricingDurationLabel(matched.min_days, matched.max_days);
    return {
      success: true,
      price: Number(matched.price),
      currency: (matched.currency || defaultCountryCurrency).toUpperCase(),
      pricingId: matched.id,
      tierId: matched.id,
      tier: matched,
      ruleLabel,
      durationDays: days,
      requestedCountry: normDefaultCountry,
      pricingCountry: normDefaultCountry,
      isFallback: true,
      fallbackLevel: 1,
    };
  }

  // =========================================================================
  // PRIORITY C — MYR fallback for unconfigured organizations
  // If the default country has NO matching tier for the selected duration
  // (even if it has tiers for other durations!), continue to MYR fallback.
  // =========================================================================
  const myTiers = activeTiers.filter(
    (t) =>
      (t.country_code || '').toUpperCase() === secondaryFallbackCountry &&
      (t.currency || '').toUpperCase() === 'MYR' &&
      t.price > 0
  );
  const matchedMY = findMatchingDuration(myTiers);

  if (matchedMY.length > 1) {
    console.error(`Multiple active fallback pricing tiers match duration ${days} days for game ${gameId} in secondary fallback country ${secondaryFallbackCountry}:`, matchedMY);
    const fail: ResolvedGamePriceFailure = {
      success: false,
      error: 'AMBIGUOUS_PRICING_TIER',
      message: `Multiple active fallback pricing tiers match duration of ${days} days for this game in secondary fallback country ${secondaryFallbackCountry}.`,
      requestedCountry: normDefaultCountry,
      pricingCountry: secondaryFallbackCountry,
      isFallback: true,
    };
    if (options?.throwOnError) {
      throw { status: 409, code: 'AMBIGUOUS_PRICING_TIER', message: fail.message };
    }
    return fail;
  }

  if (matchedMY.length === 1) {
    const matched = matchedMY[0];
    const ruleLabel = formatPricingDurationLabel(matched.min_days, matched.max_days);
    return {
      success: true,
      price: Number(matched.price),
      currency: 'MYR',
      pricingId: matched.id,
      tierId: matched.id,
      tier: matched,
      ruleLabel,
      durationDays: days,
      requestedCountry: normDefaultCountry,
      pricingCountry: secondaryFallbackCountry,
      isFallback: true,
      fallbackLevel: 2,
    };
  }

  // =========================================================================
  // PRIORITY D — No valid tier
  // Neither matching USD nor MYR tier exists for the requested duration.
  // =========================================================================
  const fail: ResolvedGamePriceQuote = {
    success: false,
    error: 'NO_PRICING_TIER',
    message: `No pricing tier is configured for a ${days}-day event for this game.`,
    requestedCountry: normDefaultCountry,
    pricingCountry: null,
    isFallback: false,
    defaultCountry: normDefaultCountry,
  };
  if (options?.throwOnError) {
    throw {
      status: 422,
      code: 'NO_PRICING_TIER',
      message: fail.message,
      requestedCountry: normDefaultCountry,
      defaultCountry: normDefaultCountry,
    };
  }
  return fail;
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
 * Validates that a proposed pricing tier range does not overlap with any other active tier
 * for the SAME game, SAME country, and SAME currency.
 * Throws an OVERLAPPING_PRICING_TIER error (status 409) if an overlap is detected.
 */
export async function validateNoOverlappingPricingTier(
  gameId: string,
  countryCode: string,
  minDays: number,
  maxDays: number | null | undefined,
  excludeTierId?: string,
  env?: any,
  currency?: string
): Promise<void> {
  const defCountry = await getDefaultPricingCountry(env);
  const normCountry = (countryCode && countryCode.trim()) ? countryCode.trim().toUpperCase() : defCountry;
  const targetCurrency = (currency && currency.trim())
    ? currency.trim().toUpperCase()
    : (getCurrencyForCountry(normCountry) || 'USD');

  let allTiers: GamePricingRecord[] = [];
  if (isLocalFallbackAllowed(env) && localGamePricingCache.has(gameId)) {
    const cached = localGamePricingCache.get(gameId) || [];
    allTiers = cached
      .map((t) => {
        let cCode = (t.country_code || '').trim().toUpperCase();
        if (!cCode && t.currency === 'MYR') cCode = 'MY';
        return {
          ...t,
          country_code: cCode,
          currency: t.currency || (cCode ? getCurrencyForCountry(cCode) : undefined) || 'USD',
        };
      })
      .filter((t) => (t.country_code || '').toUpperCase() === normCountry);
  } else {
    allTiers = await getGamePricing(gameId, normCountry, env);
  }

  const activeTiers = allTiers.filter(
    (t) =>
      t.is_active &&
      (!targetCurrency || !t.currency || t.currency.toUpperCase() === targetCurrency) &&
      (!excludeTierId || t.id !== excludeTierId)
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
      message: `Pricing tier range (${newLabel}) for country ${normCountry} (${targetCurrency}) overlaps with existing active tier (${existingLabel}) for this game. Overlapping active ranges are not permitted.`,
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
  const normCountry = (params.country_code || '').trim().toUpperCase();
  if (!normCountry) {
    throw {
      status: 400,
      code: 'COUNTRY_REQUIRED',
      message: 'Country code is required to create a pricing tier.',
    };
  }
  const currency = String(params.currency || getCurrencyForCountry(normCountry) || 'USD').trim().toUpperCase();
  const isActive = params.is_active !== undefined ? Boolean(params.is_active) : true;
  const isBase = Boolean(params.is_base);

  if (isNaN(price) || price <= 0) {
    throw {
      status: 400,
      code: 'INVALID_PRICE',
      message: 'Price must be a positive number greater than zero.',
    };
  }

  // Reject overlapping active ranges for the same game, same country, and same currency
  if (isActive) {
    await validateNoOverlappingPricingTier(gameId, normCountry, minDays, maxDays, undefined, env, currency);
  }

  const supabase = getSupabaseServerClient(env);
  if (supabase && isSupabaseConfigured(env)) {
    // If setting as base, unset previous base for this game and country
    if (isBase) {
      await supabase
        .from('game_pricing')
        .update({ is_base: false })
        .eq('game_id', gameId)
        .eq('country_code', normCountry);
    }

    const { data, error } = await supabase
      .from('game_pricing')
      .insert({
        game_id: gameId,
        country_code: normCountry,
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
      if (isLocalFallbackAllowed(env)) {
        // Fall back to local in-memory cache in development/test
        console.warn('Database insert failed, using local cache:', error?.message || error);
      } else {
        throw {
          status: 500,
          code: 'CREATE_PRICING_FAILED',
          message: 'Failed to create game pricing tier: ' + (error?.message || 'Unknown error'),
        };
      }
    } else {
      // Invalidate local cache
      localGamePricingCache.delete(gameId);
      return {
        id: data.id,
        game_id: data.game_id,
        country_code: (data.country_code || normCountry).toUpperCase(),
        min_days: Number(data.min_days),
        max_days: data.max_days !== null && data.max_days !== undefined ? Number(data.max_days) : null,
        price: Number(data.price),
        currency: data.currency || currency,
        is_active: Boolean(data.is_active),
        is_base: Boolean(data.is_base),
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    }
  }

  // Local fallback
  const existing = localGamePricingCache.get(gameId) || [];
  if (isBase) {
    existing.forEach((t) => {
      if ((t.country_code || '').toUpperCase() === normCountry) {
        t.is_base = false;
      }
    });
  }
  const now = new Date().toISOString();
  const newTier: GamePricingRecord = {
    id: crypto.randomUUID(),
    game_id: gameId,
    country_code: normCountry,
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
  const targetCountry = params.country_code ? params.country_code.trim().toUpperCase() : existingTier.country_code;
  const targetCurrency = params.currency ? params.currency.trim().toUpperCase() : existingTier.currency;
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

  // Reject overlapping active ranges for the same game, country, and currency
  if (targetIsActive) {
    await validateNoOverlappingPricingTier(gameId, targetCountry, targetMinDays, targetMaxDays, tierId, env, targetCurrency);
  }

  const supabase = getSupabaseServerClient(env);
  if (supabase && isSupabaseConfigured(env)) {
    // If setting as base, unset previous base
    if (params.is_base === true) {
      await supabase
        .from('game_pricing')
        .update({ is_base: false })
        .eq('game_id', gameId)
        .eq('country_code', targetCountry);
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (params.country_code !== undefined) updatePayload.country_code = targetCountry;
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
      country_code: (data.country_code || targetCountry).toUpperCase(),
      min_days: Number(data.min_days),
      max_days: data.max_days !== null && data.max_days !== undefined ? Number(data.max_days) : null,
      price: Number(data.price),
      currency: data.currency || existingTier.currency,
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
        tiers.forEach((t) => {
          if ((t.country_code || '').toUpperCase() === targetCountry) {
            t.is_base = false;
          }
        });
      }
      if (params.country_code !== undefined) tier.country_code = targetCountry;
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
 * Set the base / 1-day price for a game in a specific country
 */
export async function setGameBasePrice(
  gameId: string,
  price: number,
  currency?: string,
  countryCode?: string,
  env?: any
): Promise<GamePricingRecord> {
  const validPrice = Number(price);
  if (isNaN(validPrice) || validPrice <= 0) {
    throw { status: 400, message: 'Base price must be greater than zero.' };
  }

  const defCountry = await getDefaultPricingCountry(env);
  const normCountry = (countryCode && countryCode.trim()) ? countryCode.trim().toUpperCase() : defCountry;
  const resolvedCurrency = (currency && currency.trim())
    ? currency.trim().toUpperCase()
    : (getCurrencyForCountry(normCountry) || 'USD');

  const existingTiers = await getGamePricing(gameId, normCountry, env);
  const baseTier = existingTiers.find((t) => t.min_days === 1 && t.max_days === 1) || existingTiers.find((t) => t.is_base);

  if (baseTier) {
    return updateGamePricingTier(
      baseTier.id,
      {
        price: validPrice,
        currency: resolvedCurrency,
        country_code: normCountry,
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
      currency: resolvedCurrency,
      country_code: normCountry,
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
    country_code?: string;
    is_active?: boolean;
    is_base?: boolean;
  }>,
  env?: any
): Promise<GamePricingRecord[]> {
  if (!gameId) {
    throw new Error('Game ID is required for bulk pricing upsert');
  }

  // Pre-validate that incoming active tiers do not overlap among themselves within the same country AND currency
  const groupKey = (t: any) => {
    const c = (t.country_code || '').trim().toUpperCase();
    const curr = (t.currency || getCurrencyForCountry(c) || 'USD').trim().toUpperCase();
    return `${c}:${curr}`;
  };
  const countryGroups = new Map<string, typeof tiers>();
  for (const t of tiers) {
    const key = groupKey(t);
    if (!countryGroups.has(key)) countryGroups.set(key, []);
    countryGroups.get(key)!.push(t);
  }

  for (const [groupKeyLabel, groupTiers] of countryGroups.entries()) {
    const activeIncoming = groupTiers.filter((t) => t.is_active !== false);
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
            message: `Bulk pricing update for ${groupKeyLabel} contains overlapping active ranges: (${labelA}) and (${labelB}). Overlapping active ranges are not permitted.`,
          };
        }
      }
    }
  }

  if (isLocalFallbackAllowed(env) && !localGamePricingCache.has(gameId)) {
    localGamePricingCache.set(gameId, []);
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
      }
    }
    const created = await createGamePricingTier(gameId, t, env);
    results.push(created);
  }

  return results;
}

/**
 * Ensure default pricing tiers are seeded for a game in a specific country if none exist
 */
export async function ensureDefaultGamePricing(
  gameId: string,
  gameTypeOrSlug?: string,
  countryCode?: string,
  currency?: string,
  env?: any
): Promise<GamePricingRecord[]> {
  if (!countryCode) {
    const myTiers = await ensureDefaultGamePricing(gameId, gameTypeOrSlug, 'MY', 'MYR', env).catch(() => []);
    const usTiers = await ensureDefaultGamePricing(gameId, gameTypeOrSlug, 'US', 'USD', env).catch(() => []);
    return [...myTiers, ...usTiers];
  }

  const normCountry = countryCode.trim().toUpperCase();
  const normCurrency = (currency && currency.trim())
    ? currency.trim().toUpperCase()
    : (getCurrencyForCountry(normCountry) || 'USD');

  const supabase = getSupabaseServerClient(env);
  if (supabase && isSupabaseConfigured(env)) {
    // Check if tiers already exist for this country
    const { data: existing } = await supabase
      .from('game_pricing')
      .select('*')
      .eq('game_id', gameId)
      .eq('country_code', normCountry)
      .order('min_days', { ascending: true });

    if (existing && existing.length > 0) {
      return existing.map((d: any) => ({
        id: d.id,
        game_id: d.game_id,
        country_code: (d.country_code || normCountry).toUpperCase(),
        min_days: Number(d.min_days),
        max_days: d.max_days !== null && d.max_days !== undefined ? Number(d.max_days) : null,
        price: Number(d.price),
        currency: d.currency || normCurrency,
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

    const defaultTiers = buildDefaultPricingTiers(gameId, slug, normCountry, normCurrency);
    const insertPayload = defaultTiers.map((t) => ({
      game_id: t.game_id,
      country_code: t.country_code,
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
      country_code: (d.country_code || normCountry).toUpperCase(),
      min_days: Number(d.min_days),
      max_days: d.max_days !== null && d.max_days !== undefined ? Number(d.max_days) : null,
      price: Number(d.price),
      currency: d.currency || normCurrency,
      is_active: Boolean(d.is_active),
      is_base: Boolean(d.is_base),
      created_at: d.created_at,
      updated_at: d.updated_at,
    }));
    localGamePricingCache.delete(gameId);
    return mapped;
  }

  // Local fallback
  const existing = localGamePricingCache.get(gameId) || [];
  const existingForCountry = existing.filter((t) => (t.country_code || '').toUpperCase() === normCountry);
  if (existingForCountry.length > 0) {
    return existingForCountry;
  }

  const defaults = buildDefaultPricingTiers(gameId, gameTypeOrSlug, normCountry, normCurrency);
  existing.push(...defaults);
  localGamePricingCache.set(gameId, existing);
  return defaults;
}

// ============================================================================
// PUBLIC GAME PRICING INTERFACES & RETRIEVAL (LANDING PAGE)
// ============================================================================

export interface PublicGamePricingTier {
  id?: string;
  min_days: number;
  max_days: number | null;
  price: number;
  currency: string;
  country_code?: string;
  is_base?: boolean;
}

export interface PublicGamePricingItem {
  id: string;
  slug: string;
  name: string;
  game_type: string;
  status: string;
  tiers: PublicGamePricingTier[];
}

export interface PublicGamesPricingResponse {
  success: boolean;
  requestedCountry: string;
  pricingCountry: string;
  currency: string;
  isFallback: boolean;
  defaultPricingCountry: string;
  games: PublicGamePricingItem[];
}

/**
 * Public read-only method for returning active public games and their active pricing tiers.
 * Used exclusively by public landing page game showcase & pricing calculator.
 * Resolves country-specific pricing with automatic fallback to DEFAULT_PRICING_COUNTRY.
 */
export async function getPublicGamesPricing(
  requestedCountryOrEnv?: string | any,
  env?: any
): Promise<PublicGamesPricingResponse> {
  let requestedCountry: string | undefined = undefined;
  let actualEnv: any = env;
  if (typeof requestedCountryOrEnv === 'string') {
    requestedCountry = requestedCountryOrEnv;
  } else if (requestedCountryOrEnv && typeof requestedCountryOrEnv === 'object') {
    actualEnv = requestedCountryOrEnv;
  }

  const defaultPricingCountry = await getDefaultPricingCountry(actualEnv);
  const normRequestedCountry = (requestedCountry && requestedCountry.trim())
    ? requestedCountry.trim().toUpperCase()
    : defaultPricingCountry;

  const supabase = getSupabaseServerClient(actualEnv);
  const isProd = !isLocalFallbackAllowed(actualEnv);
  let activeGames: Array<{ id: string; name: string; slug: string; game_type: string; status: string }> = [];

  if (supabase && isSupabaseConfigured(actualEnv)) {
    try {
      const { data, error } = await executeWithResilience(
        async () => {
          return await supabase
            .from('games')
            .select('id, name, slug, game_type, status')
            .or('is_system.eq.true,organization_id.is.null')
            .order('created_at', { ascending: true });
        },
        {
          operation: 'getPublicGamesPricing_get_games',
          maxRetries: 3,
          initialDelayMs: 200,
          env: actualEnv,
        }
      );

      if (error) {
        throw error;
      }
      activeGames = (data || []).filter((g: any) => g.status === 'active' || !g.status);
    } catch (err: any) {
      if (isProd) {
        console.error('[getPublicGamesPricing] Fatal database failure fetching games:', err);
        const unavailableErr: any = new Error('Pricing service temporarily unavailable. Please try again later.');
        unavailableErr.status = 503;
        unavailableErr.statusCode = 503;
        unavailableErr.code = 'PRICING_SERVICE_UNAVAILABLE';
        unavailableErr.isOperational = true;
        throw unavailableErr;
      }
    }
  }

  // Local/Test mode fallback
  if (activeGames.length === 0 && isLocalFallbackAllowed(actualEnv)) {
    const allGames = await getAllPlatformGames(actualEnv);
    activeGames = (allGames || []).filter((g) => g.status === 'active' || !g.status);
  }

  if (activeGames.length === 0 && isProd) {
    const unavailableErr: any = new Error('Pricing service temporarily unavailable: active games unconfigured or database unavailable.');
    unavailableErr.status = 503;
    unavailableErr.statusCode = 503;
    unavailableErr.code = 'PRICING_SERVICE_UNAVAILABLE';
    unavailableErr.isOperational = true;
    throw unavailableErr;
  }

  // Preferred catalog ordering: catch-brand, memory-match, reaction-tap, match-3
  const canonicalOrder = ['catch-brand', 'memory-match', 'reaction-tap', 'match-3'];
  activeGames.sort((a, b) => {
    const aType = a.game_type || a.slug;
    const bType = b.game_type || b.slug;
    const aIdx = canonicalOrder.indexOf(aType);
    const bIdx = canonicalOrder.indexOf(bType);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  const activeGameIds = activeGames
    .map((g) => g.id)
    .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  const tiersByGameId = new Map<string, GamePricingRecord[]>();

  // Pre-populate empty tier lists for all games to eliminate N+1 queries
  for (const g of activeGames) {
    tiersByGameId.set(g.id, []);
  }

  if (supabase && isSupabaseConfigured(actualEnv) && activeGameIds.length > 0) {
    try {
      const { data, error } = await executeWithResilience(
        async () => {
          return await supabase
            .from('game_pricing')
            .select('id, game_id, country_code, min_days, max_days, price, currency, is_active, is_base, created_at, updated_at')
            .in('game_id', activeGameIds)
            .eq('is_active', true)
            .order('min_days', { ascending: true });
        },
        {
          operation: 'getPublicGamesPricing_get_tiers',
          maxRetries: 3,
          initialDelayMs: 200,
          env: actualEnv,
        }
      );

      if (error) {
        throw error;
      }

      if (data) {
        for (const row of data) {
          let cCode = row.country_code ? String(row.country_code).trim().toUpperCase() : '';
          if (!cCode && row.currency === 'MYR') cCode = 'MY';
          const record: GamePricingRecord = {
            id: row.id,
            game_id: row.game_id,
            country_code: cCode,
            min_days: Number(row.min_days),
            max_days: row.max_days !== null && row.max_days !== undefined ? Number(row.max_days) : null,
            price: Number(row.price),
            currency: row.currency || (cCode ? getCurrencyForCountry(cCode) : undefined) || '',
            is_active: Boolean(row.is_active),
            is_base: Boolean(row.is_base),
            created_at: (row as any).created_at || new Date().toISOString(),
            updated_at: (row as any).updated_at || new Date().toISOString(),
          };
          const list = tiersByGameId.get(row.game_id) || [];
          list.push(record);
          tiersByGameId.set(row.game_id, list);
        }
      }
    } catch (err: any) {
      if (isProd) {
        console.error('[getPublicGamesPricing] Fatal database failure fetching pricing tiers:', err);
        const unavailableErr: any = new Error('Pricing service temporarily unavailable. Please try again later.');
        unavailableErr.status = 503;
        unavailableErr.statusCode = 503;
        unavailableErr.code = 'PRICING_SERVICE_UNAVAILABLE';
        unavailableErr.isOperational = true;
        throw unavailableErr;
      }
    }
  }

  const results: PublicGamePricingItem[] = [];
  let overallPricingCountry = normRequestedCountry;
  let overallCurrency = getCurrencyForCountry(normRequestedCountry) || getCurrencyForCountry(defaultPricingCountry) || 'USD';
  let overallIsFallback = false;

  for (const game of activeGames) {
    let allActiveTiers: GamePricingRecord[] = [];
    if (tiersByGameId.has(game.id) && tiersByGameId.get(game.id)!.length > 0) {
      allActiveTiers = tiersByGameId.get(game.id)!;
    } else if (isLocalFallbackAllowed(actualEnv) && localGamePricingCache.has(game.id)) {
      allActiveTiers = localGamePricingCache.get(game.id)!;
    } else if (tiersByGameId.has(game.id)) {
      allActiveTiers = tiersByGameId.get(game.id)!;
    } else {
      try {
        allActiveTiers = await getActiveGamePricing(game.id, undefined, actualEnv);
      } catch (err: any) {
        if (isProd) {
          const unavailableErr: any = new Error('Pricing service temporarily unavailable. Please try again later.');
          unavailableErr.status = 503;
          unavailableErr.statusCode = 503;
          unavailableErr.code = 'PRICING_SERVICE_UNAVAILABLE';
          unavailableErr.isOperational = true;
          throw unavailableErr;
        }
        allActiveTiers = [];
      }
    }

    // Step 1: Look for active tiers in requested country matching expected currency
    const reqExpectedCurrency = (getCurrencyForCountry(normRequestedCountry) || 'USD').toUpperCase();
    const reqTiers = allActiveTiers.filter(
      (t) =>
        (t.country_code || '').toUpperCase() === normRequestedCountry &&
        (t.currency || '').toUpperCase() === reqExpectedCurrency &&
        t.price > 0
    );

    // Determine fallback country for this game:
    // Configured primary markets (US, MY) do NOT cross-fallback to another country or currency.
    let fallbackCountry: string | null = null;
    let fallbackCandidateTiers: GamePricingRecord[] = [];

    if (normRequestedCountry !== 'US' && normRequestedCountry !== 'MY') {
      const defExpectedCurrency = (getCurrencyForCountry(defaultPricingCountry) || 'USD').toUpperCase();
      const usTiers = allActiveTiers.filter(
        (t) =>
          (t.country_code || '').toUpperCase() === defaultPricingCountry &&
          (t.currency || '').toUpperCase() === defExpectedCurrency &&
          t.price > 0
      );
      const myTiers = allActiveTiers.filter(
        (t) =>
          (t.country_code || '').toUpperCase() === 'MY' &&
          (t.currency || '').toUpperCase() === 'MYR' &&
          t.price > 0
      );

      if (usTiers.length > 0) {
        fallbackCountry = defaultPricingCountry;
        fallbackCandidateTiers = usTiers;
      } else if (myTiers.length > 0) {
        fallbackCountry = 'MY';
        fallbackCandidateTiers = myTiers;
      }
    }

    const combinedTiers: GamePricingRecord[] = [...reqTiers];
    let isGameFallback = false;
    let gamePricingCountry = normRequestedCountry;

    if (reqTiers.length === 0) {
      if (fallbackCountry && fallbackCandidateTiers.length > 0) {
        combinedTiers.push(...fallbackCandidateTiers);
        isGameFallback = true;
        gamePricingCountry = fallbackCountry;
      }
    } else if (fallbackCountry && normRequestedCountry !== fallbackCountry) {
      // Add non-overlapping fallback tiers for durations unconfigured in requested country
      for (const fbTier of fallbackCandidateTiers) {
        const overlaps = reqTiers.some((r) => {
          const rMax = r.max_days ?? Infinity;
          const fbMax = fbTier.max_days ?? Infinity;
          return r.min_days <= fbMax && fbTier.min_days <= rMax;
        });
        if (!overlaps) {
          combinedTiers.push(fbTier);
        }
      }
    }

    const sortedTiers = combinedTiers.sort((a, b) => a.min_days - b.min_days);

    if (sortedTiers.length > 0) {
      overallPricingCountry = gamePricingCountry;
      overallCurrency = sortedTiers[0].currency || (sortedTiers[0].country_code ? getCurrencyForCountry(sortedTiers[0].country_code) : '') || 'USD';
      if (isGameFallback) {
        overallIsFallback = true;
      }
    }

    results.push({
      id: game.id,
      slug: game.slug,
      name: game.name,
      game_type: game.game_type || game.slug,
      status: game.status || 'active',
      tiers: sortedTiers.map((t) => ({
        id: t.id,
        min_days: t.min_days,
        max_days: t.max_days ?? null,
        price: Number(t.price),
        currency: t.currency || (t.country_code ? getCurrencyForCountry(t.country_code) : '') || 'USD',
        country_code: t.country_code || gamePricingCountry,
        is_base: Boolean(t.is_base),
      })),
    });
  }

  return {
    success: true,
    requestedCountry: normRequestedCountry,
    pricingCountry: overallPricingCountry,
    currency: overallCurrency,
    isFallback: overallIsFallback,
    defaultPricingCountry,
    games: results,
  };
}

