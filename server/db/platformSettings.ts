import { getSupabaseServerClient, isSupabaseConfigured, isLocalFallbackAllowed, assertProductionPricingSafe } from '../supabase.js';
import { PlatformPricingSettings, EventPricingRule, PlatformContactSettings } from './types.js';
import { normalizeEventDateBoundaries } from './events.js';
import { resolveGamePrice } from './gamePricing.js';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_EVENT_PRICE = 1400.00;
export const DEFAULT_EVENT_CURRENCY = 'MYR';

export const DEFAULT_CONTACT_SETTINGS: PlatformContactSettings = {
  whatsapp_number: '60162128913',
  whatsapp_display: '+60 16-212 8913',
  whatsapp_prefill_message: "Hello Event Game Studio! I'm interested in interactive game activations for an upcoming event. Could you share more details?",
  enquiry_email: 'contact@eventgamestudio.com',
  support_hours: 'Mon – Sat, 9:00 AM – 7:00 PM (UTC+8) | <15 min reply during live events',
  office_location: 'Kuala Lumpur, Malaysia (UTC+8)',
};

export const DEFAULT_PRICING_RULES: EventPricingRule[] = [
  { id: 'rule_1d', min_days: 1, max_days: 1, price: 1400.00, currency: 'MYR', active: true },
  { id: 'rule_2d', min_days: 2, max_days: 2, price: 1900.00, currency: 'MYR', active: true },
  { id: 'rule_3d', min_days: 3, max_days: 3, price: 2200.00, currency: 'MYR', active: true },
  { id: 'rule_4d', min_days: 4, max_days: 4, price: 2400.00, currency: 'MYR', active: true },
  { id: 'rule_5d', min_days: 5, max_days: 5, price: 2500.00, currency: 'MYR', active: true },
  { id: 'rule_6d', min_days: 6, max_days: 6, price: 2600.00, currency: 'MYR', active: true },
  { id: 'rule_7d', min_days: 7, max_days: 7, price: 2800.00, currency: 'MYR', active: true },
  { id: 'rule_8_14d', min_days: 8, max_days: 14, price: 3500.00, currency: 'MYR', active: true },
  { id: 'rule_15_30d', min_days: 15, max_days: 30, price: 4500.00, currency: 'MYR', active: true },
  { id: 'rule_31_60d', min_days: 31, max_days: 60, price: 6000.00, currency: 'MYR', active: true },
  { id: 'rule_61_90d', min_days: 61, max_days: 90, price: 8000.00, currency: 'MYR', active: true },
  { id: 'rule_91plus', min_days: 91, max_days: null, price: 10000.00, currency: 'MYR', active: true },
];

const LOCAL_PLATFORM_SETTINGS_FILE = path.join(process.cwd(), 'uploads', 'platform_settings.json');

let localSettingsCache: Record<string, any> = {
  event_pricing: {
    default_price: DEFAULT_EVENT_PRICE,
    default_currency: DEFAULT_EVENT_CURRENCY,
    pricing_rules: DEFAULT_PRICING_RULES,
    updated_at: new Date().toISOString(),
  },
  contact_settings: {
    ...DEFAULT_CONTACT_SETTINGS,
    updated_at: new Date().toISOString(),
  },
};

