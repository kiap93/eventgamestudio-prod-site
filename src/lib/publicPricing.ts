import { apiFetch } from './api';
import { getCurrencyForCountry } from './countryUtils';

export interface PublicGamePricingTier {
  id?: string;
  min_days: number;
  max_days: number | null;
  price: number;
  currency: string;
  country_code?: string;
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
  requestedCountry?: string;
  pricingCountry?: string;
  currency?: string;
  isFallback?: boolean;
  defaultPricingCountry?: string;
  games: PublicGameWithPricing[];
}

// In-memory cache by country code to prevent redundant fetches across landing sections
const cachedPricingMap = new Map<string, { promise: Promise<PublicGamesPricingResponse>; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * Authoritatively fetches active platform public games and their active pricing tiers with full country metadata.
 */
export async function fetchPublicPricingDetails(
  countryCode?: string,
  forceRefresh = false
): Promise<PublicGamesPricingResponse> {
  const normKey = (countryCode || '').trim().toUpperCase();
  const now = Date.now();
  const cached = cachedPricingMap.get(normKey);

  if (!forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.promise;
  }

  const promise = (async () => {
    try {
      const url = normKey
        ? `/api/public/games/pricing?country=${encodeURIComponent(normKey)}`
        : '/api/public/games/pricing';
      const res = await apiFetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch public game pricing (HTTP ${res.status})`);
      }
      const data: PublicGamesPricingResponse = await res.json();
      if (data && Array.isArray(data.games)) {
        return data;
      }
      return {
        success: true,
        requestedCountry: normKey,
        pricingCountry: normKey || 'US',
        currency: (normKey ? getCurrencyForCountry(normKey) : undefined) || 'USD',
        isFallback: false,
        defaultPricingCountry: 'US',
        games: [],
      };
    } catch (err) {
      cachedPricingMap.delete(normKey);
      throw err;
    }
  })();

  cachedPricingMap.set(normKey, { promise, timestamp: now });
  return promise;
}

/**
 * Backward-compatible helper returning games array directly.
 */
export async function fetchPublicGamesPricing(
  forceRefreshOrCountry?: boolean | string,
  maybeCountry?: string
): Promise<PublicGameWithPricing[]> {
  let forceRefresh = false;
  let countryCode: string | undefined = undefined;

  if (typeof forceRefreshOrCountry === 'boolean') {
    forceRefresh = forceRefreshOrCountry;
    countryCode = maybeCountry;
  } else if (typeof forceRefreshOrCountry === 'string') {
    countryCode = forceRefreshOrCountry;
  }

  const response = await fetchPublicPricingDetails(countryCode, forceRefresh);
  return response.games || [];
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
    return {
      price: Number(oneDayTier.price),
      currency: oneDayTier.currency || getCurrencyForCountry(oneDayTier.country_code) || 'USD',
    };
  }

  // 2. Look for base tier
  const baseTier = validTiers.find((t) => t.is_base);
  if (baseTier) {
    return {
      price: Number(baseTier.price),
      currency: baseTier.currency || getCurrencyForCountry(baseTier.country_code) || 'USD',
    };
  }

  // 3. Fallback to lowest min_days tier
  const sorted = [...validTiers].sort((a, b) => a.min_days - b.min_days);
  const lowestTier = sorted[0];
  if (lowestTier) {
    return {
      price: Number(lowestTier.price),
      currency: lowestTier.currency || getCurrencyForCountry(lowestTier.country_code) || 'USD',
    };
  }

  return null;
}

/**
 * Formats a currency value cleanly (e.g. RM1,400 or $1,400)
 */
export function formatPublicPrice(price: number, currency: string = 'USD'): string {
  const normCur = (currency || 'USD').toUpperCase();
  const formatted = Number(price).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  if (normCur === 'MYR') {
    return `RM${formatted}`;
  }
  if (normCur === 'USD') {
    return `$${formatted}`;
  }
  if (normCur === 'SGD') {
    return `S$${formatted}`;
  }
  return `${normCur} ${formatted}`;
}
