/**
 * Shared Date Utilities for Date-Only Event Scheduling
 *
 * Events are scheduled by DATE ONLY (Start Date and End Date).
 * Formats dates consistently across all browsers without timezone shifting artifacts.
 */

const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTH_NAMES_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Extracts YYYY-MM-DD from any date string or Date object.
 */
export function extractDateString(dateVal: string | Date | null | undefined): string {
  if (!dateVal) return '';
  if (typeof dateVal === 'string') {
    const match = dateVal.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
    const dt = new Date(dateVal);
    if (isNaN(dt.getTime())) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${dateVal.getUTCFullYear()}-${pad(dateVal.getUTCMonth() + 1)}-${pad(dateVal.getUTCDate())}`;
}

/**
 * Formats a date into a clean display format: "02 Sep 2026"
 * Ensures NO browser timezone conversion shifts the date.
 */
export function formatDateOnly(
  dateVal: string | Date | null | undefined,
  options?: { fullMonth?: boolean }
): string {
  if (!dateVal) return '';
  const dateStr = extractDateString(dateVal);
  if (!dateStr) return '';

  const parts = dateStr.split('-');
  if (parts.length !== 3) return '';

  const year = parseInt(parts[0], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const dayStr = day.toString().padStart(2, '0');
  const monthList = options?.fullMonth ? MONTH_NAMES_FULL : MONTH_NAMES_SHORT;
  const monthStr = monthList[monthIdx] || 'Sep';

  return `${dayStr} ${monthStr} ${year}`;
}

/**
 * Formats an event date range cleanly:
 * - Single Day: "02 Sep 2026"
 * - Same Month/Year: "02 Sep 2026 – 03 Sep 2026"
 * - Multi-Day: "02 Sep 2026 – 03 Sep 2026"
 */
export function formatEventDateRange(
  startsAt: string | Date | null | undefined,
  expiresAt: string | Date | null | undefined,
  eventDate?: string | null
): string {
  const startDateStr = extractDateString(eventDate || startsAt);
  const endDateStr = extractDateString(expiresAt || eventDate || startsAt);

  if (!startDateStr && !endDateStr) return '';
  if (!endDateStr || startDateStr === endDateStr) {
    return formatDateOnly(startDateStr);
  }

  const formattedStart = formatDateOnly(startDateStr);
  const formattedEnd = formatDateOnly(endDateStr);

  return `${formattedStart} – ${formattedEnd}`;
}

/**
 * Formats date for <input type="date" /> (YYYY-MM-DD)
 */
export function formatForDateInput(dateVal: string | Date | null | undefined): string {
  return extractDateString(dateVal);
}

/**
 * Gets today's calendar date as YYYY-MM-DD in local/server time.
 */
export function getTodayDateString(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Adds N calendar days to a YYYY-MM-DD date string.
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const clean = extractDateString(dateStr);
  if (!clean) return '';
  const [y, m, d] = clean.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 0, 0, 0, 0));
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * Calculates Setup Day (Start Date minus 1 calendar day)
 */
export function calculateSetupDayString(startDateStr: string): string {
  return addDaysToDateString(startDateStr, -1);
}

/**
 * Returns the current date formatted as 'YYYY-MM-DD' in Asia/Singapore timezone (UTC+8).
 * Ensures exact Singapore calendar date without client browser timezone skew.
 */
export function getSingaporeCalendarDate(date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Singapore',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch (e) {
    const utcTime = date.getTime();
    const sgTime = new Date(utcTime + 8 * 60 * 60 * 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${sgTime.getUTCFullYear()}-${pad(sgTime.getUTCMonth() + 1)}-${pad(sgTime.getUTCDate())}`;
  }
}

/**
 * Returns formatted string of current date & time in Asia/Singapore timezone (UTC+8).
 * Format: DD/MM/YYYY, HH:mm:ss
 */
export function getSingaporeDateTime(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Singapore',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch (e) {
    const utcTime = date.getTime();
    const sgTime = new Date(utcTime + 8 * 60 * 60 * 1000);
    return sgTime.toISOString().replace('T', ' ').slice(0, 19);
  }
}

/**
 * Checks whether the current date/time (in Asia/Singapore timezone UTC+8) falls within
 * the event date range (from Start Date to End Date, inclusive).
 *
 * Example:
 * If startDate is '2026-08-29' and endDate is '2026-09-07',
 * returns true for Singapore calendar dates from '2026-08-29' through '2026-09-07' inclusive.
 */
export function isCurrentSingaporeDateWithinEventRange(
  startDateVal: string | Date | null | undefined,
  endDateVal: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  const startStr = extractDateString(startDateVal);
  const endStr = extractDateString(endDateVal) || startStr;

  if (!startStr) return false;
  const currentSingaporeDate = getSingaporeCalendarDate(now);

  const effectiveEndStr = endStr >= startStr ? endStr : startStr;
  return currentSingaporeDate >= startStr && currentSingaporeDate <= effectiveEndStr;
}

/**
 * Checks whether the current date/time (in Asia/Singapore timezone) falls within
 * the immersive fullscreen window for the given event date.
 *
 * Rule: ONE DAY BEFORE THE EVENT DATE through THE ENTIRE EVENT DATE (Singapore calendar days).
 * Example:
 * If eventDate is '2026-08-30',
 * window is Singapore calendar dates '2026-08-29' and '2026-08-30'.
 */
export function isWithinImmersiveFullscreenWindow(
  eventDate: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!eventDate) return false;
  const eventDateStr = extractDateString(eventDate);
  if (!eventDateStr) return false;

  const currentSingaporeDate = getSingaporeCalendarDate(now);
  const oneDayBefore = addDaysToDateString(eventDateStr, -1);

  return currentSingaporeDate >= oneDayBefore && currentSingaporeDate <= eventDateStr;
}