function loadLocalSettings(): void {
  try {
    if (!isLocalFallbackAllowed()) return;
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

function saveLocalSettings(env?: Record<string, any>): void {
  try {
    if (!isLocalFallbackAllowed(env)) return;
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
 * Calculates calendar-day duration (Start Date to End Date).
 *
 * Examples:
 * - 01/09/2026 to 01/09/2026 = 1 day
 * - 01/09/2026 to 02/09/2026 = 2 days
 * - 01/09/2026 to 14/09/2026 = 14 days
 * - 31/08/2026 to 01/09/2026 = 2 days
 * - 28/02/2024 to 01/03/2024 = 3 days (leap year)
 * - 28/02/2025 to 01/03/2025 = 2 days (non-leap)
 */
export function calculateEventCalendarDays(
  startDateVal: string | Date | null | undefined,
  endDateVal: string | Date | null | undefined
): number {
  const extractDate = (val: string | Date | null | undefined): string => {
    if (!val) return '';
    if (typeof val === 'string') {
      const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) return `${match[1]}-${match[2]}-${match[3]}`;
      const dt = new Date(val);
      if (isNaN(dt.getTime())) return '';
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
    }
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${val.getUTCFullYear()}-${pad(val.getUTCMonth() + 1)}-${pad(val.getUTCDate())}`;
  };

  const startStr = extractDate(startDateVal);
  const endStr = extractDate(endDateVal) || startStr;

  if (!startStr) return 1;

  const [y1, m1, d1] = startStr.split('-').map(Number);
  const [y2, m2, d2] = (endStr || startStr).split('-').map(Number);

  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 1;

  const startUtc = Date.UTC(y1, m1 - 1, d1);
  const endUtc = Date.UTC(y2, m2 - 1, d2);

  if (endUtc < startUtc) return 1;

  const diffMs = endUtc - startUtc;
  const days = Math.round(diffMs / 86400000) + 1;
  return Math.max(1, days);
}

/**
 * Returns human-readable label for a pricing rule (e.g., "1 day", "8–14 days", "91+ days").
 */
export function formatPricingRuleLabel(rule: EventPricingRule): string {
  if (rule.min_days === rule.max_days) {
    return `${rule.min_days} day${rule.min_days > 1 ? 's' : ''}`;
  }
  if (rule.max_days === null) {
    return `${rule.min_days}+ days`;
  }
  return `${rule.min_days}–${rule.max_days} days`;
}

/**
 * Finds the active pricing rule matching the given calendar-day duration.
 */
export function matchPricingRuleForDuration(
  durationDays: number,
  rules: EventPricingRule[]
): EventPricingRule | null {
  const activeRules = rules.filter((r) => r.active !== false);
  const sorted = [...activeRules].sort((a, b) => a.min_days - b.min_days);
  for (const rule of sorted) {
    const min = rule.min_days;
    const max = rule.max_days;
    if (durationDays >= min && (max === null || durationDays <= max)) {
      return rule;
    }
  }
  return null;
}

/**
 * Validates an array of event pricing rules.
 * Enforces:
 * - Minimum days > 0 and integer
 * - Maximum days >= minimum days (or null for unlimited)
 * - Price > 0
 * - No overlapping active day ranges
 */
export function validatePricingRules(rules: EventPricingRule[]): { valid: boolean; error?: string } {
  if (!Array.isArray(rules) || rules.length === 0) {
    return { valid: false, error: 'At least one pricing rule is required' };
  }

  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (typeof r.min_days !== 'number' || !Number.isInteger(r.min_days) || r.min_days <= 0) {
      return { valid: false, error: `Rule #${i + 1}: Minimum days must be a positive integer greater than 0` };
    }
    if (r.max_days !== null && (typeof r.max_days !== 'number' || !Number.isInteger(r.max_days) || r.max_days < r.min_days)) {
      return { valid: false, error: `Rule #${i + 1}: Maximum days must be greater than or equal to minimum days` };
    }
    if (typeof r.price !== 'number' || isNaN(r.price) || r.price <= 0) {
      return { valid: false, error: `Rule #${i + 1}: Price must be a positive number greater than 0` };
    }
    if (!r.currency || typeof r.currency !== 'string' || r.currency.trim().length === 0) {
      return { valid: false, error: `Rule #${i + 1}: Currency is required` };
    }
  }

  const activeRules = rules.filter((r) => r.active !== false);
  for (let i = 0; i < activeRules.length; i++) {
    for (let j = i + 1; j < activeRules.length; j++) {
      const a = activeRules[i];
      const b = activeRules[j];
      const aMin = a.min_days;
      const aMax = a.max_days ?? Infinity;
      const bMin = b.min_days;
      const bMax = b.max_days ?? Infinity;

      if (Math.max(aMin, bMin) <= Math.min(aMax, bMax)) {
        return {
          valid: false,
          error: `Pricing rules overlap: "${formatPricingRuleLabel(a)}" and "${formatPricingRuleLabel(b)}"`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Calculates authoritative event price and matching rule label from duration and settings.
 */
export function calculateEventPriceFromDuration(
  durationDays: number,
  settings: PlatformPricingSettings
): {
  price: number;
  currency: string;
  matchedRule: EventPricingRule | null;
  ruleLabel: string;
} {
  const rules = Array.isArray(settings?.pricing_rules) ? settings.pricing_rules : [];

  const matched = matchPricingRuleForDuration(durationDays, rules);
  if (matched && matched.price > 0) {
    return {
      price: matched.price,
      currency: matched.currency || settings.default_currency || DEFAULT_EVENT_CURRENCY,
      matchedRule: matched,
      ruleLabel: formatPricingRuleLabel(matched),
    };
  }

  // If settings corrupt or no valid price configured at all:
  if (!settings || (!rules.length && (!settings.default_price || settings.default_price <= 0))) {
    const err: any = new Error('Pricing service temporarily unavailable: No valid duration rule or base price configured');
    err.status = 503;
    throw err;
  }

  // Business Rule: No pricing tier covers this duration -> fail closed with NO_PRICING_TIER
  const err: any = new Error(`No pricing tier is configured for a ${durationDays}-day event.`);
  err.code = 'NO_PRICING_TIER';
  err.status = 422;
  throw err;
}

/**
 * Calculates server-authoritative event pricing from date boundaries and selected game.
 */
export async function calculateEventAuthoritativePrice(
  params: {
    game_id?: string | null;
    gameId?: string | null;
    game_theme_id?: string | null;
    gameThemeId?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    event_date?: string | null;
    starts_at?: string | null;
    expires_at?: string | null;
  },
  env?: Record<string, any>
): Promise<{
  durationDays: number;
  price: number;
  currency: string;
  ruleLabel: string;
  tierId?: string | null;
  matchedRule: EventPricingRule | any | null;
}> {
  const norm = normalizeEventDateBoundaries(params);
  const durationDays = calculateEventCalendarDays(norm.startDate, norm.endDate);
  const targetGameId = params.game_id || params.gameId;

  // If a specific game is specified, resolve through the game-level pricing architecture
  if (targetGameId) {
    const gameQuote = await resolveGamePrice(targetGameId, durationDays, env);
    return {
      durationDays,
      price: gameQuote.price,
      currency: gameQuote.currency,
      ruleLabel: gameQuote.ruleLabel,
      tierId: gameQuote.tierId,
      matchedRule: gameQuote.tier,
    };
  }

  // Fallback to platform settings if no game is specified
  const settings = await getPlatformPricingSettings(env);
  const calc = calculateEventPriceFromDuration(durationDays, settings);
  return {
    durationDays,
    price: calc.price,
    currency: calc.currency,
    ruleLabel: calc.ruleLabel,
    tierId: calc.matchedRule?.id || null,
    matchedRule: calc.matchedRule,
  };
}

/**
 * Get current platform default event pricing configuration and duration pricing rules.
 * Server-authoritative source for new event creation pricing.
 *
 * FAIL-CLOSED ARCHITECTURE GUARANTEE:
 * When Supabase is configured or in production:
 * If the database is unavailable, times out, throws an error, or if the pricing record is missing:
 * This function FAILS CLOSED by throwing:
 *   "Pricing service temporarily unavailable"
 * It NEVER silently catches errors, NEVER falls back to localSettingsCache,
 * and NEVER invents a default production price (e.g. RM1,400).
 */
export async function getPlatformPricingSettings(env?: Record<string, any>): Promise<PlatformPricingSettings> {
  const buildSettingsFromData = (val: any, updatedAt?: string, updatedBy?: string | null): PlatformPricingSettings => {
    if (!val || typeof val !== 'object') {
      const err: any = new Error('Pricing service temporarily unavailable: Invalid platform pricing configuration');
      err.status = 503;
      throw err;
    }

    const price = Number(val.default_price);
    const defaultCurrency = val.default_currency || DEFAULT_EVENT_CURRENCY;

    let rules: EventPricingRule[] = [];
    if (Array.isArray(val.pricing_rules) && val.pricing_rules.length > 0) {
      rules = val.pricing_rules;
    } else if (!isNaN(price) && price > 0) {
      // Sync default_price into standard duration rules
      rules = DEFAULT_PRICING_RULES.map((r) =>
        r.id === 'rule_1d' ? { ...r, price, currency: defaultCurrency } : { ...r, currency: defaultCurrency }
      );
    } else {
      const err: any = new Error('Pricing service temporarily unavailable: No valid pricing rules or default price configured');
      err.status = 503;
      throw err;
    }

    const defaultPrice = !isNaN(price) && price > 0
      ? price
      : (rules.find((r) => r.id === 'rule_1d')?.price || rules[0]?.price);

    if (!defaultPrice || isNaN(defaultPrice) || defaultPrice <= 0) {
      const err: any = new Error('Pricing service temporarily unavailable: Default event price is missing or invalid');
      err.status = 503;
      throw err;
    }

    return {
      default_price: defaultPrice,
      default_currency: defaultCurrency,
      pricing_rules: rules,
      updated_at: updatedAt || val.updated_at || new Date().toISOString(),
      updated_by: updatedBy || val.updated_by || null,
    };
  };

  const isProd = !isLocalFallbackAllowed(env);
  const hasSupabase = isSupabaseConfigured(env);

  // 1. Production Mode Check: Database must be configured
  if (isProd && !hasSupabase) {
    const err: any = new Error('Pricing service temporarily unavailable: Database is not configured in production');
    err.status = 503;
    throw err;
  }

  // 2. Authoritative Database Mode (Production or whenever Supabase credentials are configured):
  // FAIL CLOSED: If Supabase query fails, times out, or record is missing, THROW 503.
  // NEVER fall back to localSettingsCache or invent RM1,400!
  if (hasSupabase || isProd) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*')
        .eq('key', 'event_pricing')
        .maybeSingle();

      if (error) {
        console.error('Database error fetching platform pricing settings:', error);
        const err: any = new Error(`Pricing service temporarily unavailable: ${error.message}`);
        err.status = 503;
        throw err;
      }

      if (!data || !data.value) {
        console.warn('Authoritative platform pricing settings record missing from database, auto-seeding defaults...');
        const defaultValuePayload = {
          default_price: DEFAULT_EVENT_PRICE,
          default_currency: DEFAULT_EVENT_CURRENCY,
          pricing_rules: DEFAULT_PRICING_RULES,
          updated_at: new Date().toISOString(),
          updated_by: null,
        };

        const { data: seeded, error: seedError } = await supabase
          .from('platform_settings')
          .upsert({
            key: 'event_pricing',
            value: defaultValuePayload,
            description: 'Platform default event pricing configuration for new events',
            updated_at: new Date().toISOString(),
          })
          .select('*')
          .maybeSingle();

        if (seedError || !seeded || !seeded.value) {
          console.error('Failed to auto-seed platform pricing settings:', seedError);
          const err: any = new Error('Pricing service temporarily unavailable: Platform pricing settings not found in database');
          err.status = 503;
          throw err;
        }

        const val = typeof seeded.value === 'string' ? JSON.parse(seeded.value) : seeded.value;
        return buildSettingsFromData(val, seeded.updated_at, seeded.updated_by);
      }

      const val = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      return buildSettingsFromData(val, data.updated_at, data.updated_by);
    } catch (err: any) {
      if (err?.status === 503 || err?.message?.includes('Pricing service temporarily unavailable')) {
        throw err;
      }
      console.error('Fatal: Exception querying platform pricing settings from database:', err);
      const failClosedErr: any = new Error(`Pricing service temporarily unavailable: ${err?.message || 'Database unavailable'}`);
      failClosedErr.status = 503;
      throw failClosedErr;
    }
  }

  // 3. Isolated Local Offline Dev/Test Sandbox ONLY (when Supabase is NOT configured and local fallback is allowed):
  const cached = localSettingsCache.event_pricing || {};
  return buildSettingsFromData(cached, cached.updated_at, cached.updated_by);
}

/**
 * Update platform default event pricing configuration and duration pricing rules.
 * Requires Developer Admin authorization.
 * Only affects newly created events; does not modify existing events.
 */
export async function updatePlatformPricingSettings(
  updates: {
    default_price?: number;
    default_currency?: string;
    pricing_rules?: EventPricingRule[];
  },
  updatedBy?: string,
  env?: Record<string, any>
): Promise<PlatformPricingSettings> {
  const currentSettings = await getPlatformPricingSettings(env);

  let newCurrency = (updates.default_currency || currentSettings.default_currency || DEFAULT_EVENT_CURRENCY).trim().toUpperCase();
  if (!newCurrency || newCurrency.length > 5) {
    throw new Error('Invalid currency code');
  }

  let newRules: EventPricingRule[] = updates.pricing_rules || currentSettings.pricing_rules || DEFAULT_PRICING_RULES;

  // If default_price was explicitly supplied:
  let newDefaultPrice = updates.default_price !== undefined ? Number(updates.default_price) : currentSettings.default_price;
  if (isNaN(newDefaultPrice) || newDefaultPrice <= 0) {
    throw new Error('Default event price must be greater than 0');
  }

  // If new pricing_rules are provided, validate them
  if (updates.pricing_rules) {
    const validation = validatePricingRules(updates.pricing_rules);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid pricing rules');
    }
    newRules = updates.pricing_rules;

    // Sync 1-day rule price with default_price if not explicitly set
    const day1Rule = newRules.find((r) => r.min_days === 1 && r.max_days === 1 && r.active);
    if (day1Rule && updates.default_price === undefined) {
      newDefaultPrice = day1Rule.price;
    }
  } else if (updates.default_price !== undefined) {
    // If only default_price was updated, sync the 1-day rule
    newRules = newRules.map((r) =>
      r.min_days === 1 && r.max_days === 1 ? { ...r, price: newDefaultPrice, currency: newCurrency } : r
    );
  }

  const now = new Date().toISOString();
  const valuePayload = {
    default_price: newDefaultPrice,
    default_currency: newCurrency,
    pricing_rules: newRules,
    updated_at: now,
    updated_by: updatedBy || null,
  };

  if (!isLocalFallbackAllowed(env)) {
    if (!isSupabaseConfigured(env)) {
      const err: any = new Error('Pricing service temporarily unavailable: Database is not configured in production');
      err.status = 503;
      throw err;
    }
    const supabase = getSupabaseServerClient(env);
    const { error } = await supabase
      .from('platform_settings')
      .upsert({
        key: 'event_pricing',
        value: valuePayload,
        description: 'Platform default event pricing and duration rules for new events',
        updated_by: updatedBy || null,
        updated_at: now,
      });

    if (error) {
      const err: any = new Error(`Pricing service temporarily unavailable: ${error.message}`);
      err.status = 503;
      throw err;
    }

    return {
      default_price: newDefaultPrice,
      default_currency: newCurrency,
      pricing_rules: newRules,
      updated_at: now,
      updated_by: updatedBy || null,
    };
  }

  // Development / test fallback flow:
  localSettingsCache.event_pricing = valuePayload;
  saveLocalSettings(env);

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { error } = await supabase
        .from('platform_settings')
        .upsert({
          key: 'event_pricing',
          value: valuePayload,
          description: 'Platform default event pricing and duration rules for new events',
          updated_by: updatedBy || null,
          updated_at: now,
        });
      if (error) {
        const err: any = new Error(`Pricing service temporarily unavailable: ${error.message}`);
        err.status = 503;
        throw err;
      }
    } catch (err: any) {
      if (err?.status === 503 || err?.message?.includes('Pricing service temporarily unavailable')) {
        throw err;
      }
      console.error('Fatal: Exception saving platform pricing settings to database:', err);
      const failClosedErr: any = new Error(`Pricing service temporarily unavailable: ${err?.message || 'Database unavailable'}`);
      failClosedErr.status = 503;
      throw failClosedErr;
    }
  }

  return {
    default_price: newDefaultPrice,
    default_currency: newCurrency,
    pricing_rules: newRules,
    updated_at: now,
    updated_by: updatedBy || null,
  };
}

/**
 * Retrieve current platform WhatsApp contact, enquiry email, support hours, and office location.
 * Accessible publicly for landing/contact pages and by admin panels.
 */
export async function getPlatformContactSettings(env?: Record<string, any>): Promise<PlatformContactSettings> {
  const buildContactFromData = (val: any, updatedAt?: string, updatedBy?: string | null): PlatformContactSettings => {
    if (!val || typeof val !== 'object') {
      return { ...DEFAULT_CONTACT_SETTINGS, updated_at: new Date().toISOString() };
    }

    const whatsappNumber = typeof val.whatsapp_number === 'string' && val.whatsapp_number.trim()
      ? val.whatsapp_number.trim().replace(/\D/g, '')
      : DEFAULT_CONTACT_SETTINGS.whatsapp_number;

    const whatsappDisplay = typeof val.whatsapp_display === 'string' && val.whatsapp_display.trim()
      ? val.whatsapp_display.trim()
      : (whatsappNumber ? `+${whatsappNumber}` : DEFAULT_CONTACT_SETTINGS.whatsapp_display);

    const whatsappPrefill = typeof val.whatsapp_prefill_message === 'string'
      ? val.whatsapp_prefill_message
      : DEFAULT_CONTACT_SETTINGS.whatsapp_prefill_message;

    const enquiryEmail = typeof val.enquiry_email === 'string' && val.enquiry_email.trim()
      ? val.enquiry_email.trim()
      : DEFAULT_CONTACT_SETTINGS.enquiry_email;

    const supportHours = typeof val.support_hours === 'string' && val.support_hours.trim()
      ? val.support_hours.trim()
      : DEFAULT_CONTACT_SETTINGS.support_hours;

    const officeLocation = typeof val.office_location === 'string' && val.office_location.trim()
      ? val.office_location.trim()
      : DEFAULT_CONTACT_SETTINGS.office_location;

    return {
      whatsapp_number: whatsappNumber || DEFAULT_CONTACT_SETTINGS.whatsapp_number,
      whatsapp_display: whatsappDisplay || DEFAULT_CONTACT_SETTINGS.whatsapp_display,
      whatsapp_prefill_message: whatsappPrefill,
      enquiry_email: enquiryEmail,
      support_hours: supportHours,
      office_location: officeLocation,
      updated_at: updatedAt || val.updated_at || new Date().toISOString(),
      updated_by: updatedBy || val.updated_by || null,
    };
  };

  // If Supabase is configured, fetch from platform_settings table
  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*')
        .eq('key', 'contact_settings')
        .maybeSingle();

      if (!error && data && data.value) {
        const val = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        return buildContactFromData(val, data.updated_at, data.updated_by);
      }
    } catch (err) {
      console.warn('Notice: Error fetching contact_settings from database, using cached/default:', err);
    }
  }

  // Dev fallback / default cache
  const cached = localSettingsCache.contact_settings || {};
  return buildContactFromData(cached, cached.updated_at, cached.updated_by);
}

