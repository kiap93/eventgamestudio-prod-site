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
  flag: string;
  defaultTimezone: string;
  currencyCode: string;
}

export type Country = CountryItem;

/**
 * Popular and regional country codes for quick selection.
 * Every code here exists in the supported COUNTRIES array.
 */
export const POPULAR_COUNTRY_CODES: string[] = [
  'SG',
  'MY',
  'TH',
  'ID',
  'PH',
  'VN',
  'JP',
  'AU',
  'US',
  'GB',
];

/**
 * Standard list of supported countries for Event Game Studio.
 * Ordered with prominent regional hubs first, followed by alphabetical global countries.
 */
export const COUNTRIES: CountryItem[] = [
  // Southeast Asia & Regional Hubs
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', defaultTimezone: 'Asia/Singapore', currencyCode: 'SGD' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', defaultTimezone: 'Asia/Kuala_Lumpur', currencyCode: 'MYR' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭', defaultTimezone: 'Asia/Bangkok', currencyCode: 'THB' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', defaultTimezone: 'Asia/Jakarta', currencyCode: 'IDR' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭', defaultTimezone: 'Asia/Manila', currencyCode: 'PHP' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳', defaultTimezone: 'Asia/Ho_Chi_Minh', currencyCode: 'VND' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', defaultTimezone: 'Asia/Tokyo', currencyCode: 'JPY' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷', defaultTimezone: 'Asia/Seoul', currencyCode: 'KRW' },
  { code: 'TW', name: 'Taiwan', flag: '🇹🇼', defaultTimezone: 'Asia/Taipei', currencyCode: 'TWD' },
  { code: 'HK', name: 'Hong Kong', flag: '🇭🇰', defaultTimezone: 'Asia/Hong_Kong', currencyCode: 'HKD' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', defaultTimezone: 'Australia/Sydney', currencyCode: 'AUD' },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', defaultTimezone: 'Pacific/Auckland', currencyCode: 'NZD' },
  { code: 'IN', name: 'India', flag: '🇮🇳', defaultTimezone: 'Asia/Kolkata', currencyCode: 'INR' },

  // North America & Europe & International
  { code: 'US', name: 'United States', flag: '🇺🇸', defaultTimezone: 'America/New_York', currencyCode: 'USD' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', defaultTimezone: 'Europe/London', currencyCode: 'GBP' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', defaultTimezone: 'America/Toronto', currencyCode: 'CAD' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', defaultTimezone: 'Europe/Berlin', currencyCode: 'EUR' },
  { code: 'FR', name: 'France', flag: '🇫🇷', defaultTimezone: 'Europe/Paris', currencyCode: 'EUR' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', defaultTimezone: 'Europe/Amsterdam', currencyCode: 'EUR' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭', defaultTimezone: 'Europe/Zurich', currencyCode: 'CHF' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', defaultTimezone: 'Asia/Dubai', currencyCode: 'AED' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', defaultTimezone: 'Asia/Riyadh', currencyCode: 'SAR' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', defaultTimezone: 'America/Sao_Paulo', currencyCode: 'BRL' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽', defaultTimezone: 'America/Mexico_City', currencyCode: 'MXN' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦', defaultTimezone: 'Africa/Johannesburg', currencyCode: 'ZAR' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', defaultTimezone: 'Europe/Madrid', currencyCode: 'EUR' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', defaultTimezone: 'Europe/Rome', currencyCode: 'EUR' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪', defaultTimezone: 'Europe/Stockholm', currencyCode: 'SEK' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴', defaultTimezone: 'Europe/Oslo', currencyCode: 'NOK' },
  { code: 'IE', name: 'Ireland', flag: '🇮🇪', defaultTimezone: 'Europe/Dublin', currencyCode: 'EUR' },
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

export interface TimezoneOption {
  timezone: string;
  label: string;
  utcOffset: string;
  countryCode?: string;
  countryName?: string;
}

export const SUPPORTED_TIMEZONES: TimezoneOption[] = [
  { timezone: 'Asia/Singapore', label: 'Singapore, Malaysia (UTC+8)', utcOffset: 'UTC+8', countryCode: 'SG', countryName: 'Singapore' },
  { timezone: 'Asia/Kuala_Lumpur', label: 'Kuala Lumpur, Malaysia (UTC+8)', utcOffset: 'UTC+8', countryCode: 'MY', countryName: 'Malaysia' },
  { timezone: 'Asia/Bangkok', label: 'Bangkok, Thailand, Vietnam, Jakarta (UTC+7)', utcOffset: 'UTC+7', countryCode: 'TH', countryName: 'Thailand' },
  { timezone: 'Asia/Jakarta', label: 'Jakarta, Indonesia (UTC+7)', utcOffset: 'UTC+7', countryCode: 'ID', countryName: 'Indonesia' },
  { timezone: 'Asia/Manila', label: 'Manila, Philippines (UTC+8)', utcOffset: 'UTC+8', countryCode: 'PH', countryName: 'Philippines' },
  { timezone: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh City, Vietnam (UTC+7)', utcOffset: 'UTC+7', countryCode: 'VN', countryName: 'Vietnam' },
  { timezone: 'Asia/Tokyo', label: 'Tokyo, Japan (UTC+9)', utcOffset: 'UTC+9', countryCode: 'JP', countryName: 'Japan' },
  { timezone: 'Asia/Seoul', label: 'Seoul, South Korea (UTC+9)', utcOffset: 'UTC+9', countryCode: 'KR', countryName: 'South Korea' },
  { timezone: 'Asia/Hong_Kong', label: 'Hong Kong (UTC+8)', utcOffset: 'UTC+8', countryCode: 'HK', countryName: 'Hong Kong' },
  { timezone: 'Asia/Taipei', label: 'Taipei, Taiwan (UTC+8)', utcOffset: 'UTC+8', countryCode: 'TW', countryName: 'Taiwan' },
  { timezone: 'Australia/Sydney', label: 'Sydney, Melbourne, Australia (AEST/AEDT)', utcOffset: 'UTC+10/+11', countryCode: 'AU', countryName: 'Australia' },
  { timezone: 'Australia/Perth', label: 'Perth, Australia (UTC+8)', utcOffset: 'UTC+8', countryCode: 'AU', countryName: 'Australia' },
  { timezone: 'Pacific/Auckland', label: 'Auckland, New Zealand (NZST/NZDT)', utcOffset: 'UTC+12/+13', countryCode: 'NZ', countryName: 'New Zealand' },
  { timezone: 'Asia/Kolkata', label: 'India Standard Time (UTC+5:30)', utcOffset: 'UTC+5:30', countryCode: 'IN', countryName: 'India' },
  { timezone: 'Asia/Dubai', label: 'Dubai, UAE, Gulf (UTC+4)', utcOffset: 'UTC+4', countryCode: 'AE', countryName: 'United Arab Emirates' },
  { timezone: 'Asia/Riyadh', label: 'Riyadh, Saudi Arabia (UTC+3)', utcOffset: 'UTC+3', countryCode: 'SA', countryName: 'Saudi Arabia' },
  { timezone: 'Europe/London', label: 'London, United Kingdom (GMT/BST)', utcOffset: 'UTC+0/+1', countryCode: 'GB', countryName: 'United Kingdom' },
  { timezone: 'Europe/Paris', label: 'Paris, France, CET (UTC+1/+2)', utcOffset: 'UTC+1/+2', countryCode: 'FR', countryName: 'France' },
  { timezone: 'Europe/Berlin', label: 'Berlin, Germany, CET (UTC+1/+2)', utcOffset: 'UTC+1/+2', countryCode: 'DE', countryName: 'Germany' },
  { timezone: 'Europe/Amsterdam', label: 'Amsterdam, Netherlands (UTC+1/+2)', utcOffset: 'UTC+1/+2', countryCode: 'NL', countryName: 'Netherlands' },
  { timezone: 'Europe/Zurich', label: 'Zurich, Switzerland (UTC+1/+2)', utcOffset: 'UTC+1/+2', countryCode: 'CH', countryName: 'Switzerland' },
  { timezone: 'America/New_York', label: 'New York, US Eastern (EST/EDT)', utcOffset: 'UTC-5/-4', countryCode: 'US', countryName: 'United States' },
  { timezone: 'America/Chicago', label: 'Chicago, US Central (CST/CDT)', utcOffset: 'UTC-6/-5', countryCode: 'US', countryName: 'United States' },
  { timezone: 'America/Los_Angeles', label: 'Los Angeles, US Pacific (PST/PDT)', utcOffset: 'UTC-8/-7', countryCode: 'US', countryName: 'United States' },
  { timezone: 'America/Toronto', label: 'Toronto, Canada Eastern (UTC-5/-4)', utcOffset: 'UTC-5/-4', countryCode: 'CA', countryName: 'Canada' },
  { timezone: 'America/Sao_Paulo', label: 'Sao Paulo, Brazil (BRT UTC-3)', utcOffset: 'UTC-3', countryCode: 'BR', countryName: 'Brazil' },
  { timezone: 'Africa/Johannesburg', label: 'Johannesburg, South Africa (SAST UTC+2)', utcOffset: 'UTC+2', countryCode: 'ZA', countryName: 'South Africa' },
];

/**
 * Check if a timezone string is valid and recognized by Intl.
 */
export function isValidTimezone(tz: string | null | undefined): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get human-readable timezone label.
 */
export function getTimezoneDisplayName(tz: string | null | undefined): string {
  if (!tz) return 'Asia/Singapore (UTC+8)';
  const match = SUPPORTED_TIMEZONES.find((t) => t.timezone === tz);
  return match ? match.label : tz;
}

