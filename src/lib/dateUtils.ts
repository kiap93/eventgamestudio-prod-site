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
 * Checks whether an event is explicitly cancelled by user or administrator action.
 *
 * AUTHORITATIVE BUSINESS RULE:
 * Payment status and event status are separate.
 * Payment statuses: PENDING, PAID, EXPIRED, REFUNDED.
 *
 * Event status must NOT automatically become CANCELLED because:
 * - payment is unpaid
 * - payment becomes EXPIRED
 * - event end date has passed
 * - Live Game access is closed
 *
 * CANCELLED must only represent an actual cancelled event.
 *
 * Therefore:
 * - An event is ONLY explicitly cancelled if it has an explicit cancellation reason
 *   (e.g., USER_CANCELLED or ADMIN_CANCELLED, or explicit non-timeout reason).
 * - Automated payment timeouts (PAYMENT_TIMEOUT) are NEVER cancellations.
 * - Payment being unpaid or expired is NEVER a cancellation.
 * - End date passing is NEVER a cancellation.
 */
export function isEventExplicitlyCancelled(
  event: {
    status?: string | null;
    event_status?: string | null;
    cancel_reason?: string | null;
    payment_status?: string | null;
    [key: string]: any;
  } | null | undefined
): boolean {
  if (!event) return false;

  const cancelReason = event.cancel_reason || null;

  // Automated payment timeouts are NEVER treated as explicit cancellations
  if (cancelReason === 'PAYMENT_TIMEOUT') {
    return false;
  }

  // Explicit user or admin cancellation reasons
  if (cancelReason === 'USER_CANCELLED' || cancelReason === 'ADMIN_CANCELLED') {
    return true;
  }

  // Any custom explicit cancellation reason (other than PAYMENT_TIMEOUT)
  if (cancelReason && cancelReason !== 'PAYMENT_TIMEOUT') {
    return true;
  }

  // Under the Authoritative Business Rule, CANCELLED must ONLY represent an actual cancelled event.
  // Unpaid events, expired events, or legacy status === 'cancelled' without an explicit cancellation reason
  // must NOT automatically be treated as CANCELLED.
  return false;
}

export type ClientLiveGameBlockReason =
  | 'PAYMENT_REQUIRED'
  | 'EVENT_NOT_OPEN'
  | 'EVENT_EXPIRED'
  | 'EVENT_CANCELLED';

export interface ClientLiveGameAccessResult {
  canAccess: boolean;
  code?: ClientLiveGameBlockReason;
  reason?: string;
  error?: string;
  is_pending_payment?: boolean;
  is_scheduled?: boolean;
  is_expired?: boolean;
  is_cancelled?: boolean;
  start_date?: string;
  end_date?: string;
  live_open_date?: string;
}

/**
 * Centralized helper: canAccessClientLiveGame(event, currentDate)
 *
 * Client/Public Live Game requires:
 * 1. payment_status === 'PAID'
 * 2. currentDate >= event_start_date - 1 day
 * 3. currentDate <= event_end_date
 * 4. event is not cancelled
 *
 * If canAccessClientLiveGame is false, determines exact reason:
 * - PAYMENT_REQUIRED (payment_status !== 'PAID')
 * - EVENT_NOT_OPEN (currentDate < start_date - 1 day)
 * - EVENT_EXPIRED / EVENT_ENDED (currentDate > end_date)
 * - EVENT_CANCELLED (explicit cancellation only)
 *
 * Examples (Event: 2-Sep to 3-Sep):
 * 1-Sep + unpaid -> Live Game BLOCKED (PAYMENT_REQUIRED)
 * 1-Sep + paid   -> Live Game AVAILABLE
 * 2-Sep + unpaid -> Live Game BLOCKED (PAYMENT_REQUIRED)
 * 2-Sep + paid   -> Live Game AVAILABLE
 * 3-Sep + unpaid -> Live Game BLOCKED (PAYMENT_REQUIRED)
 * 3-Sep + paid   -> Live Game AVAILABLE
 * After 3-Sep    -> Live Game CLOSED regardless of payment (EVENT_EXPIRED)
 */
export function canAccessClientLiveGame(
  event: any,
  currentDate?: string | Date
): boolean {
  return getClientLiveGameAccessDetails(event, currentDate).canAccess;
}