/**
 * Update platform WhatsApp contact, enquiry email, support hours, and office location.
 * Requires Developer Admin authorization.
 */
export async function updatePlatformContactSettings(
  updates: Partial<PlatformContactSettings>,
  updatedBy?: string,
  env?: Record<string, any>
): Promise<PlatformContactSettings> {
  const current = await getPlatformContactSettings(env);

  let cleanedWhatsappNumber = current.whatsapp_number;
  if (updates.whatsapp_number !== undefined) {
    const rawNumber = String(updates.whatsapp_number).trim();
    const digitsOnly = rawNumber.replace(/\D/g, '');
    if (digitsOnly.length < 5) {
      throw new Error('WhatsApp contact number must include a valid country code and at least 5 digits');
    }
    cleanedWhatsappNumber = digitsOnly;
  }

  let cleanedWhatsappDisplay = current.whatsapp_display;
  if (updates.whatsapp_display !== undefined) {
    cleanedWhatsappDisplay = String(updates.whatsapp_display).trim();
    if (!cleanedWhatsappDisplay) {
      cleanedWhatsappDisplay = `+${cleanedWhatsappNumber}`;
    }
  }

  let cleanedWhatsappPrefill = current.whatsapp_prefill_message;
  if (updates.whatsapp_prefill_message !== undefined) {
    cleanedWhatsappPrefill = String(updates.whatsapp_prefill_message).trim();
    if (cleanedWhatsappPrefill.length > 500) {
      throw new Error('WhatsApp prefilled message cannot exceed 500 characters');
    }
  }

  let cleanedEnquiryEmail = current.enquiry_email;
  if (updates.enquiry_email !== undefined) {
    const emailStr = String(updates.enquiry_email).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailStr)) {
      throw new Error('Please enter a valid enquiry email address');
    }
    cleanedEnquiryEmail = emailStr;
  }

  const cleanedSupportHours = updates.support_hours !== undefined
    ? String(updates.support_hours).trim()
    : current.support_hours;

  const cleanedOfficeLocation = updates.office_location !== undefined
    ? String(updates.office_location).trim()
    : current.office_location;

  const now = new Date().toISOString();
  const valuePayload: PlatformContactSettings = {
    whatsapp_number: cleanedWhatsappNumber,
    whatsapp_display: cleanedWhatsappDisplay,
    whatsapp_prefill_message: cleanedWhatsappPrefill,
    enquiry_email: cleanedEnquiryEmail,
    support_hours: cleanedSupportHours,
    office_location: cleanedOfficeLocation,
    updated_at: now,
    updated_by: updatedBy || null,
  };

  // 1. If Supabase configured, update database
  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { error } = await supabase
        .from('platform_settings')
        .upsert({
          key: 'contact_settings',
          value: valuePayload,
          description: 'Platform WhatsApp contact, enquiry email, support hours, and office location',
          updated_by: updatedBy || null,
          updated_at: now,
        });

      if (error) {
        console.error('Error saving contact_settings to database:', error);
        throw new Error(`Database error updating contact settings: ${error.message}`);
      }
    } catch (err: any) {
      console.error('Exception updating contact_settings in database:', err);
      if (!isLocalFallbackAllowed(env)) {
        throw err;
      }
    }
  }

  // 2. Update local fallback cache
  localSettingsCache.contact_settings = valuePayload;
  saveLocalSettings(env);

  return valuePayload;
}


