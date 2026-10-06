import { apiFetch } from './api';

export interface PublicGamePricingTier {
  id?: string;
  min_days: number;
  max_days: number | null;
  price: number;
  currency: string;
  is_base?: boolean;
}

export interface PublicGameWithPricing {
  id: string;
  slug: string;
  name: string;
  game_type: string;
  status: string;
  tiers: PublicGamePricingTier[];
}

export interface PublicGamesPricingResponse {
  success: boolean;
  games: PublicGameWithPricing[];
}

// In-memory cache to prevent redundant fetches across landing sections
let cachedPricingPromise: Promise<PublicGameWithPricing[]> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * Authoritatively fetches active platform public games and their active pricing tiers.
 * Reuses in-flight or cached promises so LandingGameShowcase and LandingPricing don't make duplicate calls.
 */
export async function fetchPublicGamesPricing(forceRefresh = false): Promise<PublicGameWithPricing[]> {
  const now = Date.now();
  if (!forceRefresh && cachedPricingPromise && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedPricingPromise;
  }

  cachedPricingPromise = (async () => {
    try {
      const res = await apiFetch('/api/public/games/pricing');
      if (!res.ok) {
        throw new Error(`Failed to fetch public game pricing (HTTP ${res.status})`);
      }
      const data: PublicGamesPricingResponse = await res.json();
      if (data && Array.isArray(data.games)) {
        cacheTimestamp = Date.now();
        return data.games;
      }
      return [];
    } catch (err) {
      cachedPricingPromise = null; // Clear so subsequent calls can retry
      throw err;
    }
  })();

  return cachedPricingPromise;
}

/**
 * Authoritative pricing tier matching logic:
 * selectedDays >= min_days AND (max_days IS NULL OR selectedDays <= max_days)
 */
export function matchGamePricingTier(
  tiers: PublicGamePricingTier[],
  selectedDays: number
): PublicGamePricingTier | null {
  if (!Array.isArray(tiers) || tiers.length === 0) return null;
  const days = Math.max(1, Math.floor(Number(selectedDays) || 1));
  const matched = tiers.find(
    (t) =>
      (t as any).is_active !== false &&
      Number(t.price) > 0 &&
      days >= t.min_days &&
      (t.max_days === null || t.max_days === undefined || days <= t.max_days)
  );
  return matched || null;
}

/**
 * Extracts starting price (from 1-day or base tier) for display in game cards.
 */
export function getGameStartingPrice(
  game: PublicGameWithPricing
): { price: number; currency: string } | null {
  if (!game || !Array.isArray(game.tiers) || game.tiers.length === 0) return null;

  const validTiers = game.tiers.filter(
    (t) => (t as any).is_active !== false && Number(t.price) > 0
  );
  if (validTiers.length === 0) return null;

  // 1. Look for tier with min_days === 1 and (max_days === 1 or max_days === null)
  const oneDayTier = validTiers.find(
    (t) => t.min_days === 1 && (t.max_days === 1 || t.max_days === null)
  );
  if (oneDayTier) {
    return { price: Number(oneDayTier.price), currency: oneDayTier.currency || 'MYR' };
  }

  // 2. Look for base tier
  const baseTier = validTiers.find((t) => t.is_base);
  if (baseTier) {
    return { price: Number(baseTier.price), currency: baseTier.currency || 'MYR' };
  }

  // 3. Fallback to lowest min_days tier
  const sorted = [...validTiers].sort((a, b) => a.min_days - b.min_days);
  const lowestTier = sorted[0];
  if (lowestTier) {
    return { price: Number(lowestTier.price), currency: lowestTier.currency || 'MYR' };
  }

  return null;
}

/**
 * Formats a currency value cleanly (e.g. RM1,400 or USD 1,400)
 */
export function formatPublicPrice(price: number, currency: string = 'MYR'): string {
  const formatted = Number(price).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  if (currency.toUpperCase() === 'MYR') {
    return `RM${formatted}`;
  }
  return `${currency} ${formatted}`;
}
