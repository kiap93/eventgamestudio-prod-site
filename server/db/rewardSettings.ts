import {
  getSupabaseServerClient,
  isSupabaseConfigured,
  isLocalFallbackAllowed,
  assertProductionSafe,
} from '../supabase.js';
import {
  WalletRewardSettingsRecord,
  WalletTopupTierRecord,
  WalletRewardSettingsWithTiers,
  WalletRewardSettingsHistoryRecord,
  UpdateWalletRewardSettingsInput,
} from './types.js';
import { getOrganizationById } from './organizations.js';
import { getCurrencyForCountry, isValidCountryCode } from '../../src/lib/countryUtils.js';
import { toCents, fromCents } from './wallet.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Default constants for backward compatibility and fallback seeding
export const DEFAULT_REWARD_COUNTRY = 'MY';
export const DEFAULT_REWARD_CURRENCY = 'MYR';

export const SEED_DEFAULT_SETTINGS: WalletRewardSettingsWithTiers[] = [
  {
    id: 'rew_set_my_default',
    country_code: 'MY',
    currency: 'MYR',
    welcome_credit_amount: 800.00,
    welcome_credit_enabled: true,
    showcase_credit_amount: 300.00,
    showcase_credit_enabled: true,
    topup_bonus_enabled: true,
    max_topup_credit_per_event_percent: 0.2000,
    is_active: true,
    version: 1,
    updated_by: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    tiers: [
      {
        id: 'tier_my_1',
        reward_settings_id: 'rew_set_my_default',
        country_code: 'MY',
        currency: 'MYR',
        tier_name: 'Tier 1 (5% Bonus)',
        min_deposit: 6000.00,
        max_deposit: null,
        calculation_type: 'PERCENTAGE',
        bonus_rate: 0.0500,
        bonus_fixed_amount: 0.00,
        max_bonus_amount: null,
        is_active: true,
        sort_order: 1,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'tier_my_2',
        reward_settings_id: 'rew_set_my_default',
        country_code: 'MY',
        currency: 'MYR',
        tier_name: 'Tier 2 (7% Bonus)',
        min_deposit: 10000.00,
        max_deposit: null,
        calculation_type: 'PERCENTAGE',
        bonus_rate: 0.0700,
        bonus_fixed_amount: 0.00,
        max_bonus_amount: null,
        is_active: true,
        sort_order: 2,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
      },
    ],
  },
  {
    id: 'rew_set_sg_default',
    country_code: 'SG',
    currency: 'SGD',
    welcome_credit_amount: 300.00,
    welcome_credit_enabled: true,
    showcase_credit_amount: 100.00,
    showcase_credit_enabled: true,
    topup_bonus_enabled: true,
    max_topup_credit_per_event_percent: 0.2000,
    is_active: true,
    version: 1,
    updated_by: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    tiers: [
      {
        id: 'tier_sg_1',
        reward_settings_id: 'rew_set_sg_default',
        country_code: 'SG',
        currency: 'SGD',
        tier_name: 'Tier 1 (5% Bonus)',
        min_deposit: 2000.00,
        max_deposit: null,
        calculation_type: 'PERCENTAGE',
        bonus_rate: 0.0500,
        bonus_fixed_amount: 0.00,
        max_bonus_amount: null,
        is_active: true,
        sort_order: 1,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'tier_sg_2',
        reward_settings_id: 'rew_set_sg_default',
        country_code: 'SG',
        currency: 'SGD',
        tier_name: 'Tier 2 (7% Bonus)',
        min_deposit: 3500.00,
        max_deposit: null,
        calculation_type: 'PERCENTAGE',
        bonus_rate: 0.0700,
        bonus_fixed_amount: 0.00,
        max_bonus_amount: null,
        is_active: true,
        sort_order: 2,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
      },
    ],
  },
  {
    id: 'rew_set_us_default',
    country_code: 'US',
    currency: 'USD',
    welcome_credit_amount: 200.00,
    welcome_credit_enabled: true,
    showcase_credit_amount: 75.00,
    showcase_credit_enabled: true,
    topup_bonus_enabled: true,
    max_topup_credit_per_event_percent: 0.2000,
    is_active: true,
    version: 1,
    updated_by: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    tiers: [
      {
        id: 'tier_us_1',
        reward_settings_id: 'rew_set_us_default',
        country_code: 'US',
        currency: 'USD',
        tier_name: 'Tier 1 (5% Bonus)',
        min_deposit: 1500.00,
        max_deposit: null,
        calculation_type: 'PERCENTAGE',
        bonus_rate: 0.0500,
        bonus_fixed_amount: 0.00,
        max_bonus_amount: null,
        is_active: true,
        sort_order: 1,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'tier_us_2',
        reward_settings_id: 'rew_set_us_default',
        country_code: 'US',
        currency: 'USD',
        tier_name: 'Tier 2 (7% Bonus)',
        min_deposit: 2500.00,
        max_deposit: null,
        calculation_type: 'PERCENTAGE',
        bonus_rate: 0.0700,
        bonus_fixed_amount: 0.00,
        max_bonus_amount: null,
        is_active: true,
        sort_order: 2,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
      },
    ],
  },
];

