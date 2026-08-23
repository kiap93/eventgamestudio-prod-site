import { getSupabaseServerClient, isSupabaseConfigured } from '../supabase.js';
import { PlatformPricingSettings } from './types.js';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_EVENT_PRICE = 1400.00;
export const DEFAULT_EVENT_CURRENCY = 'MYR';

const LOCAL_PLATFORM_SETTINGS_FILE = path.join(process.cwd(), 'uploads', 'platform_settings.json');

let localSettingsCache: Record<string, any> = {
  event_pricing: {
    default_price: DEFAULT_EVENT_PRICE,
    default_currency: DEFAULT_EVENT_CURRENCY,
    updated_at: new Date().toISOString(),
  },
};

function loadLocalSettings(): void {
  try {
    if (fs.existsSync(LOCAL_PLATFORM_SETTINGS_FILE)) {
      const raw = fs.readFileSync(LOCAL_PLATFORM_SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        localSettingsCache = { ...localSettingsCache, ...parsed };
      }
    }
  } catch (err) {
    console.warn('Warning loading local platform settings:', err);
  }
}

function saveLocalSettings(): void {
  try {
    const dir = path.dirname(LOCAL_PLATFORM_SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_PLATFORM_SETTINGS_FILE, JSON.stringify(localSettingsCache, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Warning saving local platform settings:', err);
  }
}

loadLocalSettings();

/**
 * Get current platform default event pricing configuration.
 * Server-authoritative source for new event creation pricing.
 */
export async function getPlatformPricingSettings(env?: Record<string, any>): Promise<PlatformPricingSettings> {
  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*')
        .eq('key', 'event_pricing')
        .maybeSingle();

      if (!error && data && data.value) {
        const val = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        const price = Number(val.default_price);
        return {
          default_price: !isNaN(price) && price > 0 ? price : DEFAULT_EVENT_PRICE,
          default_currency: val.default_currency || DEFAULT_EVENT_CURRENCY,
          updated_at: data.updated_at || new Date().toISOString(),
          updated_by: data.updated_by || null,
        };
      }
    } catch (err) {
      console.warn('Notice loading platform settings from Supabase, using local fallback:', err);
    }
  }

  const cached = localSettingsCache.event_pricing || {};
  const price = Number(cached.default_price);
  return {
    default_price: !isNaN(price) && price > 0 ? price : DEFAULT_EVENT_PRICE,
    default_currency: cached.default_currency || DEFAULT_EVENT_CURRENCY,
    updated_at: cached.updated_at || new Date().toISOString(),
    updated_by: cached.updated_by || null,
  };
}

/**
 * Update platform default event pricing configuration.
 * Requires Developer Admin authorization.
 * Only affects newly created events; does not modify existing events.
 */
export async function updatePlatformPricingSettings(
  updates: { default_price: number; default_currency?: string },
  updatedBy?: string,
  env?: Record<string, any>
): Promise<PlatformPricingSettings> {
  const price = Number(updates.default_price);
  if (isNaN(price) || price <= 0) {
    throw new Error('Default event price must be greater than 0');
  }
  const currency = (updates.default_currency || DEFAULT_EVENT_CURRENCY).trim().toUpperCase();
  if (!currency || currency.length > 5) {
    throw new Error('Invalid currency code');
  }

  const now = new Date().toISOString();
  const valuePayload = {
    default_price: price,
    default_currency: currency,
  };

  localSettingsCache.event_pricing = {
    ...valuePayload,
    updated_at: now,
    updated_by: updatedBy || null,
  };
  saveLocalSettings();

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      await supabase
        .from('platform_settings')
        .upsert({
          key: 'event_pricing',
          value: valuePayload,
          description: 'Platform default event pricing configuration for new events',
          updated_by: updatedBy || null,
          updated_at: now,
        });
    } catch (err) {
      console.warn('Notice saving platform settings to Supabase:', err);
    }
  }

  return {
    default_price: price,
    default_currency: currency,
    updated_at: now,
    updated_by: updatedBy || null,
  };
}
