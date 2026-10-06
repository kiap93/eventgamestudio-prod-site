/**
 * EventGameStudio Authoritative Time Architecture
 *
 * Core Principles:
 * 1. Absolute Instant:
 *    - Cloudflare Worker runtime UTC (new Date(), Date.now()) represents an absolute instant in time.
 *    - Cloudflare runtime timezone != business timezone.
 *
 * 2. Explicit Business Timezone:
 *    - Calendar dates, setup day, start day, end day, payment deadlines, and live access
 *      are evaluated in an explicit business timezone (default: 'Asia/Singapore').
 *
 * 3. Authoritative Clock:
 *    - /api/time is the sole authoritative application clock.
 *    - The frontend synchronizes its clock offset against /api/time.
 *    - In production, development/test reference dates are STRICTLY DISABLED.
 */

export const PLATFORM_BUSINESS_TIMEZONE = 'Asia/Singapore';
export const PLATFORM_BUSINESS_TIMEZONE_LABEL = 'Asia/Singapore / Malaysia (UTC+8)';

/**
 * Returns the current absolute UTC instant.
 */
export function getAuthoritativeNow(): Date {
  return new Date();
}

/**
 * Returns the current absolute epoch timestamp in milliseconds.
 */
export function getAuthoritativeNowMs(): number {
  return Date.now();
}

/**
 * Checks if the current environment is development or automated test.
 * Reference-date overrides are strictly prohibited in production.
 */
export function isDevelopmentOrTest(): boolean {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
      return true;
    }
  }
  return false;
}

/**
 * Gets the active business calendar date formatted as YYYY-MM-DD in the specified timezone.
 * Uses Intl.DateTimeFormat with explicit timeZone (en-CA locale yields ISO YYYY-MM-DD).
 */
export function getBusinessDate(
  date: Date = getAuthoritativeNow(),
  timeZone: string = PLATFORM_BUSINESS_TIMEZONE
): string {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date(date);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || PLATFORM_BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Returns structured business date and time in the specified timezone.
 */
export function getBusinessDateTime(
  date: Date = getAuthoritativeNow(),
  timeZone: string = PLATFORM_BUSINESS_TIMEZONE
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dateString: string;
  timeString: string;
  isoString: string;
} {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date(date);
  const tz = timeZone || PLATFORM_BUSINESS_TIMEZONE;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const p: Record<string, string> = {};
  for (const part of parts) {
    p[part.type] = part.value;
  }

  const year = parseInt(p.year, 10);
  const month = parseInt(p.month, 10);
  const day = parseInt(p.day, 10);
  const hour = p.hour === '24' ? 0 : parseInt(p.hour, 10);
  const minute = parseInt(p.minute, 10);
  const second = parseInt(p.second, 10);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const dateString = `${year}-${pad(month)}-${pad(day)}`;
  const timeString = `${pad(hour)}:${pad(minute)}:${pad(second)}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateString,
    timeString,
    isoString: `${dateString}T${timeString}`,
  };
}

/**
 * Calculates the exact UTC Date corresponding to 00:00:00.000 (Start Instant)
 * of a business calendar day in the specified timezone.
 */
export function getEventStartInstant(
  startDateStr: string,
  timeZone: string = PLATFORM_BUSINESS_TIMEZONE
): Date {
  return getInstantInTimezone(startDateStr, 0, 0, 0, 0, timeZone);
}

/**
 * Calculates the exact UTC Date corresponding to 23:59:59.999 (End Instant)
 * of a business calendar day in the specified timezone.
 * INCLUSIVE calendar-day boundary.
 */
export function getEventEndInstant(
  endDateStr: string,
  timeZone: string = PLATFORM_BUSINESS_TIMEZONE
): Date {
  return getInstantInTimezone(endDateStr, 23, 59, 59, 999, timeZone);
}

/**
 * Calculates the exact UTC Date corresponding to 00:00:00.000 of Setup Day
 * (1 calendar day before startDate) in the specified timezone.
 */
export function getEventSetupDayInstant(
  startDateStr: string,
  timeZone: string = PLATFORM_BUSINESS_TIMEZONE
): Date {
  const [y, m, d] = startDateStr.split('-').map(Number);
  const prevDate = new Date(Date.UTC(y, m - 1, d - 1));
  const pad = (n: number) => n.toString().padStart(2, '0');
  const setupDayStr = `${prevDate.getUTCFullYear()}-${pad(prevDate.getUTCMonth() + 1)}-${pad(prevDate.getUTCDate())}`;
  return getInstantInTimezone(setupDayStr, 0, 0, 0, 0, timeZone);
}

/**
 * Helper to compute an exact UTC instant from a calendar date and time in target timezone.
 * Avoids any manual "+8 hour" hack; uses timezone-aware offset resolution.
 */
export function getInstantInTimezone(
  calendarDateStr: string,
  hour: number,
  min: number,
  sec: number,
  ms: number,
  timeZone: string = PLATFORM_BUSINESS_TIMEZONE
): Date {
  const [y, m, d] = calendarDateStr.split('-').map(Number);
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hour, min, sec, ms));
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || PLATFORM_BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Refine guess by calculating the actual timezone offset at that instant
  let offsetMs = 0;
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(utcGuess.getTime() - offsetMs));
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    const formattedInTz = new Date(
      Date.UTC(
        Number(p.year),
        Number(p.month) - 1,
        Number(p.day),
        Number(p.hour) === 24 ? 0 : Number(p.hour),
        Number(p.minute),
        Number(p.second),
        ms
      )
    );
    const diff = formattedInTz.getTime() - utcGuess.getTime();
    offsetMs += diff;
    if (diff === 0) break;
  }

  return new Date(utcGuess.getTime() - offsetMs);
}

// =========================================================================
// Client Authoritative Clock Synchronization
// =========================================================================

let clientOffsetMs: number = 0;
let isClockSynced: boolean = false;
let lastSyncTimestampMs: number = 0;

/**
 * Synchronizes the client clock against the authoritative server timestamp from /api/time.
 */
export function syncAuthoritativeClock(serverTimestamp: number): void {
  if (typeof serverTimestamp === 'number' && !isNaN(serverTimestamp)) {
    clientOffsetMs = serverTimestamp - Date.now();
    isClockSynced = true;
    lastSyncTimestampMs = Date.now();
  }
}

/**
 * Returns the client-side current Date adjusted by the authoritative server offset.
 * Used for UI rendering without calling raw machine new Date().
 */
export function getAuthoritativeClientNow(): Date {
  return new Date(Date.now() + clientOffsetMs);
}

/**
 * Returns the client-side current timestamp adjusted by the authoritative server offset.
 */
export function getAuthoritativeClientNowMs(): number {
  return Date.now() + clientOffsetMs;
}

/**
 * Resets the clock synchronization state (primarily for automated tests).
 */
export function resetAuthoritativeClock(): void {
  clientOffsetMs = 0;
  isClockSynced = false;
  lastSyncTimestampMs = 0;
}