// In-memory caches for test/local fallback
export const localRewardSettingsCache = new Map<string, WalletRewardSettingsRecord>();
export const localTopupTiersCache = new Map<string, WalletTopupTierRecord[]>();
export const localRewardSettingsHistoryCache = new Map<string, WalletRewardSettingsHistoryRecord[]>();

function initializeLocalCache(): void {
  for (const s of SEED_DEFAULT_SETTINGS) {
    const { tiers, ...rest } = s;
    localRewardSettingsCache.set(s.country_code.toUpperCase(), rest);
    localTopupTiersCache.set(s.country_code.toUpperCase(), [...tiers]);
  }
}
initializeLocalCache();

/**
 * Validate tier boundary rules:
 * - min_deposit >= 0
 * - max_deposit === null || max_deposit >= min_deposit
 * - Non-overlapping intervals among active tiers
 */
export function validateTiersConfiguration(tiers: Array<{
  min_deposit: number;
  max_deposit?: number | null;
  is_active?: boolean;
}>): void {
  const activeTiers = tiers.filter((t) => t.is_active !== false);
  for (const t of activeTiers) {
    if (isNaN(t.min_deposit) || t.min_deposit < 0) {
      throw new Error(`Invalid tier minimum deposit: ${t.min_deposit}. Must be greater than or equal to 0.`);
    }
    if (t.max_deposit !== null && t.max_deposit !== undefined) {
      if (isNaN(t.max_deposit) || t.max_deposit < t.min_deposit) {
        throw new Error(`Invalid tier maximum deposit: ${t.max_deposit}. Must be greater than or equal to minimum deposit (${t.min_deposit}).`);
      }
    }
  }

  // Check for duplicate min_deposits
  const minDeposits = activeTiers.map((t) => toCents(t.min_deposit));
  const uniqueMins = new Set(minDeposits);
  if (uniqueMins.size !== minDeposits.length) {
    throw new Error('Ambiguous tier configuration: Multiple active tiers cannot share the exact same minimum deposit threshold.');
  }

  // Check for overlapping intervals
  // For tiers with explicit max_deposit: [min, max]
  // For open-ended tiers with max_deposit null: min threshold
  for (let i = 0; i < activeTiers.length; i++) {
    for (let j = i + 1; j < activeTiers.length; j++) {
      const a = activeTiers[i];
      const b = activeTiers[j];
      const aMin = toCents(a.min_deposit);
      const aMax = a.max_deposit !== null && a.max_deposit !== undefined ? toCents(a.max_deposit) : Infinity;
      const bMin = toCents(b.min_deposit);
      const bMax = b.max_deposit !== null && b.max_deposit !== undefined ? toCents(b.max_deposit) : Infinity;

      // Overlap occurs if intervals [aMin, aMax] and [bMin, bMax] intersect beyond a point boundary
      if (aMin < bMax && bMin < aMax) {
        // If one is open-ended and has a lower min than another open-ended, they collide
        if (aMax === Infinity && bMax === Infinity) {
          // Open-ended thresholds: In tiered top-ups, higher thresholds take precedence.
          // However, if an explicit max is omitted, allow stepwise threshold logic unless identical
          continue;
        }
        if (aMin < bMax && bMin < aMax && Math.max(aMin, bMin) < Math.min(aMax, bMax)) {
          throw new Error(`Overlapping tier boundaries detected between minimums ${a.min_deposit} and ${b.min_deposit}.`);
        }
      }
    }
  }
}

