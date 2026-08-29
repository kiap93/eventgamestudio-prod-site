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
