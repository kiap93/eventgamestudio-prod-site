/**
 * Shared Date Utilities for Date-Only Event Scheduling
 *
 * Events are scheduled by DATE ONLY (Start Date and End Date).
 * Formats dates consistently across all browsers without timezone shifting artifacts.
 */

import {
  resolveEventTimezone,
  isValidTimezone,
  getDefaultTimezoneForCountry,
  getTimezoneDisplayName,
  SUPPORTED_TIMEZONES,
} from './countryUtils.js';
import {
  EventDeletionEligibility,
  EventCancellationEligibility,
  EventRefundDetermination,
  DeletionErrorCode,
  CancellationErrorCode,
} from '../types.js';

export {
  resolveEventTimezone,
  isValidTimezone,
  getDefaultTimezoneForCountry,
  getTimezoneDisplayName,
  SUPPORTED_TIMEZONES,
};
export type {
  EventDeletionEligibility,
  EventCancellationEligibility,
  EventRefundDetermination,
  DeletionErrorCode,
  CancellationErrorCode,
};

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
 * Gets today's calendar date as YYYY-MM-DD in the specified timezone (or local time if omitted).
 */
export function getTodayDateString(timeZone?: string): string {
  if (timeZone) {
    return getCalendarDateInTimezone(new Date(), timeZone);
  }
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
 * Canonical platform business timezone declaration.
 * All events currently operate on Asia/Singapore & Malaysia (UTC+8) business timezone.
 */
export const PLATFORM_BUSINESS_TIMEZONE = 'Asia/Singapore';
export const PLATFORM_BUSINESS_TIMEZONE_LABEL = 'Asia/Singapore / Malaysia (UTC+8)';

/**
 * Returns the calendar date formatted as 'YYYY-MM-DD' in the specified timezone.
 * Defaults to Asia/Singapore (UTC+8).
 * Ensures exact calendar date calculation without client browser timezone skew.
 */
export function getCalendarDateInTimezone(date: Date = new Date(), timeZone: string = PLATFORM_BUSINESS_TIMEZONE): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || PLATFORM_BUSINESS_TIMEZONE,
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
 * Returns the current date formatted as 'YYYY-MM-DD' in Asia/Singapore timezone (UTC+8).
 * Ensures exact Singapore calendar date without client browser timezone skew.
 * Accepts optional timeZone parameter for future multi-timezone support.
 */
export function getSingaporeCalendarDate(date: Date = new Date(), timeZone: string = PLATFORM_BUSINESS_TIMEZONE): string {
  return getCalendarDateInTimezone(date, timeZone);
}

/**
 * Calculates the UTC offset in milliseconds for a specific date in a given timezone.
 * Uses standard Intl.DateTimeFormat to ensure accurate offsets across timezones and DST shifts.
 */
export function getTimezoneOffsetMs(date: Date, timeZone: string = PLATFORM_BUSINESS_TIMEZONE): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || PLATFORM_BUSINESS_TIMEZONE,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    let hour = getPart('hour');
    if (hour === 24) hour = 0;
    const minute = getPart('minute');
    const second = getPart('second');
    const asUtc = Date.UTC(year, month - 1, day, hour, minute, second, date.getUTCMilliseconds());
    return asUtc - date.getTime();
  } catch {
    return 8 * 60 * 60 * 1000;
  }
}

/**
 * Returns the exact UTC Date object representing a specific calendar date and time in a given timezone.
 */
export function getUtcBoundaryInTimezone(
  dateStr: string,
  timeStr: string,
  timeZone: string = PLATFORM_BUSINESS_TIMEZONE
): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm, ss] = timeStr.split(':').map(Number);
  const ms = timeStr.includes('.') ? parseInt(timeStr.split('.')[1], 10) : 0;
  const tentative = new Date(Date.UTC(y, m - 1, d, hh, mm, ss, ms));
  const offset = getTimezoneOffsetMs(tentative, timeZone);
  return new Date(tentative.getTime() - offset);
}

/**
 * Normalizes input date representation to YYYY-MM-DD string in the target timezone (defaults to Asia/Singapore UTC+8).
 */