export function getClientLiveGameAccessDetails(
  event: any,
  currentDate?: string | Date
): ClientLiveGameAccessResult {
  if (!event) {
    return {
      canAccess: false,
      code: 'EVENT_EXPIRED',
      reason: 'Event not found or link has expired.',
      error: 'Event not found or link has expired.',
      is_expired: true,
    };
  }

  // 1. Explicit cancellation check (only genuine user/admin cancellations)
  if (isEventExplicitlyCancelled(event)) {
    return {
      canAccess: false,
      code: 'EVENT_CANCELLED',
      reason: 'This event has been cancelled by the organizer.',
      error: 'This event has been cancelled by the organizer.',
      is_cancelled: true,
    };
  }

  const { startDate, endDate, liveOpenDate } = getNormalizedEventDates(event);
  const curDate = getNormalizedCurrentDate(currentDate);

  // 2. Date window check: Event has ended (concluded)
  // Authoritative Rule: "After 3-Sep: => Live Game CLOSED regardless of payment."
  if (endDate && curDate > endDate) {
    return {
      canAccess: false,
      code: 'EVENT_EXPIRED',
      reason: `This event concluded on ${formatDateOnly(endDate)}.`,
      error: `This event concluded on ${formatDateOnly(endDate)}.`,
      is_expired: true,
      start_date: startDate,
      end_date: endDate,
      live_open_date: liveOpenDate,
    };
  }

  // 3. Payment status check (checked independently)
  // Unpaid events during setup or live window are blocked awaiting payment, NOT cancelled
  const payStatus = (event.payment_status || '').toUpperCase();
  const isPaid = payStatus === 'PAID';
  const rawStatus = (event.status || '').toLowerCase();

  if (!isPaid || rawStatus === 'pending_payment') {
    return {
      canAccess: false,
      code: 'PAYMENT_REQUIRED',
      reason: 'This event is currently awaiting payment and activation. Public game access is disabled until paid.',
      error: 'This event is currently awaiting payment and activation. Public game access is disabled until paid.',
      is_pending_payment: true,
      start_date: startDate,
      end_date: endDate,
      live_open_date: liveOpenDate,
    };
  }

  // 4. Date window check: Before setup day (currentDate < start_date - 1 day)
  if (liveOpenDate && curDate < liveOpenDate) {
    return {
      canAccess: false,
      code: 'EVENT_NOT_OPEN',
      reason: `This event is scheduled to open on ${formatDateOnly(liveOpenDate)}. Live URL will become active on ${formatDateOnly(liveOpenDate)}.`,
      error: `This event is scheduled to open on ${formatDateOnly(liveOpenDate)}. Live URL will become active on ${formatDateOnly(liveOpenDate)}.`,
      is_scheduled: true,
      start_date: startDate,
      end_date: endDate,
      live_open_date: liveOpenDate,
    };
  }

  // 5. All conditions met:
  // payment_status === 'PAID'
  // AND currentDate >= event_start_date - 1 day
  // AND currentDate <= event_end_date
  // AND event is not cancelled
  return {
    canAccess: true,
    start_date: startDate,
    end_date: endDate,
    live_open_date: liveOpenDate,
  };
}