/**
 * Authoritatively calculates top-up promotional credit based on active tiers.
 */
export function calculateDynamicTopupCredit(
  amount: number,
  tiers: WalletTopupTierRecord[],
  isTopupBonusEnabled: boolean = true
): {
  promoCredit: number;
  bonusPercentage: number;
  matchedTier: WalletTopupTierRecord | null;
  tierRateDescription: string;
} {
  const sanitizedAmount = fromCents(toCents(amount));
  if (!isTopupBonusEnabled || sanitizedAmount <= 0 || !tiers || tiers.length === 0) {
    return {
      promoCredit: 0.00,
      bonusPercentage: 0.00,
      matchedTier: null,
      tierRateDescription: '0%',
    };
  }

  // Filter active tiers and sort by min_deposit descending (highest matching threshold takes precedence)
  const activeTiers = tiers
    .filter((t) => t.is_active !== false)
    .sort((a, b) => Number(b.min_deposit) - Number(a.min_deposit));

  let matchedTier: WalletTopupTierRecord | null = null;
  for (const tier of activeTiers) {
    const minCents = toCents(tier.min_deposit);
    const amountCents = toCents(sanitizedAmount);
    const maxCents = tier.max_deposit !== null && tier.max_deposit !== undefined
      ? toCents(tier.max_deposit)
      : Infinity;

    if (amountCents >= minCents && amountCents <= maxCents) {
      matchedTier = tier;
      break;
    }
  }

  if (!matchedTier) {
    return {
      promoCredit: 0.00,
      bonusPercentage: 0.00,
      matchedTier: null,
      tierRateDescription: '0%',
    };
  }

  let calculatedCreditCents = 0;
  if (matchedTier.calculation_type === 'FIXED') {
    calculatedCreditCents = toCents(matchedTier.bonus_fixed_amount || 0);
  } else {
    // Percentage rate
    const rate = Number(matchedTier.bonus_rate || 0);
    calculatedCreditCents = Math.round(toCents(sanitizedAmount) * rate);
  }

  // Apply maximum bonus amount cap if specified
  if (matchedTier.max_bonus_amount !== null && matchedTier.max_bonus_amount !== undefined) {
    const maxBonusCents = toCents(matchedTier.max_bonus_amount);
    if (calculatedCreditCents > maxBonusCents) {
      calculatedCreditCents = maxBonusCents;
    }
  }

  const promoCredit = fromCents(calculatedCreditCents);
  const bonusPercentage = sanitizedAmount > 0
    ? Math.round((promoCredit / sanitizedAmount) * 10000) / 100
    : 0;

  const tierRateDescription = matchedTier.calculation_type === 'FIXED'
    ? `Fixed ${matchedTier.currency} ${matchedTier.bonus_fixed_amount}`
    : `${Math.round(Number(matchedTier.bonus_rate) * 100)}%`;

  return {
    promoCredit,
    bonusPercentage,
    matchedTier,
    tierRateDescription,
  };
}

/**
 * Retrieve all configured country reward settings with active top-up tiers.
 */
