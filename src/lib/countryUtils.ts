/**
 * Country definitions and regional utilities for Event Game Studio.
 * ISO 3166-1 alpha-2 country codes are used as authoritative storage values.
 *
 * NOTE: Country is an organization/business profile setting and serves only as
 * a default/reference for regional configurations. It must NOT overwrite or
 * replace event-specific timezones (such as event_timezone).
 */

export interface CountryItem {
  code: string; // ISO 3166-1 alpha-2 (e.g. 'SG')
  name: string;
  defaultTimezone: string;
  currencyCode?: string;
}

/**
 * Standard list of supported countries for Event Game Studio.
 * Ordered with prominent regional hubs first, followed by alphabetical global countries.
 */
export const COUNTRIES: CountryItem[] = [
  // Southeast Asia & Regional Hubs
  { code: 'SG', name: 'Singapore', defaultTimezone: 'Asia/Singapore', currencyCode: 'SGD' },
  { code: 'MY', name: 'Malaysia', defaultTimezone: 'Asia/Kuala_Lumpur', currencyCode: 'MYR' },
  { code: 'TH', name: 'Thailand', defaultTimezone: 'Asia/Bangkok', currencyCode: 'THB' },
  { code: 'ID', name: 'Indonesia', defaultTimezone: 'Asia/Jakarta', currencyCode: 'IDR' },
  { code: 'PH', name: 'Philippines', defaultTimezone: 'Asia/Manila', currencyCode: 'PHP' },
  { code: 'VN', name: 'Vietnam', defaultTimezone: 'Asia/Ho_Chi_Minh', currencyCode: 'VND' },
  { code: 'JP', name: 'Japan', defaultTimezone: 'Asia/Tokyo', currencyCode: 'JPY' },
  { code: 'KR', name: 'South Korea', defaultTimezone: 'Asia/Seoul', currencyCode: 'KRW' },
  { code: 'TW', name: 'Taiwan', defaultTimezone: 'Asia/Taipei', currencyCode: 'TWD' },
  { code: 'HK', name: 'Hong Kong', defaultTimezone: 'Asia/Hong_Kong', currencyCode: 'HKD' },
  { code: 'AU', name: 'Australia', defaultTimezone: 'Australia/Sydney', currencyCode: 'AUD' },
  { code: 'NZ', name: 'New Zealand', defaultTimezone: 'Pacific/Auckland', currencyCode: 'NZD' },
  { code: 'IN', name: 'India', defaultTimezone: 'Asia/Kolkata', currencyCode: 'INR' },

  // North America & Europe
  { code: 'US', name: 'United States', defaultTimezone: 'America/New_York', currencyCode: 'USD' },
  { code: 'GB', name: 'United Kingdom', defaultTimezone: 'Europe/London', currencyCode: 'GBP' },
  { code: 'CA', name: 'Canada', defaultTimezone: 'America/Toronto', currencyCode: 'CAD' },
  { code: 'DE', name: 'Germany', defaultTimezone: 'Europe/Berlin', currencyCode: 'EUR' },
  { code: 'FR', name: 'France', defaultTimezone: 'Europe/Paris', currencyCode: 'EUR' },
  { code: 'NL', name: 'Netherlands', defaultTimezone: 'Europe/Amsterdam', currencyCode: 'EUR' },
  { code: 'CH', name: 'Switzerland', defaultTimezone: 'Europe/Zurich', currencyCode: 'CHF' },
  { code: 'AE', name: 'United Arab Emirates', defaultTimezone: 'Asia/Dubai', currencyCode: 'AED' },
  { code: 'SA', name: 'Saudi Arabia', defaultTimezone: 'Asia/Riyadh', currencyCode: 'SAR' },
  { code: 'BR', name: 'Brazil', defaultTimezone: 'America/Sao_Paulo', currencyCode: 'BRL' },
  { code: 'MX', name: 'Mexico', defaultTimezone: 'America/Mexico_City', currencyCode: 'MXN' },
  { code: 'ZA', name: 'South Africa', defaultTimezone: 'Africa/Johannesburg', currencyCode: 'ZAR' },
  { code: 'ES', name: 'Spain', defaultTimezone: 'Europe/Madrid', currencyCode: 'EUR' },
  { code: 'IT', name: 'Italy', defaultTimezone: 'Europe/Rome', currencyCode: 'EUR' },
  { code: 'SE', name: 'Sweden', defaultTimezone: 'Europe/Stockholm', currencyCode: 'SEK' },
  { code: 'NO', name: 'Norway', defaultTimezone: 'Europe/Oslo', currencyCode: 'NOK' },
  { code: 'IE', name: 'Ireland', defaultTimezone: 'Europe/Dublin', currencyCode: 'EUR' },
];

const COUNTRY_LOOKUP = new Map<string, CountryItem>();
for (const country of COUNTRIES) {
  COUNTRY_LOOKUP.set(country.code.toUpperCase(), country);
}

/**
 * Validate whether a string is a recognized ISO 3166-1 alpha-2 country code.
 */
export function isValidCountryCode(code: string | null | undefined): boolean {
  if (!code || typeof code !== 'string') return false;
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length !== 2) return false;
  return COUNTRY_LOOKUP.has(trimmed);
}

/**
 * Lookup CountryItem by ISO country code (case-insensitive).
 */
export function getCountryByCode(code: string | null | undefined): CountryItem | undefined {
  if (!code || typeof code !== 'string') return undefined;
  return COUNTRY_LOOKUP.get(code.trim().toUpperCase());
}

/**
 * Get human-readable country display name for an ISO country code.
 * Falls back to the code itself if not found.
 */
export function getCountryDisplayName(code: string | null | undefined): string {
  if (!code) return '';
  const country = getCountryByCode(code);
  return country ? country.name : code.toUpperCase();
}

/**
 * Get the default reference timezone for an organization's country.
 *
 * IMPORTANT:
 * Country and event timezone are NOT the same thing.
 * This helper provides an advisory default for new events created by an
 * organization in that country, but must NEVER overwrite or replace an
 * event's explicit `event_timezone`.
 */
export function getDefaultTimezoneForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return 'Asia/Singapore';
  const country = getCountryByCode(countryCode);
  return country ? country.defaultTimezone : 'Asia/Singapore';
}
