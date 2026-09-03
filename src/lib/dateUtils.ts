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
 * Normalizes input date representation to YYYY-MM-DD string.
 */
export function getNormalizedCurrentDate(currentDate?: string | Date | null): string {
  if (typeof currentDate === 'string') {
    const match = currentDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const dt = currentDate instanceof Date ? currentDate : new Date();
  return getSingaporeCalendarDate(dt);
}

/**
 * Extracts and normalizes the authoritative event date boundaries.
 * 
 * Rules:
 * - startDate: 'YYYY-MM-DD'
 * - endDate: 'YYYY-MM-DD'
 * - liveOpenDate: startDate minus 1 calendar day ('YYYY-MM-DD')
 */
export function getNormalizedEventDates(event: {
  start_date?: string | null;
  end_date?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  event_date?: string | null;
  starts_at?: string | null;
  expires_at?: string | null;
  setup_starts_at?: string | null;
  [key: string]: any;
}): {
  startDate: string;
  endDate: string;
  liveOpenDate: string;
} {
  const rawStart =
    event.start_date ||
    event.startDate ||
    event.event_date ||
    (event.starts_at ? extractDateString(event.starts_at) : '');

  const rawEnd =
    event.end_date ||
    event.endDate ||
    (event.expires_at ? extractDateString(event.expires_at) : '') ||
    rawStart;

  const startDate = extractDateString(rawStart) || '';
  const endDate = extractDateString(rawEnd) || startDate;
  const liveOpenDate = startDate ? addDaysToDateString(startDate, -1) : '';

  return {
    startDate,
    endDate,
    liveOpenDate,
  };
}

/**
 * Checks whether an event's Live URL is currently accessible.
 *
 * Canonical Rule:
 * LIVE URL AVAILABLE =
 *   payment_status === "PAID"
 *   AND current_date >= event_start_date - 1 calendar day (liveOpenDate)
 *   AND current_date <= event_end_date
 *   AND event is not cancelled
 */
export function canAccessLiveEvent(
  event: {
    status?: string | null;
    event_status?: string | null;
    payment_status?: string | null;
    cancel_reason?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    event_date?: string | null;
    starts_at?: string | null;
    expires_at?: string | null;
    [key: string]: any;
  } | null | undefined,
  currentDate?: string | Date
): boolean {
  if (!event) return false;

  const rawStatus = (event.status || '').toLowerCase();
  const eventStatus = (event.event_status || '').toUpperCase();
  const payStatus = (event.payment_status || '').toUpperCase();
  const cancelReason = event.cancel_reason || null;

  // 1. Cancelled events are never accessible
  if (rawStatus === 'cancelled' || eventStatus === 'CANCELLED' || cancelReason) {
    return false;
  }

  // 2. Payment MUST be fully PAID
  if (payStatus !== 'PAID') {
    return false;
  }

  const { startDate, endDate, liveOpenDate } = getNormalizedEventDates(event);
  if (!startDate || !endDate || !liveOpenDate) return false;

  const curDate = getNormalizedCurrentDate(currentDate);

  // 3. Current calendar date >= liveOpenDate (start_date - 1 day) AND current_date <= end_date
  return curDate >= liveOpenDate && curDate <= endDate;
}

/**
 * Checks whether an event's Preview URL is currently accessible.
 *
 * Canonical Rule:
 * Before the Live URL window starts (current_date < event_start_date - 1 calendar day):
 *   Preview URL = available (for both paid and unpaid events)
 *
 * Once the Live URL window starts or after event ends:
 *   Preview URL = unavailable
 */
export function canAccessPreviewEvent(
  event: {
    status?: string | null;
    event_status?: string | null;
    cancel_reason?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    event_date?: string | null;
    starts_at?: string | null;
    expires_at?: string | null;
    [key: string]: any;
  } | null | undefined,
  currentDate?: string | Date
): boolean {
  if (!event) return false;

  const rawStatus = (event.status || '').toLowerCase();
  const eventStatus = (event.event_status || '').toUpperCase();
  const cancelReason = event.cancel_reason || null;

  if (rawStatus === 'cancelled' || eventStatus === 'CANCELLED' || cancelReason) {
    return false;
  }

  const { startDate, liveOpenDate } = getNormalizedEventDates(event);
  if (!startDate || !liveOpenDate) return false;

  const curDate = getNormalizedCurrentDate(currentDate);

  // Preview URL is ONLY available BEFORE the Live URL window starts
  return curDate < liveOpenDate;
}

/**
 * Checks whether the Preview Header toolbar should be visible.
 * Rule: Visible when Preview URL is available (before live window starts).
 */
export function shouldShowPreviewHeader(
  event: any,
  currentDate?: string | Date
): boolean {
  return canAccessPreviewEvent(event, currentDate);
}

/**
 * Checks whether an event is strictly before its configured start date (Asia/Singapore calendar date).
 * During this pre-event window (including Setup Day), the event is in TEST mode and TEST scores can be manually cleared.
 */
export function isEventBeforeStartDate(
  event: any,
  currentDate?: string | Date | null
): boolean {
  if (!event) return false;
  const rawStatus = (event.status || '').toLowerCase();
  const eventStatus = (event.event_status || '').toUpperCase();
  if (
    rawStatus === 'cancelled' ||
    eventStatus === 'CANCELLED' ||
    event.cancel_reason
  ) {
    return false;
  }
  const { startDate } = getNormalizedEventDates(event);
  if (!startDate) return false;
  const curDate = getNormalizedCurrentDate(currentDate);
  return curDate < startDate;
}

/**
 * Returns comprehensive availability state breakdown for an event.
 */
export function getEventAvailabilityState(
  event: any,
  currentDate?: string | Date
): {
  isPaid: boolean;
  isCancelled: boolean;
  startDate: string;
  endDate: string;
  liveOpenDate: string;
  currentDate: string;
  isBeforeStartDate: boolean;
  isBeforeLiveWindow: boolean;
  isInsideLiveWindow: boolean;
  isAfterLiveWindow: boolean;
  previewUrlAvailable: boolean;
  previewHeaderVisible: boolean;
  liveUrlAvailable: boolean;
  statusLabel: string;
  statusExplanation: string;
} {
  const rawStatus = (event?.status || '').toLowerCase();
  const eventStatus = (event?.event_status || '').toUpperCase();
  const payStatus = (event?.payment_status || '').toUpperCase();
  const isCancelled =
    rawStatus === 'cancelled' || eventStatus === 'CANCELLED' || Boolean(event?.cancel_reason);
  const isPaid = payStatus === 'PAID';

  const { startDate, endDate, liveOpenDate } = getNormalizedEventDates(event || {});
  const curDate = getNormalizedCurrentDate(currentDate);

  const isBeforeStartDate = Boolean(startDate && curDate < startDate);
  const isBeforeLiveWindow = Boolean(liveOpenDate && curDate < liveOpenDate);
  const isInsideLiveWindow = Boolean(
    liveOpenDate && endDate && curDate >= liveOpenDate && curDate <= endDate
  );
  const isAfterLiveWindow = Boolean(endDate && curDate > endDate);

  const previewUrlAvailable = !isCancelled && isBeforeLiveWindow;
  const previewHeaderVisible = previewUrlAvailable;
  const liveUrlAvailable = !isCancelled && isPaid && isInsideLiveWindow;

  let statusLabel = 'Draft';
  let statusExplanation = '';

  if (isCancelled) {
    statusLabel = 'Cancelled';
    statusExplanation = 'This event deployment has been cancelled.';
  } else if (isAfterLiveWindow) {
    statusLabel = 'Expired';
    statusExplanation = `This event concluded on ${formatDateOnly(endDate)}.`;
  } else if (isBeforeLiveWindow) {
    statusLabel = isPaid ? 'Scheduled' : 'Draft';
    statusExplanation = isPaid
      ? `Live URL opens on ${formatDateOnly(liveOpenDate)} (1 day before start date ${formatDateOnly(startDate)}). Preview test mode is active.`
      : `Event is scheduled for ${formatDateOnly(startDate)}. Pay and activate to enable the Live URL on ${formatDateOnly(liveOpenDate)}.`;
  } else if (isInsideLiveWindow) {
    if (isPaid) {
      statusLabel = 'Live Now';
      statusExplanation = `Live URL is active through ${formatDateOnly(endDate)}.`;
    } else {
      statusLabel = 'Pending Payment';
      statusExplanation = `Live window is open, but payment is required. Live URL will activate immediately upon payment.`;
    }
  }

  return {
    isPaid,
    isCancelled,
    startDate,
    endDate,
    liveOpenDate,
    currentDate: curDate,
    isBeforeStartDate: curDate < startDate,
    isBeforeLiveWindow,
    isInsideLiveWindow,
    isAfterLiveWindow,
    previewUrlAvailable,
    previewHeaderVisible,
    liveUrlAvailable,
    statusLabel,
    statusExplanation,
  };
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
 * Calculates the duration in whole calendar days between two dates.
 *
 * Rules:
 * - Same day (01/09/2026 to 01/09/2026) = 1 day
 * - Consecutive days (01/09/2026 to 02/09/2026) = 2 days
 * - 14-day range (01/09/2026 to 14/09/2026) = 14 days
 * - Month boundary (31/08/2026 to 01/09/2026) = 2 days
 * - Leap year aware (28/02/2024 to 01/03/2024 = 3 days; 28/02/2025 to 01/03/2025 = 2 days)
 * - Safe from timezone shifting: operates strictly on UTC calendar date components.
 */
export function calculateEventCalendarDays(
  startDateVal: string | Date | null | undefined,
  endDateVal: string | Date | null | undefined
): number {
  const startStr = extractDateString(startDateVal);
  const endStr = extractDateString(endDateVal) || startStr;

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