export async function getAllRewardSettings(
  env?: Record<string, any>
): Promise<WalletRewardSettingsWithTiers[]> {
  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    try {
      const { data: settingsData, error: sErr } = await supabase
        .from('wallet_reward_settings')
        .select('*')
        .order('country_code', { ascending: true });

      if (sErr) {
        if (!isLocalFallbackAllowed(env)) {
          throw new Error(`Failed to fetch wallet reward settings: ${sErr.message}`);
        }
        console.warn('Fallback: reading local wallet reward settings cache due to DB error:', sErr.message);
      } else if (settingsData && settingsData.length > 0) {
        const { data: tiersData } = await supabase
          .from('wallet_topup_tiers')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('min_deposit', { ascending: true });

        const tiersMap = new Map<string, WalletTopupTierRecord[]>();
        if (tiersData) {
          for (const t of tiersData) {
            const list = tiersMap.get(t.country_code.toUpperCase()) || [];
            list.push(t as WalletTopupTierRecord);
            tiersMap.set(t.country_code.toUpperCase(), list);
          }
        }

        return (settingsData as WalletRewardSettingsRecord[]).map((s) => ({
          ...s,
          welcome_credit_amount: Number(s.welcome_credit_amount),
          showcase_credit_amount: Number(s.showcase_credit_amount),
          max_topup_credit_per_event_percent: Number(s.max_topup_credit_per_event_percent),
          tiers: (tiersMap.get(s.country_code.toUpperCase()) || []).map((t) => ({
            ...t,
            min_deposit: Number(t.min_deposit),
            max_deposit: t.max_deposit !== null ? Number(t.max_deposit) : null,
            bonus_rate: Number(t.bonus_rate),
            bonus_fixed_amount: Number(t.bonus_fixed_amount),
            max_bonus_amount: t.max_bonus_amount !== null ? Number(t.max_bonus_amount) : null,
          })),
        }));
      }
    } catch (err: any) {
      if (!isLocalFallbackAllowed(env)) {
        throw err;
      }
    }
  }

  // Fallback to local cache
  const result: WalletRewardSettingsWithTiers[] = [];
  for (const [country, s] of localRewardSettingsCache.entries()) {
    const tiers = localTopupTiersCache.get(country) || [];
    result.push({
      ...s,
      tiers: [...tiers],
    });
  }
  return result;
}

/**
 * Retrieve reward settings and tiers for a specific country code.
 * Implements deterministic fallback policy:
 * 1. If countryCode is specified, require exact country match. If requestedCurrency is also provided,
 *    it MUST match the country configuration's currency; otherwise fail closed (return null).
 * 2. If countryCode is empty/undefined and requestedCurrency is MYR (or undefined), fallback to default MY.
 * 3. Never allow cross-country currency hijacking. Fail closed for unsupported country/currency combinations.
 */
export async function getRewardSettingsByCountry(
  countryCode: string | null | undefined,
  requestedCurrency?: string,
  env?: Record<string, any>
): Promise<WalletRewardSettingsWithTiers | null> {
  const normCountry = (countryCode || '').trim().toUpperCase();
  const normCurr = (requestedCurrency || '').trim().toUpperCase();
  const all = await getAllRewardSettings(env);

  // 1. When a specific country is requested:
  if (normCountry) {
    const exact = all.find((s) => s.country_code.toUpperCase() === normCountry && s.is_active);
    if (exact) {
      // If a currency was also specified, verify currency consistency
      if (normCurr && exact.currency.toUpperCase() !== normCurr) {
        console.warn(
          `[getRewardSettingsByCountry] Currency mismatch for country "${normCountry}": expected "${exact.currency}", got "${normCurr}". Failing closed.`
        );
        return null; // Fail closed on currency mismatch
      }
      return exact;
    }

    // If country is MY and currency is MYR (or unspecified), try fallback to MY default
    if (normCountry === 'MY' && (!normCurr || normCurr === 'MYR')) {
      const myDefault = all.find((s) => s.country_code === 'MY' && s.is_active);
      if (myDefault) return myDefault;
    }

    // Country requested was not found or not active -> fail closed!
    // Do NOT allow currency matching to pick up another country's policy.
    return null;
  }

  // 2. When country is unspecified:
  if (normCurr) {
    if (normCurr === 'MYR') {
      const myDefault = all.find((s) => s.country_code === 'MY' && s.is_active);
      if (myDefault) return myDefault;
    }
    // Match settings where currency matches and is active
    const currMatch = all.find((s) => s.currency.toUpperCase() === normCurr && s.is_active);
    return currMatch || null;
  }

  // 3. Fallback: Neither country nor currency specified -> default MY
  const defaultSetting = all.find((s) => s.country_code === 'MY' && s.is_active);
  return defaultSetting || null;
}

/**
 * Authoritatively resolves reward settings for an organization by organization ID.
 * Resolves both organization country and wallet currency, failing closed if mismatch occurs.
 */