export function getNormalizedCurrentDate(currentDate?: string | Date | null, timeZone: string = PLATFORM_BUSINESS_TIMEZONE): string {
  if (typeof currentDate === 'string') {
    const match = currentDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const dt = currentDate instanceof Date ? currentDate : new Date();
  return getCalendarDateInTimezone(dt, timeZone);
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
  | 'EVENT_COMPLETED'
  | 'EVENT_CANCELLED';

export interface ClientLiveGameAccessResult {
  canAccess: boolean;
  code?: ClientLiveGameBlockReason;
  reason?: string;
  error?: string;
  is_pending_payment?: boolean;
  is_scheduled?: boolean;
  is_expired?: boolean;
  is_completed?: boolean;
  is_cancelled?: boolean;
  start_date?: string;
  end_date?: string;
  live_open_date?: string;
  event_timezone?: string;
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
  const eventTimezone = resolveEventTimezone(event);
  const curDate = getNormalizedCurrentDate(currentDate, eventTimezone);

  // 2. Date window check: Event has ended
  // Authoritative Rule: "After event end date => Live Game CLOSED regardless of payment."
  const payStatus = (event.payment_status || '').toUpperCase();
  const isPaid = payStatus === 'PAID';

  if (endDate && curDate > endDate) {
    return {
      canAccess: false,
      code: isPaid ? 'EVENT_COMPLETED' : 'EVENT_EXPIRED',
      reason: isPaid
        ? `This event completed on ${formatDateOnly(endDate)}.`
        : `This event expired on ${formatDateOnly(endDate)}.`,
      error: isPaid
        ? `This event completed on ${formatDateOnly(endDate)}.`
        : `This event expired on ${formatDateOnly(endDate)}.`,
      is_expired: true,
      is_completed: isPaid,
      start_date: startDate,
      end_date: endDate,
      live_open_date: liveOpenDate,
      event_timezone: eventTimezone,
    };
  }

  // 3. Payment status check (checked independently)
  // Unpaid events during setup or live window are blocked awaiting payment, NOT cancelled
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
      event_timezone: eventTimezone,
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
      event_timezone: eventTimezone,
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
    event_timezone: eventTimezone,
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

  const { endDate } = getNormalizedEventDates(event);
  const eventTimezone = resolveEventTimezone(event);
  const curDate = getNormalizedCurrentDate(currentDate, eventTimezone);

  // Authoritative Rule: After event_end_date (3-Sep), Preview / Test is CLOSED
  if (endDate && curDate > endDate) {
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
  const eventTimezone = resolveEventTimezone(event);
  const curDate = getNormalizedCurrentDate(currentDate, eventTimezone);
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
  const eventTimezone = resolveEventTimezone(event);
  const curDate = getNormalizedCurrentDate(currentDate, eventTimezone);

  const isBeforeStartDate = Boolean(startDate && curDate < startDate);
  const isBeforeLiveWindow = Boolean(liveOpenDate && curDate < liveOpenDate);
  const isInsideLiveWindow = Boolean(
    liveOpenDate && endDate && curDate >= liveOpenDate && curDate <= endDate
  );
  const isAfterLiveWindow = Boolean(endDate && curDate > endDate);

  const previewUrlAvailable = canAccessPreviewEvent(event, currentDate);
  const previewHeaderVisible = previewUrlAvailable;
  const liveUrlAvailable = !isCancelled && isPaid && isInsideLiveWindow;

  let statusLabel = 'Scheduled';
  let statusExplanation = '';

  if (isCancelled) {
    statusLabel = 'Cancelled';
    statusExplanation = 'This event deployment has been cancelled.';
  } else if (isAfterLiveWindow) {
    if (isPaid) {
      statusLabel = 'Completed';
      statusExplanation = `This event completed on ${formatDateOnly(endDate)}.`;
    } else {
      statusLabel = 'Expired';
      statusExplanation = `This event expired on ${formatDateOnly(endDate)} without payment.`;
    }
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
 * - Current date > end_date:
 *     paid -> 'completed'
 *     unpaid -> 'expired'
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
): 'cancelled' | 'completed' | 'expired' | 'scheduled' | 'live' | 'pending_payment' | 'draft' {
  if (isEventExplicitlyCancelled(event)) {
    return 'cancelled';
  }

  const { startDate, endDate } = getNormalizedEventDates(event);
  const eventTimezone = resolveEventTimezone(event);
  const curDate = getNormalizedCurrentDate(now, eventTimezone);
  const isPaid = (event.payment_status || '').toUpperCase() === 'PAID';

  // 1. After event end date:
  // Paid => 'completed', Unpaid => 'expired'
  if (endDate && curDate > endDate) {
    return isPaid ? 'completed' : 'expired';
  }

  // 2. Before event start date:
  if (startDate && curDate < startDate) {
    return isPaid ? 'scheduled' : 'pending_payment';
  }

  // 3. On event date range (startDate <= curDate <= endDate):
  if (isPaid) {
    return 'live';
  }

  const rawStatus = (event.status || '').toLowerCase();
  if (rawStatus === 'draft') {
    return 'draft';
  }

  return 'pending_payment';
}

/**
 * Derives canonical EventLifecycleStatus enum:
 *
 * EXPECTED LIFECYCLE RULES:
 * 1. Only explicit cancellation: CANCELLED
 * 2. After event date has ended:
 *      PAID   => COMPLETED
 *      UNPAID => EXPIRED
 * 3. Before event date:
 *      PAID   => SCHEDULED
 *      UNPAID => PENDING_PAYMENT (or DRAFT if draft)
 * 4. On event date:
 *      PAID   => LIVE
 *      UNPAID => PENDING_PAYMENT
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
): 'DRAFT' | 'PAYMENT_PENDING' | 'PENDING_PAYMENT' | 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' {
  if (isEventExplicitlyCancelled(event)) {
    return 'CANCELLED';
  }

  const { startDate, endDate } = getNormalizedEventDates(event);
  const eventTimezone = resolveEventTimezone(event);
  const curDate = getNormalizedCurrentDate(now, eventTimezone);
  const isPaid = (event.payment_status || '').toUpperCase() === 'PAID';

  // 1. After event date has ended:
  // PAID => COMPLETED, UNPAID => EXPIRED
  if (endDate && curDate > endDate) {
    return isPaid ? 'COMPLETED' : 'EXPIRED';
  }

  // 2. Before event date:
  if (startDate && curDate < startDate) {
    return isPaid ? 'SCHEDULED' : 'PENDING_PAYMENT';
  }

  // 3. On event date:
  if (isPaid) {
    return 'LIVE';
  }

  const rawStatus = (event.status || '').toLowerCase();
  if (rawStatus === 'draft') {
    return 'DRAFT';
  }

  return 'PENDING_PAYMENT';
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

/**
 * Determines whether an event is eligible for Event Showcase creation, upload, editing, or publication.
 * 
 * Authoritative Rule (Separation of Concerns):
 * 1. Showcase Publishing Eligibility:
 *    - An event can have its showcase created, edited, media uploaded, and published once the event has STARTED
 *      (is LIVE or COMPLETED, current date >= start_date) and is PAID.
 * 
 * 2. Showcase Reward Eligibility:
 *    - Reward evaluation/approval for the First-Event Showcase Reward strictly requires that the event has COMPLETED.
 *      (See isEventEligibleForShowcaseReward below).
 *
 * Events in other states are NOT eligible for showcase creation/publishing:
 * - EXPIRED (unpaid + after event date) -> NOT ELIGIBLE
 * - PENDING_PAYMENT / UNPAID           -> NOT ELIGIBLE
 * - SCHEDULED (before start date)       -> NOT ELIGIBLE (Showcase can be created once the event starts)
 * - CANCELLED                          -> NOT ELIGIBLE
 * - DRAFT                              -> NOT ELIGIBLE
 */
export function isEventEligibleForShowcase(
  event: any,
  now?: Date | string
): { eligible: boolean; code?: string; reason?: string } {
  if (!event) {
    return { eligible: false, code: 'EVENT_NOT_FOUND', reason: 'Event not found.' };
  }

  const effectiveStatus = calculateEventStatus(event, now);
  const lifecycleStatus = deriveEventLifecycleStatus(event, now);

  if (effectiveStatus === 'expired' || lifecycleStatus === 'EXPIRED') {
    return {
      eligible: false,
      code: 'EVENT_EXPIRED',
      reason: 'Showcase is not available because this event expired without payment.',
    };
  }

  if (effectiveStatus === 'cancelled' || lifecycleStatus === 'CANCELLED') {
    return {
      eligible: false,
      code: 'EVENT_CANCELLED',
      reason: 'Showcase is not available for cancelled events.',
    };
  }

  const payStatus = (event.payment_status || '').toUpperCase();
  const isPaid = payStatus === 'PAID';

  if (!isPaid || effectiveStatus === 'pending_payment' || lifecycleStatus === 'PENDING_PAYMENT' || lifecycleStatus === 'PAYMENT_PENDING') {
    return {
      eligible: false,
      code: 'EVENT_UNPAID',
      reason: 'Showcase requires a confirmed, paid event.',
    };
  }

  // Check if event has started (LIVE or COMPLETED)
  if (
    effectiveStatus === 'live' ||
    effectiveStatus === 'completed' ||
    lifecycleStatus === 'LIVE' ||
    lifecycleStatus === 'COMPLETED'
  ) {
    return { eligible: true };
  }

  const { startDate } = getNormalizedEventDates(event);
  const eventTimezone = resolveEventTimezone(event);
  const curDate = getNormalizedCurrentDate(now, eventTimezone);

  if (startDate && curDate >= startDate) {
    return { eligible: true };
  }

  return {
    eligible: false,
    code: 'EVENT_NOT_STARTED',
    reason: 'Showcase can be created and published once the event starts.',
  };
}

/**
 * Determines whether an event is eligible for the First-Event RM300 Showcase Reward review.
 * 
 * Authoritative Rule:
 * Reward review eligibility strictly requires that the event has COMPLETED (is COMPLETED and PAID).
 * 
 * An event that is still LIVE (or not yet started) cannot have its showcase reward reviewed or approved yet.
 */
export function isEventEligibleForShowcaseReward(
  event: any,
  now?: Date | string
): { eligible: boolean; code?: string; reason?: string } {
  if (!event) {
    return { eligible: false, code: 'EVENT_NOT_FOUND', reason: 'Event not found.' };
  }

  const payStatus = (event.payment_status || '').toUpperCase();
  const isPaid = payStatus === 'PAID';

  if (!isPaid) {
    return {
      eligible: false,
      code: 'EVENT_UNPAID',
      reason: 'Showcase reward requires a confirmed, paid event.',
    };
  }

  const effectiveStatus = calculateEventStatus(event, now);
  const lifecycleStatus = deriveEventLifecycleStatus(event, now);

  if (effectiveStatus === 'completed' || lifecycleStatus === 'COMPLETED') {
    return { eligible: true };
  }

  const { endDate } = getNormalizedEventDates(event);
  const eventTimezone = resolveEventTimezone(event);
  const curDate = getNormalizedCurrentDate(now, eventTimezone);

  if (endDate && curDate > endDate) {
    return { eligible: true };
  }

  return {
    eligible: false,
    code: 'EVENT_NOT_COMPLETED',
    reason: 'Reward review is available once the event has completed.',
  };
}

/**
 * Determines whether an event is eligible for Showcase RM300 Reward submission.
 * 
 * Authoritative Rule:
 * The event only needs to have STARTED.
 * Allowed:
 * - LIVE + PAID
 * - COMPLETED + PAID
 * Rejected:
 * - NOT_STARTED (code: 'EVENT_NOT_STARTED')
 * - UNPAID (code: 'EVENT_UNPAID')
 * - CANCELLED (code: 'EVENT_CANCELLED')
 * - EXPIRED (code: 'EVENT_EXPIRED')
 */
export function isEventEligibleForShowcaseRewardSubmission(
  event: any,
  now?: Date | string
): { eligible: boolean; code?: string; reason?: string } {
  if (!event) {
    return { eligible: false, code: 'EVENT_NOT_FOUND', reason: 'Event not found.' };
  }

  const effectiveStatus = calculateEventStatus(event, now);
  const lifecycleStatus = deriveEventLifecycleStatus(event, now);

  const payStatus = (event.payment_status || '').toUpperCase();
  const isPaid = payStatus === 'PAID';

  if (!isPaid || effectiveStatus === 'pending_payment' || lifecycleStatus === 'PENDING_PAYMENT' || lifecycleStatus === 'PAYMENT_PENDING') {
    return {
      eligible: false,
      code: 'EVENT_UNPAID',
      reason: 'Showcase reward requires a confirmed, paid event.',
    };
  }

  if (effectiveStatus === 'cancelled' || lifecycleStatus === 'CANCELLED') {
    return {
      eligible: false,
      code: 'EVENT_CANCELLED',
      reason: 'Showcase reward submission is not available for cancelled events.',
    };
  }

  if (effectiveStatus === 'expired' || lifecycleStatus === 'EXPIRED') {
    return {
      eligible: false,
      code: 'EVENT_EXPIRED',
      reason: 'Showcase reward submission is not available because this event expired without payment.',
    };
  }

  // Check if event has started (LIVE or COMPLETED)
  if (
    effectiveStatus === 'live' ||
    effectiveStatus === 'completed' ||
    lifecycleStatus === 'LIVE' ||
    lifecycleStatus === 'COMPLETED'
  ) {
    return { eligible: true };
  }

  const { startDate } = getNormalizedEventDates(event);
  const eventTimezone = resolveEventTimezone(event);
  const curDate = getNormalizedCurrentDate(now, eventTimezone);

  if (startDate && curDate >= startDate) {
    return { eligible: true };
  }

  return {
    eligible: false,
    code: 'EVENT_NOT_STARTED',
    reason: 'Showcase reward submission is available once the event starts.',
  };
}

/**
 * Calculates the exact start time of Setup Day / Preparation window.
 */
export function getSetupDayStartTime(event: {
  starts_at?: string | null;
  event_date?: string | null;
  start_date?: string | null;
  setup_starts_at?: string | null;
  event_timezone?: string | null;
  timezone?: string | null;
  [key: string]: any;
}): Date {
  if (event.setup_starts_at) {
    return new Date(event.setup_starts_at);
  }

  const timeZone = resolveEventTimezone(event);

  let dateStr = event.start_date || event.event_date;
  if (!dateStr && event.starts_at) {
    const match = event.starts_at.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      dateStr = `${match[1]}-${match[2]}-${match[3]}`;
    } else {
      dateStr = event.starts_at.split('T')[0];
    }
  }

  if (dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const prev = new Date(Date.UTC(year, month, day - 1));
      const pad = (n: number) => n.toString().padStart(2, '0');
      const setupDayStr = `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
      return getUtcBoundaryInTimezone(setupDayStr, '00:00:00', timeZone);
    }
  }

  const startDate = new Date(event.starts_at || Date.now());
  const prev = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate() - 1));
  const pad = (n: number) => n.toString().padStart(2, '0');
  const setupDayStr = `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
  return getUtcBoundaryInTimezone(setupDayStr, '00:00:00', timeZone);
}

/**
 * Checks whether Setup Day / Testing has started.
 */
export function isSetupDayStarted(
  event: {
    starts_at?: string | null;
    event_date?: string | null;
    start_date?: string | null;
    setup_starts_at?: string | null;
    event_timezone?: string | null;
    timezone?: string | null;
    [key: string]: any;
  },
  now: Date | string = new Date()
): boolean {
  const timeZone = resolveEventTimezone(event);
  const dates = getNormalizedEventDates(event);
  const nowDt = now instanceof Date ? now : new Date(now);
  if (dates.liveOpenDate) {
    const curDate = getCalendarDateInTimezone(nowDt, timeZone);
    if (curDate >= dates.liveOpenDate) {
      return true;
    }
  }

  const setupTime = getSetupDayStartTime(event);
  return nowDt.getTime() >= setupTime.getTime();
}

export type EventDetailedLifecycle =
  | 'BEFORE_SETUP_DAY'
  | 'SETUP_DAY'
  | 'LIVE'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'CANCELLED';

/**
 * Returns the exact detailed lifecycle phase for an event.
 */
export function getDetailedEventLifecycle(
  event: any,
  now: Date | string = new Date()
): EventDetailedLifecycle {
  if (isEventExplicitlyCancelled(event)) {
    return 'CANCELLED';
  }
  const rawStatus = (event?.status || '').toLowerCase();
  const eventStatus = (event?.event_status || '').toUpperCase();
  if (rawStatus === 'cancelled' || eventStatus === 'CANCELLED') {
    return 'CANCELLED';
  }

  const dates = getNormalizedEventDates(event);
  const eventTimezone = resolveEventTimezone(event);
  const curDate = getNormalizedCurrentDate(now, eventTimezone);
  const isPaid = (event?.payment_status || '').toUpperCase() === 'PAID' || Number(event?.paid_amount || 0) > 0;

  if (dates.endDate && curDate > dates.endDate) {
    return isPaid ? 'COMPLETED' : 'EXPIRED';
  }

  if (dates.startDate && curDate >= dates.startDate && (!dates.endDate || curDate <= dates.endDate)) {
    return isPaid ? 'LIVE' : (dates.endDate && curDate > dates.endDate ? 'EXPIRED' : 'SETUP_DAY');
  }

  if (dates.liveOpenDate && curDate >= dates.liveOpenDate) {
    return 'SETUP_DAY';
  }

  return 'BEFORE_SETUP_DAY';
}

/**
 * Evaluates whether an event can be permanently deleted according to platform business rules:
 *
 * | Lifecycle        | Payment | Delete    |
 * | ---------------- | ------- | --------- |
 * | BEFORE_SETUP_DAY | UNPAID  | ALLOWED   |
 * | BEFORE_SETUP_DAY | PAID    | FORBIDDEN |
 * | SETUP_DAY        | UNPAID  | FORBIDDEN |
 * | SETUP_DAY        | PAID    | FORBIDDEN |
 * | LIVE             | PAID    | FORBIDDEN |
 * | COMPLETED        | PAID    | FORBIDDEN |
 * | EXPIRED          | UNPAID  | FORBIDDEN |
 * | EXPIRED          | PAID    | FORBIDDEN |
 * | CANCELLED        | —       | FORBIDDEN |
 */
export function canDeleteEvent(
  event: any,
  now: Date | string = new Date()
): EventDeletionEligibility {
  if (!event) {
    return {
      canDelete: false,
      code: 'EVENT_DELETE_NOT_ALLOWED',
      reason: 'Event not found.',
      lifecycle: 'BEFORE_SETUP_DAY',
      paymentStatus: 'UNPAID',
      isPaid: false,
    };
  }

  const rawStatus = (event.status || '').toLowerCase();
  const eventStatus = (event.event_status || '').toUpperCase();
  const payStatus = (event.payment_status || 'UNPAID').toUpperCase();
  const paidAmount = Number(event.paid_amount || 0);
  const isPaid = payStatus === 'PAID' || paidAmount > 0;

  const dates = getNormalizedEventDates(event);
  const timeZone = resolveEventTimezone(event);
  const curDate = getNormalizedCurrentDate(now, timeZone);
  const isCancelled =
    isEventExplicitlyCancelled(event) ||
    rawStatus === 'cancelled' ||
    eventStatus === 'CANCELLED' ||
    payStatus === 'REFUNDED';

  // 1. CANCELLED -> FORBIDDEN
  if (isCancelled) {
    return {
      canDelete: false,
      code: 'ALREADY_CANCELLED',
      reason: 'Cancelled events cannot be deleted.',
      lifecycle: 'CANCELLED',
      paymentStatus: payStatus,
      isPaid,
    };
  }

  // 2. AFTER EVENT END (COMPLETED or EXPIRED) -> FORBIDDEN
  if (dates.endDate && curDate > dates.endDate) {
    const lifecycle = isPaid ? 'COMPLETED' : 'EXPIRED';
    return {
      canDelete: false,
      code: 'EVENT_ENDED',
      reason: 'This event has ended and cannot be deleted, cancelled, or refunded.',
      lifecycle,
      paymentStatus: payStatus,
      isPaid,
    };
  }

  // 3. LIVE EVENT WINDOW -> FORBIDDEN
  if (dates.startDate && curDate >= dates.startDate && (!dates.endDate || curDate <= dates.endDate)) {
    return {
      canDelete: false,
      code: 'EVENT_LIVE',
      reason: 'This live event cannot be deleted or cancelled.',
      lifecycle: 'LIVE',
      paymentStatus: payStatus,
      isPaid,
    };
  }

  // 4. ON SETUP DAY -> FORBIDDEN
  if (dates.liveOpenDate && curDate >= dates.liveOpenDate) {
    return {
      canDelete: false,
      code: 'SETUP_DAY_STARTED',
      reason: 'This event can no longer be deleted because Setup Day has started.',
      lifecycle: 'SETUP_DAY',
      paymentStatus: payStatus,
      isPaid,
    };
  }

  // 5. BEFORE SETUP DAY + PAID -> FORBIDDEN (Must use Cancel & Refund)
  if (isPaid) {
    return {
      canDelete: false,
      code: 'EVENT_PAID',
      reason: 'This paid event cannot be deleted. Use Cancel & Refund before Setup Day.',
      lifecycle: 'BEFORE_SETUP_DAY',
      paymentStatus: payStatus,
      isPaid: true,
    };
  }

  // 6. BEFORE SETUP DAY + UNPAID -> ALLOWED
  return {
    canDelete: true,
    code: 'ELIGIBLE_FOR_DELETION',
    reason: 'This unpaid event can be permanently deleted before Setup Day.',
    lifecycle: 'BEFORE_SETUP_DAY',
    paymentStatus: payStatus,
    isPaid: false,
  };
}

/**
 * Dedicated engine to determine whether refund is allowed for an event and calculates refund amounts.
 */
export function determineEventRefund(
  event: any,
  now: Date | string = new Date()
): EventRefundDetermination {
  const payStatus = (event?.payment_status || 'UNPAID').toUpperCase();
  const paidAmount = Number(event?.paid_amount || 0);
  const discountAmount = Number(event?.discount_amount || 0);
  const paymentMode = event?.payment_mode || null;
  const isPaid = payStatus === 'PAID' || paidAmount > 0;

  const dates = getNormalizedEventDates(event);
  const timeZone = resolveEventTimezone(event);
  const curDate = getNormalizedCurrentDate(now, timeZone);
  const isCancelled =
    isEventExplicitlyCancelled(event) ||
    (event?.status || '').toLowerCase() === 'cancelled' ||
    (event?.event_status || '').toUpperCase() === 'CANCELLED' ||
    payStatus === 'REFUNDED';

  // Already refunded
  if (payStatus === 'REFUNDED') {
    return {
      canRefund: false,
      refundPaidAmount: 0,
      creditReversalAmount: 0,
      creditType: paymentMode,
      paymentStatus: payStatus,
      reason: 'Event payment has already been refunded.',
    };
  }

  if (isCancelled) {
    return {
      canRefund: false,
      refundPaidAmount: 0,
      creditReversalAmount: 0,
      creditType: paymentMode,
      paymentStatus: payStatus,
      reason: 'Event is already cancelled.',
    };
  }

  // After event end:
  if (dates.endDate && curDate > dates.endDate) {
    return {
      canRefund: false,
      refundPaidAmount: 0,
      creditReversalAmount: 0,
      creditType: paymentMode,
      paymentStatus: payStatus,
      reason: 'This event has ended and cannot be deleted, cancelled, or refunded.',
    };
  }

  // During Live Window:
  if (dates.startDate && curDate >= dates.startDate && (!dates.endDate || curDate <= dates.endDate)) {
    return {
      canRefund: false,
      refundPaidAmount: 0,
      creditReversalAmount: 0,
      creditType: paymentMode,
      paymentStatus: payStatus,
      reason: 'Active and live events cannot be cancelled.',
    };
  }

  // Setup Day or later: strictly non-refundable
  if (dates.liveOpenDate && curDate >= dates.liveOpenDate) {
    return {
      canRefund: false,
      refundPaidAmount: 0,
      creditReversalAmount: 0,
      creditType: paymentMode,
      paymentStatus: payStatus,
      reason: 'Once Setup Day starts, cancellation and refunds are not allowed.',
    };
  }

  // Unpaid or no payment recorded
  if (!isPaid) {
    return {
      canRefund: false,
      refundPaidAmount: 0,
      creditReversalAmount: 0,
      creditType: paymentMode,
      paymentStatus: payStatus,
      reason: 'No payment recorded for this event.',
    };
  }

  // Prior to Setup Day with paid balance: full refund
  const safePaid = Number(paidAmount) || 0;
  const safeDiscount = Number(discountAmount) || 0;
  return {
    canRefund: true,
    refundPaidAmount: safePaid,
    creditReversalAmount: safeDiscount,
    creditType: paymentMode,
    paymentStatus: payStatus,
    reason: `Eligible for full refund: RM${safePaid.toFixed(2)} to Paid Balance${
      safeDiscount > 0 ? ` and RM${safeDiscount.toFixed(2)} Credit Reversal` : ''
    }.`,
  };
}

/**
 * Dedicated cancellation policy engine: evaluates event cancellation rules.
 *
 * Enforces:
 * - Paid + before Setup Day -> ALLOWED (with full refund)
 * - Unpaid + before Setup Day -> REJECTED (Unpaid events should be deleted, not cancelled/refunded)
 * - On/After Setup Day -> REJECTED
 * - Live -> REJECTED
 * - Completed / Expired -> REJECTED
 * - Already cancelled -> REJECTED
 */
export function canCancelEvent(
  event: any,
  now: Date | string = new Date()
): EventCancellationEligibility {
  const rawStatus = (event?.status || '').toLowerCase();
  const eventStatus = (event?.event_status || '').toUpperCase();
  const payStatus = (event?.payment_status || 'UNPAID').toUpperCase();
  const paidAmount = Number(event?.paid_amount || 0);
  const isPaid = payStatus === 'PAID' || paidAmount > 0;

  const dates = getNormalizedEventDates(event);
  const timeZone = resolveEventTimezone(event);
  const curDate = getNormalizedCurrentDate(now, timeZone);
  const setupStartTime = getSetupDayStartTime(event);
  const isCancelled =
    isEventExplicitlyCancelled(event) ||
    rawStatus === 'cancelled' ||
    eventStatus === 'CANCELLED' ||
    payStatus === 'REFUNDED';

  const setupDayStarted = Boolean(dates.liveOpenDate && curDate >= dates.liveOpenDate);

  let calculatedStatus = rawStatus;
  if (isCancelled) {
    calculatedStatus = 'cancelled';
  } else if (dates.endDate && curDate > dates.endDate) {
    calculatedStatus = isPaid ? 'completed' : 'expired';
  } else if (dates.startDate && curDate >= dates.startDate) {
    calculatedStatus = isPaid ? 'live' : 'pending_payment';
  } else if (setupDayStarted) {
    calculatedStatus = 'testing';
  } else {
    calculatedStatus = 'scheduled';
  }

  const refundInfo = determineEventRefund(event, now);

  const baseResult = {
    rawStatus,
    calculatedStatus,
    setupDayStarted,
    setupStartsAt: setupStartTime.toISOString(),
    startsAt: event?.starts_at || (dates.startDate ? `${dates.startDate}T00:00:00.000Z` : ''),
    expiresAt: event?.expires_at || (dates.endDate ? `${dates.endDate}T23:59:59.999Z` : ''),
    paymentStatus: payStatus,
    refundPaidAmount: refundInfo.refundPaidAmount,
    creditReversalAmount: refundInfo.creditReversalAmount,
    creditType: refundInfo.creditType,
    canRefund: refundInfo.canRefund,
  };

  // 1. CANCELLED -> NO
  if (isCancelled) {
    return {
      ...baseResult,
      canCancel: false,
      canRefund: false,
      reason: 'Event is already cancelled.',
      code: 'ALREADY_CANCELLED',
    };
  }

  // 2. COMPLETED / EXPIRED -> NO
  if (dates.endDate && curDate > dates.endDate) {
    return {
      ...baseResult,
      canCancel: false,
      canRefund: false,
      reason: 'Completed or expired events cannot be cancelled.',
      code: 'EVENT_COMPLETED',
    };
  }

  // 3. ACTIVE / LIVE -> NO
  if (dates.startDate && curDate >= dates.startDate && (!dates.endDate || curDate <= dates.endDate)) {
    return {
      ...baseResult,
      canCancel: false,
      canRefund: false,
      reason: 'Active and live events cannot be cancelled.',
      code: 'EVENT_ACTIVE',
    };
  }

  // 4. ONCE SETUP DAY STARTS -> NO (strictly non-cancellable and non-refundable)
  if (setupDayStarted) {
    return {
      ...baseResult,
      canCancel: false,
      canRefund: false,
      reason: 'Once Setup Day starts, cancellation and refunds are not allowed.',
      code: 'SETUP_DAY_STARTED',
    };
  }

  // 5. BEFORE SETUP DAY:
  // Must be PAID for Cancel & Refund
  if (!isPaid) {
    return {
      ...baseResult,
      canCancel: false,
      canRefund: false,
      reason: 'Unpaid events cannot be cancelled or refunded. Delete the event instead before Setup Day.',
      code: 'EVENT_NOT_PAID',
    };
  }

  // 6. BEFORE SETUP DAY + PAID -> YES
  return {
    ...baseResult,
    canCancel: true,
    canRefund: true,
    reason: 'Event is scheduled before Setup Day and is eligible for cancellation with full refund.',
    code: 'ELIGIBLE_FOR_CANCELLATION',
  };
}