/**
 * Checks whether an event's Live URL is currently accessible.
 *
 * Canonical Rule:
 * LIVE URL AVAILABLE =
 *   payment_status === "PAID"
 *   AND current_date >= event_start_date - 1 calendar day (liveOpenDate, Setup Day)
 *   AND current_date <= event_end_date (inclusive calendar day)
 *   AND event is not explicitly cancelled
 *
 * Events are DATE-ONLY, not datetime-based.
 * On event date (e.g. 07 Sep 2026 -> 07 Sep 2026), it is LIVE for the entire calendar day.
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
  return canAccessClientLiveGame(event, currentDate);
}

/**
 * Checks whether an event's Preview URL is currently accessible.
 *
 * Canonical Rule:
 * Preview / Test is an authenticated capability for organization members, theme designers,
 * and developers to test game mechanics, inspect themes, and playtest without submitting to
 * official live high scores.
 *
 * Rules:
 * - Available for events that are: Scheduled, Pending Payment, Live, and Concluded.
 * - Does NOT depend on the event being currently LIVE.
 * - Does NOT depend on payment status (unpaid/pending payment events can be previewed/tested).
 * - NOT available for explicitly cancelled events.
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

  if (isEventExplicitlyCancelled(event)) {
    return false;
  }

  return true;
}

/**
 * Checks whether the Preview Header toolbar should be visible.
 * Rule: Visible when Preview URL is available (non-cancelled event in authenticated preview).
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
  if (isEventExplicitlyCancelled(event)) {
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
  const isCancelled = isEventExplicitlyCancelled(event);
  const payStatus = (event?.payment_status || '').toUpperCase();
  const isPaid = payStatus === 'PAID';

  const { startDate, endDate, liveOpenDate } = getNormalizedEventDates(event || {});
  const curDate = getNormalizedCurrentDate(currentDate);

  const isBeforeStartDate = Boolean(startDate && curDate < startDate);
  const isBeforeLiveWindow = Boolean(liveOpenDate && curDate < liveOpenDate);
  const isInsideLiveWindow = Boolean(
    liveOpenDate && endDate && curDate >= liveOpenDate && curDate <= endDate
  );
  const isAfterLiveWindow = Boolean(endDate && curDate > endDate);

  const previewUrlAvailable = !isCancelled;
  const previewHeaderVisible = previewUrlAvailable;
  const liveUrlAvailable = !isCancelled && isPaid && isInsideLiveWindow;

  let statusLabel = 'Scheduled';
  let statusExplanation = '';

  if (isCancelled) {
    statusLabel = 'Cancelled';
    statusExplanation = 'This event deployment has been cancelled.';
  } else if (isAfterLiveWindow) {
    statusLabel = 'Concluded';
    statusExplanation = `This event concluded on ${formatDateOnly(endDate)}.`;
  } else if (isInsideLiveWindow) {
    if (isPaid) {
      statusLabel = 'Live Now';
      statusExplanation = `Live URL is active through ${formatDateOnly(endDate)}.`;
    } else {
      statusLabel = 'Pending Payment';
      statusExplanation = `Live window is open, but payment is required. Live URL will activate immediately upon payment.`;
    }
  } else {
    // Before live window (curDate < liveOpenDate)
    if (isPaid) {
      statusLabel = 'Scheduled';
      statusExplanation = `Live URL opens on ${formatDateOnly(liveOpenDate)} (1 day before start date ${formatDateOnly(startDate)}). Preview test mode is active.`;
    } else {
      statusLabel = 'Pending Payment';
      statusExplanation = `Event is scheduled for ${formatDateOnly(startDate)}. Pay and activate to enable the Live URL on ${formatDateOnly(liveOpenDate)}.`;
    }
  }

  return {
    isPaid,
    isCancelled,
    startDate,
    endDate,
    liveOpenDate,
    currentDate: curDate,
    isBeforeStartDate,
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
 * Calculates current dynamic event status for standard lifecycle management.
 * Date-only evaluation:
 * - Explicit cancellation -> 'cancelled'
 * - Current date > end_date -> 'expired'
 * - Current date < start_date:
 *     paid -> 'scheduled'
 *     unpaid -> 'pending_payment'
 * - On event date range (start_date <= current_date <= end_date):
 *     paid -> 'live'
 *     unpaid -> 'pending_payment'
 */
export function calculateEventStatus(
  event: {
    status?: string | null;
    event_status?: string | null;
    starts_at?: string | null;
    expires_at?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    payment_status?: string | null;
    cancel_reason?: string | null;
    [key: string]: any;
  },
  now?: Date | string
): string {
  if (isEventExplicitlyCancelled(event)) {
    return 'cancelled';
  }

  const { startDate, endDate } = getNormalizedEventDates(event);
  const curDate = getNormalizedCurrentDate(now);
  const isPaid = (event.payment_status || '').toUpperCase() === 'PAID';

  if (endDate && curDate > endDate) {
    return 'expired';
  }

  if (startDate && curDate < startDate) {
    return isPaid ? 'scheduled' : 'pending_payment';
  }

  // On event date range
  return isPaid ? 'live' : 'pending_payment';
}

/**
 * Derives canonical EventLifecycleStatus enum:
 *
 * EXPECTED LIFECYCLE RULES:
 * 1. Only explicit cancellation: CANCELLED
 * 2. After event date has ended: COMPLETED (Concluded)
 * 3. Before event date: SCHEDULED
 * 4. On event date: LIVE
 *
 * Events are DATE-ONLY, not datetime-based.
 * Payment status does NOT automatically set event status to CANCELLED.
 */
export function deriveEventLifecycleStatus(
  event: {
    status?: string | null;
    event_status?: string | null;
    starts_at?: string | null;
    expires_at?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    payment_status?: string | null;
    cancel_reason?: string | null;
    [key: string]: any;
  },
  now?: Date | string
): 'DRAFT' | 'PAYMENT_PENDING' | 'PENDING_PAYMENT' | 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED' {
  if (isEventExplicitlyCancelled(event)) {
    return 'CANCELLED';
  }

  const { startDate, endDate } = getNormalizedEventDates(event);
  const curDate = getNormalizedCurrentDate(now);

  // After event date has ended -> COMPLETED (Concluded)
  if (endDate && curDate > endDate) {
    return 'COMPLETED';
  }

  // Before event date -> SCHEDULED
  if (startDate && curDate < startDate) {
    return 'SCHEDULED';
  }

  // On event date -> LIVE
  return 'LIVE';
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