export async function getRewardSettingsForOrganization(
  organizationId: string,
  env?: Record<string, any>
): Promise<WalletRewardSettingsWithTiers | null> {
  if (!organizationId) return null;
  const org = await getOrganizationById(organizationId, env);
  if (!org) return null;

  const country = (org.country_code || 'MY').trim().toUpperCase();

  // Inspect organization's authoritative wallet currency
  let walletCurrency: string | null = null;
  try {
    const { getWalletBalance } = await import('./wallet.js');
    const wallet = await getWalletBalance(organizationId, env, { readOnly: true, skipRepair: true });
    if (wallet?.currency) {
      walletCurrency = wallet.currency.trim().toUpperCase();
    }
  } catch {
    // If wallet read is not possible, fallback to expected country currency
  }

  const expectedCurrency = walletCurrency || getCurrencyForCountry(country) || 'MYR';
  const settings = await getRewardSettingsByCountry(country, expectedCurrency, env);

  if (!settings) {
    console.warn(
      `[getRewardSettingsForOrganization] Could not resolve reward settings for organization "${organizationId}" (country: ${country}, currency: ${expectedCurrency}).`
    );
    return null;
  }

  // Strict currency validation against wallet
  if (walletCurrency && settings.currency.toUpperCase() !== walletCurrency) {
    console.warn(
      `[getRewardSettingsForOrganization] Currency mismatch for organization "${organizationId}": wallet currency "${walletCurrency}" vs settings currency "${settings.currency}". Failing closed.`
    );
    return null;
  }

  return settings;
}

/**
 * Saves or updates reward settings and top-up tiers for a specific country.
 * Records audit snapshot in public.wallet_reward_settings_history.
 */
export async function saveRewardSettings(
  input: UpdateWalletRewardSettingsInput,
  updatedByUserId?: string | null,
  env?: Record<string, any>
): Promise<WalletRewardSettingsWithTiers> {
  const normCountry = (input.country_code || '').trim().toUpperCase();
  if (!normCountry || normCountry.length !== 2) {
    throw new Error('A valid 2-letter ISO country code is required.');
  }

  const resolvedCurrency = (
    input.currency ||
    getCurrencyForCountry(normCountry) ||
    'USD'
  ).trim().toUpperCase();

  const welcomeAmount = input.welcome_credit_amount !== undefined
    ? Number(input.welcome_credit_amount)
    : 800.00;
  if (isNaN(welcomeAmount) || welcomeAmount < 0) {
    throw new Error('Welcome credit amount must be a non-negative number.');
  }

  const showcaseAmount = input.showcase_credit_amount !== undefined
    ? Number(input.showcase_credit_amount)
    : 300.00;
  if (isNaN(showcaseAmount) || showcaseAmount < 0) {
    throw new Error('Showcase credit amount must be a non-negative number.');
  }

  const maxTopupPercent = input.max_topup_credit_per_event_percent !== undefined
    ? Number(input.max_topup_credit_per_event_percent)
    : 0.2000;
  if (isNaN(maxTopupPercent) || maxTopupPercent < 0 || maxTopupPercent > 1) {
    throw new Error('Maximum top-up credit per event percent must be between 0 and 1 (e.g. 0.20 for 20%).');
  }

  // Validate tiers if provided
  const inputTiers = input.tiers || [];
  if (inputTiers.length > 0) {
    validateTiersConfiguration(inputTiers);
  }

  const now = new Date().toISOString();
  const allExisting = await getAllRewardSettings(env);
  let existingSettings = allExisting.find((s) => s.country_code.toUpperCase() === normCountry) || null;
  const nextVersion = existingSettings ? existingSettings.version + 1 : 1;
  const settingsId = existingSettings ? existingSettings.id : crypto.randomUUID();

  const settingsRecord: WalletRewardSettingsRecord = {
    id: settingsId,
    country_code: normCountry,
    currency: resolvedCurrency,
    welcome_credit_amount: fromCents(toCents(welcomeAmount)),
    welcome_credit_enabled: input.welcome_credit_enabled !== undefined ? input.welcome_credit_enabled : true,
    showcase_credit_amount: fromCents(toCents(showcaseAmount)),
    showcase_credit_enabled: input.showcase_credit_enabled !== undefined ? input.showcase_credit_enabled : true,
    topup_bonus_enabled: input.topup_bonus_enabled !== undefined ? input.topup_bonus_enabled : true,
    max_topup_credit_per_event_percent: maxTopupPercent,
    is_active: input.is_active !== undefined ? input.is_active : true,
    version: nextVersion,
    updated_by: updatedByUserId || null,
    created_at: existingSettings ? existingSettings.created_at : now,
    updated_at: now,
  };

  const processedTiers: WalletTopupTierRecord[] = inputTiers.map((t, idx) => ({
    id: t.id || crypto.randomUUID(),
    reward_settings_id: settingsId,
    country_code: normCountry,
    currency: resolvedCurrency,
    tier_name: t.tier_name.trim() || `Tier ${idx + 1}`,
    min_deposit: fromCents(toCents(t.min_deposit)),
    max_deposit: t.max_deposit !== null && t.max_deposit !== undefined ? fromCents(toCents(t.max_deposit)) : null,
    calculation_type: t.calculation_type || 'PERCENTAGE',
    bonus_rate: t.calculation_type === 'PERCENTAGE' ? Number(t.bonus_rate || 0) : 0,
    bonus_fixed_amount: t.calculation_type === 'FIXED' ? fromCents(toCents(t.bonus_fixed_amount || 0)) : 0,
    max_bonus_amount: t.max_bonus_amount !== null && t.max_bonus_amount !== undefined
      ? fromCents(toCents(t.max_bonus_amount))
      : null,
    is_active: t.is_active !== false,
    sort_order: t.sort_order !== undefined ? t.sort_order : idx + 1,
    created_at: now,
    updated_at: now,
  }));

  // Database persistence
  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    try {
      const { error: upsertErr } = await supabase
        .from('wallet_reward_settings')
        .upsert(settingsRecord, { onConflict: 'country_code' });

      if (upsertErr) {
        if (!isLocalFallbackAllowed(env)) {
          throw new Error(`Failed to save wallet reward settings: ${upsertErr.message}`);
        }
        console.warn('DB error saving reward settings, falling back to local cache:', upsertErr.message);
      } else {
        // Replace tiers for this country
        await supabase
          .from('wallet_topup_tiers')
          .delete()
          .eq('reward_settings_id', settingsId);

        if (processedTiers.length > 0) {
          const { error: tiersErr } = await supabase
            .from('wallet_topup_tiers')
            .insert(processedTiers);

          if (tiersErr) {
            console.error('Error inserting topup tiers:', tiersErr);
          }
        }

        // Record history snapshot
        await supabase
          .from('wallet_reward_settings_history')
          .insert({
            settings_id: settingsId,
            country_code: normCountry,
            currency: resolvedCurrency,
            version: nextVersion,
            snapshot: {
              settings: settingsRecord,
              tiers: processedTiers,
            },
            changed_by: updatedByUserId || null,
            change_reason: input.change_reason || 'Developer Admin configuration update',
            created_at: now,
          });
      }
    } catch (dbErr: any) {
      if (!isLocalFallbackAllowed(env)) {
        throw dbErr;
      }
    }
  }

  // Update in-memory caches
  localRewardSettingsCache.set(normCountry, settingsRecord);
  localTopupTiersCache.set(normCountry, processedTiers);

  const historyList = localRewardSettingsHistoryCache.get(normCountry) || [];
  historyList.push({
    id: crypto.randomUUID(),
    settings_id: settingsId,
    country_code: normCountry,
    currency: resolvedCurrency,
    version: nextVersion,
    snapshot: {
      settings: settingsRecord,
      tiers: processedTiers,
    },
    changed_by: updatedByUserId || null,
    change_reason: input.change_reason || 'Developer Admin configuration update',
    created_at: now,
  });
  localRewardSettingsHistoryCache.set(normCountry, historyList);

  return {
    ...settingsRecord,
    tiers: processedTiers,
  };
}

/**
 * Retrieve audit history of reward settings changes.
 */
export async function getRewardSettingsHistory(
  countryCode?: string,
  env?: Record<string, any>
): Promise<WalletRewardSettingsHistoryRecord[]> {
  const normCountry = countryCode ? countryCode.trim().toUpperCase() : undefined;

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      let query = supabase
        .from('wallet_reward_settings_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (normCountry) {
        query = query.eq('country_code', normCountry);
      }

      const { data, error } = await query;
      if (!error && data) {
        return data as WalletRewardSettingsHistoryRecord[];
      }
    } catch {
      // Fallback
    }
  }

  const allHistory: WalletRewardSettingsHistoryRecord[] = [];
  for (const [country, list] of localRewardSettingsHistoryCache.entries()) {
    if (!normCountry || country === normCountry) {
      allHistory.push(...list);
    }
  }
  return allHistory.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}
