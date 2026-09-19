import { getSupabaseServerClient, isLocalFallbackAllowed, isSupabaseConfigured, assertProductionMaintenanceSafe } from '../supabase.js';
import {
  EventRecord,
  EventStatus,
  EventLifecycleStatus,
  PaymentLifecycleStatus,
  EventCancelReason,
  EventWithDetails,
  GameThemeRecord,
  GameRecord,
  PaymentMode,
  EventPaymentCalculation,
  WalletTransactionRecord,
  WalletBalanceSummary,
  EventCancellationEligibility,
  EventRefundDetermination,
  CancellationErrorCode,
  PublicEventDTO,
} from './types.js';
import { getThemeById, isUUID, enrichThemesWithGameData, DEFAULT_CARNIVAL_THEME, checkOrganizationThemeReadiness } from './themes.js';
import { calculateCatchBrandSanityLimits, CatchBrandPhysicsSanityConfig } from '../games/catchBrandScoring.js';
import { getGameById } from './games.js';
import { getShowcaseByEventId, getShowcasesByOrgId } from './showcases.js';
import {
  STANDARD_EVENT_PRICE,
  calculateEventPayment,
  processEventPayment,
  refundEventPayment,
  withOrganizationLock,
  recordWalletAuditEvent,
} from './wallet.js';
import {
  getPlatformPricingSettings,
  calculateEventAuthoritativePrice,
  calculateEventCalendarDays,
} from './platformSettings.js';
import {
  clearEventTestScores,
  isEventTestScoresCleared,
  ensureTestScoresClearedForLiveEvent,
} from './highScores.js';
import { dispatchNotificationEvent, dispatchEventPaymentFailed } from '../notifications/dispatcher.js';
import { cleanupExpiredNotifications } from './notifications.js';
import { getOrganizationById } from './organizations.js';
import { getDefaultTimezoneForCountry, isValidTimezone, resolveEventTimezone } from '../../src/lib/countryUtils.js';
export { resolveEventTimezone };
import crypto from 'node:crypto';

// In-memory cache fallback for mock / test environments
export const localEventsCache = new Map<string, EventRecord>();

/**
 * Calculates current real-time status of an event based on time windows and payment status.
 */
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
  const extractDateOnly = (val: string | null | undefined): string => {
    if (!val) return '';
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const dt = new Date(val);
    if (isNaN(dt.getTime())) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  };

  const rawStart =
    event.start_date ||
    event.startDate ||
    event.event_date ||
    (event.starts_at ? extractDateOnly(event.starts_at) : '');

  const rawEnd =
    event.end_date ||
    event.endDate ||
    (event.expires_at ? extractDateOnly(event.expires_at) : '') ||
    rawStart;

  const startDate = extractDateOnly(rawStart) || '';
  const endDate = extractDateOnly(rawEnd) || startDate;

  // liveOpenDate = startDate - 1 calendar day
  let liveOpenDate = '';
  if (startDate) {
    const [y, m, d] = startDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d - 1, 0, 0, 0, 0));
    const pad = (n: number) => n.toString().padStart(2, '0');
    liveOpenDate = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }

  return {
    startDate,
    endDate,
    liveOpenDate,
  };
}

/**
 * Canonical platform business timezone declaration.
 * All events currently operate on Asia/Singapore & Malaysia (UTC+8) business timezone.
 */
export const PLATFORM_BUSINESS_TIMEZONE = 'Asia/Singapore';
export const PLATFORM_BUSINESS_TIMEZONE_LABEL = 'Asia/Singapore / Malaysia (UTC+8)';

/**
 * Normalizes input date representation to YYYY-MM-DD string in the target timezone (defaults to Asia/Singapore UTC+8).
 */
export function getNormalizedCurrentDate(currentDate?: string | Date | null, timeZone: string = PLATFORM_BUSINESS_TIMEZONE): string {
  if (typeof currentDate === 'string') {
    const match = currentDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const dt = currentDate instanceof Date ? currentDate : new Date();
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || PLATFORM_BUSINESS_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(dt);
  } catch (e) {
    const utcTime = dt.getTime();
    const sgTime = new Date(utcTime + 8 * 60 * 60 * 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${sgTime.getUTCFullYear()}-${pad(sgTime.getUTCMonth() + 1)}-${pad(sgTime.getUTCDate())}`;
  }
}

/**
 * Returns today's date formatted as YYYY-MM-DD in Asia/Singapore (UTC+8).
 */
export function getSingaporeCalendarDate(date: Date = new Date(), timeZone: string = PLATFORM_BUSINESS_TIMEZONE): string {
  return getNormalizedCurrentDate(date, timeZone);
}

/**
 * Returns the calendar date formatted as 'YYYY-MM-DD' in the specified timezone.
 */
export function getCalendarDateInTimezone(date: Date = new Date(), timeZone: string = PLATFORM_BUSINESS_TIMEZONE): string {
  return getNormalizedCurrentDate(date, timeZone);
}

/**
 * Calculates the UTC offset in milliseconds for a specific date in a given IANA timezone.
 */
export function getTimezoneOffsetMs(date: Date, timeZone: string = PLATFORM_BUSINESS_TIMEZONE): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      fractionalSecondDigits: 3,
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    let y = 0, m = 0, d = 0, h = 0, min = 0, s = 0, ms = 0;
    for (const part of parts) {
      if (part.type === 'year') y = parseInt(part.value, 10);
      else if (part.type === 'month') m = parseInt(part.value, 10);
      else if (part.type === 'day') d = parseInt(part.value, 10);
      else if (part.type === 'hour') {
        const val = parseInt(part.value, 10);
        h = val === 24 ? 0 : val;
      } else if (part.type === 'minute') min = parseInt(part.value, 10);
      else if (part.type === 'second') s = parseInt(part.value, 10);
      else if (part.type === 'fractionalSecond') ms = parseInt(part.value, 10);
    }
    const asUtcTimestamp = Date.UTC(y, m - 1, d, h, min, s, ms);
    return asUtcTimestamp - date.getTime();
  } catch {
    return 8 * 60 * 60 * 1000;
  }
}

/**
 * Calculates the exact UTC Date corresponding to a calendar day's start (00:00:00.000) or end (23:59:59.999)
 * in a specified IANA timezone.
 */
export function getUtcBoundaryInTimezone(
  calendarDateStr: string,
  boundary: 'start' | 'end',
  timeZone: string = PLATFORM_BUSINESS_TIMEZONE
): Date {
  const [yearStr, monthStr, dayStr] = calendarDateStr.split('-');
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const d = parseInt(dayStr, 10);

  const hour = boundary === 'start' ? 0 : 23;
  const min = boundary === 'start' ? 0 : 59;
  const sec = boundary === 'start' ? 0 : 59;
  const ms = boundary === 'start' ? 0 : 999;

  const approxUtc = new Date(Date.UTC(y, m - 1, d, hour, min, sec, ms));
  const offsetMs = getTimezoneOffsetMs(approxUtc, timeZone);
  return new Date(approxUtc.getTime() - offsetMs);
}

/**
 * Formats a date value into human-readable format like "07 Sep 2026" or "07 September 2026".
 */
export function formatDateOnly(
  dateVal: string | Date | null | undefined,
  options?: { fullMonth?: boolean }
): string {
  if (!dateVal) return '';
  const match = typeof dateVal === 'string'
    ? dateVal.match(/^(\d{4})-(\d{2})-(\d{2})/)
    : null;
  let year = '';
  let month = '';
  let day = '';
  if (match) {
    year = match[1];
    month = match[2];
    day = match[3];
  } else {
    const dt = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (isNaN(dt.getTime())) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    year = dt.getUTCFullYear().toString();
    month = pad(dt.getUTCMonth() + 1);
    day = pad(dt.getUTCDate());
  }
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const fullMonthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const mIndex = parseInt(month, 10) - 1;
  const monthStr = options?.fullMonth
    ? fullMonthNames[mIndex] || month
    : monthNames[mIndex] || month;
  return `${day} ${monthStr} ${year}`;
}

/**
 * Checks whether an event is strictly before its configured start date (Asia/Singapore calendar date).
 * In this pre-event window (including Setup Day), the event is in TEST mode and TEST scores can be manually cleared.
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
    status?: EventStatus | string | null;
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
    status?: EventStatus | string | null;
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
    status?: EventStatus | string | null;
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
): EventStatus {
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

  // 3. On event date range:
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
 * Checks whether an event is currently playable by the public according to canonical lifecycle rules.
 * Uses centralized canAccessLiveEvent date-only and payment authority.
 */
export function isEventPlayable(
  event: {
    status?: EventStatus | string | null;
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
): boolean {
  return canAccessLiveEvent(event, now);
}

/**
 * Derives the canonical uppercase event_status lifecycle enum:
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
    status?: EventStatus | string | null;
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
): EventLifecycleStatus {
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
 * Determines whether an event is eligible for Event Showcase creation, upload, editing, or publication.
 * Authoritative Rule:
 * ONLY COMPLETED events (PAID + after Event End Date) are eligible for Showcase.
 *
 * Events in ANY other state are NOT eligible:
 * - EXPIRED (unpaid + after event date) -> NOT ELIGIBLE
 * - PENDING_PAYMENT / UNPAID           -> NOT ELIGIBLE
 * - SCHEDULED                          -> NOT ELIGIBLE
 * - LIVE                               -> NOT ELIGIBLE
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

  if (effectiveStatus === 'completed' || lifecycleStatus === 'COMPLETED') {
    return { eligible: true };
  }

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

  return {
    eligible: false,
    code: 'EVENT_NOT_COMPLETED',
    reason: 'Showcase is only available after the event has completed.',
  };
}


/**
 * Counts currently pending-payment events for an organization.
 * Used to enforce the hard server-side limit of MAXIMUM 2 PENDING_PAYMENT events per org.
 */
export async function getPendingEventsCountByOrgId(
  organizationId: string,
  env?: Record<string, any>
): Promise<number> {
  const events = await getEventsByOrgId(organizationId, env);
  const pending = events.filter((e) => {
    const rawStatus = (e.status || '').toLowerCase();
    const payStatus = (e.payment_status || '').toUpperCase();
    if (rawStatus === 'cancelled' || rawStatus === 'expired') return false;
    if (e.event_status === 'CANCELLED' || e.event_status === 'EXPIRED') return false;
    return rawStatus === 'pending_payment' || payStatus === 'PENDING_PAYMENT' || payStatus === 'UNPAID';
  });
  return pending.length;
}

/**
 * Normalizes user-supplied event dates into authoritative calendar date boundaries.
 *
 * Rules:
 * 1. Start Date and End Date are calendar dates (YYYY-MM-DD).
 * 2. An event is active for the WHOLE calendar day range (inclusive).
 *    Start: ${startDate}T00:00:00.000Z
 *    End:   ${endDate}T23:59:59.999Z
 * 3. Setup Day is the calendar day immediately preceding the Start Date (00:00:00.000Z).
 * 4. End Date must be on or after Start Date (startDate <= endDate).
 * 5. One-day events (startDate === endDate) are valid.
 */
export function normalizeEventDateBoundaries(
  params: {
    start_date?: string | null;
    end_date?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    event_date?: string | null;
    starts_at?: string | null;
    expires_at?: string | null;
    event_timezone?: string | null;
  },
  options?: {
    forCreation?: boolean;
    currentDate?: string | Date | null;
    event_timezone?: string | null;
  }
): {
  startDate: string;
  endDate: string;
  liveOpenDate: string;
  event_date: string;
  start_date: string;
  end_date: string;
  starts_at: string;
  expires_at: string;
  setup_starts_at: string;
} {
  const extractDateOnly = (val: string | null | undefined): string => {
    if (!val) return '';
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
    const dt = new Date(val);
    if (isNaN(dt.getTime())) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  };

  let rawStart = params.start_date || params.startDate || params.event_date;
  if (!rawStart && params.starts_at) {
    rawStart = params.starts_at;
  }

  let rawEnd = params.end_date || params.endDate;
  if (!rawEnd && params.expires_at) {
    rawEnd = params.expires_at;
  }

  const startDate = extractDateOnly(rawStart);
  let endDate = extractDateOnly(rawEnd);

  if (!startDate) {
    const err: any = new Error('Start Date is required');
    err.status = 422;
    err.code = 'INVALID_START_DATE';
    throw err;
  }

  if (!endDate) {
    endDate = startDate;
  }

  // Timezone resolution: explicit parameter -> options -> default business timezone
  const timeZone = resolveEventTimezone(params.event_timezone || options?.event_timezone);

  const startUtc = getUtcBoundaryInTimezone(startDate, 'start', timeZone);
  const endUtc = getUtcBoundaryInTimezone(endDate, 'end', timeZone);

  if (isNaN(startUtc.getTime()) || isNaN(endUtc.getTime())) {
    const err: any = new Error('Invalid Start Date or End Date');
    err.status = 422;
    err.code = 'INVALID_DATE_FORMAT';
    throw err;
  }

  if (endDate < startDate) {
    const err: any = new Error('End date cannot be earlier than start date.');
    err.status = 422;
    err.code = 'INVALID_DATE_RANGE';
    throw err;
  }

  // Authoritative Business Rule: When creating an event:
  // IF event_end_date < current calendar date: BLOCK EVENT CREATION
  // Error: "This event date has already passed. Please select a current or future event date."
  if (options?.forCreation) {
    const curDate = getNormalizedCurrentDate(options.currentDate, timeZone);
    if (endDate < curDate) {
      const err: any = new Error('This event date has already passed. Please select a current or future event date.');
      err.status = 422;
      err.code = 'EVENT_DATE_PASSED';
      throw err;
    }
  }

  // Setup Day begins at 00:00:00 on the calendar day immediately preceding the Start Date in event's timezone
  const [startY, startM, startD] = startDate.split('-').map(Number);
  const prevDate = new Date(Date.UTC(startY, startM - 1, startD - 1));
  const pad = (n: number) => n.toString().padStart(2, '0');
  const setupDayStr = `${prevDate.getUTCFullYear()}-${pad(prevDate.getUTCMonth() + 1)}-${pad(prevDate.getUTCDate())}`;
  const setupUtc = getUtcBoundaryInTimezone(setupDayStr, 'start', timeZone);

  return {
    startDate,
    endDate,
    liveOpenDate: setupDayStr,
    event_date: startDate,
    start_date: startDate,
    end_date: endDate,
    starts_at: startUtc.toISOString(),
    expires_at: endUtc.toISOString(),
    setup_starts_at: setupUtc.toISOString(),
  };
}

/**
 * Calculates the exact start time of Setup Day / Preparation window.
 * Business Rule:
 * The Setup Day is the calendar day immediately before the event starts (00:00:00 Asia/Singapore UTC+8).
 * For an event scheduled for:
 * Event date: 2 September – 3 September (e.g. 2026-09-02)
 * the Setup Day = 1 September 00:00:00 SGT (2026-08-31T16:00:00.000Z).
 * IMPORTANT: Setup Day ONLY governs cancellation/refund eligibility (event becomes strictly non-refundable and non-cancellable).
 * Setup Day NEVER automatically triggers payment or wallet balance deduction.
 */
export function getSetupDayStartTime(event: {
  starts_at?: string | null;
  event_date?: string | null;
  start_date?: string | null;
  setup_starts_at?: string | null;
  event_timezone?: string | null;
  timezone?: string | null;
}): Date {
  if (event.setup_starts_at) {
    return new Date(event.setup_starts_at);
  }

  const timeZone = resolveEventTimezone(event);

  // Derive calendar date from start_date, event_date, or starts_at
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
      const month = parseInt(parts[1], 10) - 1; // 0-indexed (0 = Jan)
      const day = parseInt(parts[2], 10);
      const prev = new Date(Date.UTC(year, month, day - 1));
      const pad = (n: number) => n.toString().padStart(2, '0');
      const setupDayStr = `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
      return getUtcBoundaryInTimezone(setupDayStr, 'start', timeZone);
    }
  }

  const startDate = new Date(event.starts_at || Date.now());
  const prev = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate() - 1));
  const pad = (n: number) => n.toString().padStart(2, '0');
  const setupDayStr = `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
  return getUtcBoundaryInTimezone(setupDayStr, 'start', timeZone);
}

/**
 * Checks whether Setup Day / Testing has started.
 */
export function isSetupDayStarted(
  event: {
    starts_at: string;
    event_date?: string | null;
    start_date?: string | null;
    setup_starts_at?: string | null;
    event_timezone?: string | null;
    timezone?: string | null;
    [key: string]: any;
  },
  now: Date = new Date()
): boolean {
  const timeZone = resolveEventTimezone(event);
  const dates = getNormalizedEventDates(event);
  if (dates.liveOpenDate) {
    const curDate = getCalendarDateInTimezone(now, timeZone);
    if (curDate >= dates.liveOpenDate) {
      return true;
    }
  }

  // Fall back to timestamp comparison
  const setupTime = getSetupDayStartTime(event);
  return now.getTime() >= setupTime.getTime();
}

/**
 * Dedicated engine to determine whether refund is allowed for an event and calculates refund amounts.
 *
 * Rules:
 * 1. Before Setup Day: Cancellation is allowed (Unpaid events need no refund; paid events receive 100% full refund).
 * 2. On/After Setup Day starts:
 *    - Cancellation is strictly NOT allowed
 *    - Refund is strictly NOT allowed
 *    - Credit reversal is strictly NOT allowed
 *    - Wallet balance is NOT returned
 */
export function determineEventRefund(
  event: EventRecord | EventWithDetails,
  now: Date = new Date()
): EventRefundDetermination {
  const paymentStatus = (event.payment_status || 'UNPAID').toUpperCase();
  const paidAmount = Number(event.paid_amount || 0);
  const discountAmount = Number(event.discount_amount || 0);
  const paymentMode = event.payment_mode || null;
  const setupDayStarted = isSetupDayStarted(event, now);

  // 1. Once Setup Day starts: strictly non-refundable
  if (setupDayStarted) {
    return {
      canRefund: false,
      refundPaidAmount: 0,
      creditReversalAmount: 0,
      creditType: paymentMode,
      paymentStatus,
      reason: 'Once Setup Day starts, cancellation and refunds are not allowed.',
    };
  }

  // 2. Unpaid or no payment recorded
  if (paymentStatus !== 'PAID' || (paidAmount === 0 && discountAmount === 0)) {
    return {
      canRefund: false,
      refundPaidAmount: 0,
      creditReversalAmount: 0,
      creditType: paymentMode,
      paymentStatus,
      reason: paymentStatus === 'REFUNDED'
        ? 'Event payment has already been refunded.'
        : 'No payment recorded for this event.',
    };
  }

  // 3. Prior to Setup Day with paid balance: full refund
  const safePaid = Number(paidAmount) || 0;
  const safeDiscount = Number(discountAmount) || 0;
  return {
    canRefund: true,
    refundPaidAmount: safePaid,
    creditReversalAmount: safeDiscount,
    creditType: paymentMode,
    paymentStatus,
    reason: `Eligible for full refund: RM${safePaid.toFixed(2)} to Paid Balance${
      safeDiscount > 0 ? ` and RM${safeDiscount.toFixed(2)} Credit Reversal` : ''
    }.`,
  };
}

/**
 * Dedicated cancellation policy engine: evaluates event cancellation rules.
 *
 * Cancellation Matrix:
 * DRAFT (before Setup Day, unpaid)     → YES
 * SCHEDULED (before Setup Day, unpaid) → YES
 * SCHEDULED (before Setup Day, paid)   → YES (with full refund)
 * ON / AFTER SETUP DAY (paid or unpaid) → NO
 * ACTIVE / LIVE                        → NO
 * COMPLETED / EXPIRED                  → NO
 * CANCELLED                            → NO
 */
export function canCancelEvent(
  event: EventRecord | EventWithDetails,
  now: Date = new Date()
): EventCancellationEligibility {
  const rawStatus = (event.status || '').toLowerCase();
  const eventStatus = (event.event_status || '').toUpperCase();
  const payStatus = (event.payment_status || 'UNPAID').toUpperCase();
  const startsAtTime = new Date(event.starts_at).getTime();
  const expiresAtTime = new Date(event.expires_at).getTime();
  const nowTime = now.getTime();
  const setupStartTime = getSetupDayStartTime(event);
  const setupDayStarted = isSetupDayStarted(event, now);

  const refundInfo = determineEventRefund(event, now);

  // Derive calculated status
  let calculatedStatus = rawStatus;
  if (rawStatus === 'cancelled' || eventStatus === 'CANCELLED') {
    calculatedStatus = 'cancelled';
  } else if (rawStatus === 'draft' || eventStatus === 'DRAFT') {
    calculatedStatus = 'draft';
  } else if (nowTime >= expiresAtTime || rawStatus === 'expired' || rawStatus === 'completed' || eventStatus === 'COMPLETED') {
    calculatedStatus = 'expired';
  } else if (nowTime >= startsAtTime || (rawStatus === 'live' && nowTime >= startsAtTime) || (rawStatus === 'active' && nowTime >= startsAtTime)) {
    calculatedStatus = 'live';
  } else if (setupDayStarted || rawStatus === 'testing') {
    calculatedStatus = 'testing';
  } else {
    calculatedStatus = 'scheduled';
  }

  const baseResult = {
    rawStatus,
    calculatedStatus,
    setupDayStarted,
    setupStartsAt: setupStartTime.toISOString(),
    startsAt: event.starts_at,
    expiresAt: event.expires_at,
    paymentStatus: payStatus,
    refundPaidAmount: refundInfo.refundPaidAmount,
    creditReversalAmount: refundInfo.creditReversalAmount,
    creditType: refundInfo.creditType,
    canRefund: refundInfo.canRefund,
  };

  // 1. CANCELLED -> NO
  if (rawStatus === 'cancelled' || eventStatus === 'CANCELLED') {
    return {
      ...baseResult,
      canCancel: false,
      canRefund: false,
      reason: 'Event is already cancelled.',
      code: 'ALREADY_CANCELLED',
    };
  }

  // 2. COMPLETED / EXPIRED -> NO
  if (calculatedStatus === 'expired' || rawStatus === 'expired' || rawStatus === 'completed' || nowTime >= expiresAtTime) {
    return {
      ...baseResult,
      canCancel: false,
      canRefund: false,
      reason: 'Completed or expired events cannot be cancelled.',
      code: 'EVENT_COMPLETED',
    };
  }

  // 3. ACTIVE / LIVE -> NO
  if (calculatedStatus === 'live' || (nowTime >= startsAtTime && nowTime < expiresAtTime)) {
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

  // 5. BEFORE SETUP DAY (DRAFT or SCHEDULED, whether paid or unpaid) -> YES
  return {
    ...baseResult,
    canCancel: true,
    canRefund: refundInfo.canRefund,
    reason: refundInfo.canRefund
      ? 'Event is scheduled before Setup Day and is eligible for cancellation with full refund.'
      : 'Event is scheduled before Setup Day and is eligible for cancellation.',
    code: 'ELIGIBLE_FOR_CANCELLATION',
  };
}

/**
 * Generate a cryptographically secure, collision-resistant alphanumeric token for public event links (e.g. 7KQ2M9X4F8P3W6YJ)
 * Uses 16 characters from a 32-character alphabet (80 bits of entropy), preventing capability credential enumeration.
 */
export function generatePublicToken(length: number = 16): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // base32 without ambiguous 0/O/1/I
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * List all events for an organization, enriched with theme, game, and calculated status.
 */
export async function getEventsByOrgId(
  organizationId: string,
  env?: Record<string, any>
): Promise<EventWithDetails[]> {
  if (!organizationId || organizationId === 'undefined' || organizationId === 'null' || !isUUID(organizationId)) {
    return [];
  }

  const supabase = getSupabaseServerClient(env);
  let events: EventRecord[] = [];

  try {
    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (eventsError) {
      if (eventsError.message?.includes('Placeholder') || eventsError.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
        events = Array.from(localEventsCache.values()).filter((e) => e.organization_id === organizationId);
      } else {
        console.error('Error in getEventsByOrgId:', eventsError);
        throw new Error(`Failed to list events: ${eventsError.message}`);
      }
    } else {
      events = ((eventsData || []) as EventRecord[]).map((ev) => {
        const cached = isLocalFallbackAllowed(env) ? localEventsCache.get(ev.id) : undefined;
        const merged: EventRecord = {
          ...ev,
          ...(cached || {}),
          game_id: cached?.game_id || ev.game_id,
          status: cached?.status || ev.status,
          event_status: cached?.event_status || ev.event_status,
          payment_status: cached?.payment_status || ev.payment_status,
          payment_mode: cached?.payment_mode || ev.payment_mode,
          paid_amount: cached?.paid_amount !== undefined && cached.paid_amount !== null ? cached.paid_amount : ev.paid_amount,
          event_price: cached?.event_price !== undefined && cached.event_price !== null ? cached.event_price : ev.event_price,
          event_currency: cached?.event_currency || ev.event_currency || 'MYR',
          cancel_reason: cached?.cancel_reason !== undefined ? cached.cancel_reason : ev.cancel_reason,
        };
        if (isLocalFallbackAllowed(env)) {
          localEventsCache.set(merged.id, merged);
        }
        return merged;
      });
      if (isLocalFallbackAllowed(env)) {
        const seenIds = new Set(events.map((e) => e.id));
        for (const cached of localEventsCache.values()) {
          if (cached.organization_id === organizationId && !seenIds.has(cached.id)) {
            events.push(cached);
            seenIds.add(cached.id);
          }
        }
      }
    }
  } catch (err: any) {
    if (isLocalFallbackAllowed(env)) {
      console.warn('getEventsByOrgId encountered error, falling back to local cache:', err?.message || err);
      events = Array.from(localEventsCache.values()).filter((e) => e.organization_id === organizationId);
    } else {
      throw err;
    }
  }

  if (events.length === 0) return [];

  // Fetch related game themes to enrich event list
  const themeIds = Array.from(new Set(events.map((e) => e.game_theme_id).filter(Boolean)));
  const { data: themesData } = await supabase
    .from('game_themes')
    .select('*, games(id, name, slug, game_type, status, description, icon_name)')
    .in('id', themeIds);

  const enrichedThemes = await enrichThemesWithGameData(themesData || [], env);
  const themesMap = new Map<string, any>();
  for (const t of enrichedThemes) {
    themesMap.set(t.id, t);
  }

  // Fetch games by direct event.game_id
  const directGameIds = Array.from(new Set(events.map((e) => e.game_id).filter(Boolean) as string[]));
  const gamesMap = new Map<string, any>();
  if (directGameIds.length > 0) {
    const { data: gamesData } = await supabase
      .from('games')
      .select('id, name, slug, game_type, status, description, icon_name')
      .in('id', directGameIds);
    if (gamesData) {
      for (const g of gamesData) {
        gamesMap.set(g.id, g);
      }
    }
  }

  // Fetch showcases for all events in this organization
  const showcases = await getShowcasesByOrgId(organizationId, env);
  const showcaseMap = new Map<string, any>();
  for (const sc of showcases) {
    showcaseMap.set(sc.event_id, sc);
  }

  return events.map((event) => {
    const theme = themesMap.get(event.game_theme_id) || null;
    const directGame = event.game_id ? gamesMap.get(event.game_id) : null;
    const resolvedGame = directGame || theme?.games || null;
    const calculated = calculateEventStatus(event);
    const showcase = showcaseMap.get(event.id) || null;
    const setupStartTime = getSetupDayStartTime(event);
    const cancellationEligibility = canCancelEvent(event);
    const storedPrice = event.event_price !== undefined && event.event_price !== null
      ? Number(event.event_price)
      : (event.paid_amount !== undefined && event.paid_amount !== null ? Number(event.paid_amount) : 1400.00);
    const paymentStatus = (event.payment_status || (event.status === 'pending_payment' ? 'PENDING_PAYMENT' : 'UNPAID')).toUpperCase();
    const isPaid = paymentStatus === 'PAID';
    const eventLifecycle = event.event_status || deriveEventLifecycleStatus(event);

    const rawStartDate = event.start_date || (event.starts_at ? event.starts_at.split('T')[0] : event.event_date) || null;
    const rawEndDate = event.end_date || (event.expires_at ? event.expires_at.split('T')[0] : rawStartDate) || rawStartDate;
    const rawEventDate = event.event_date || rawStartDate;

    return {
      ...event,
      start_date: rawStartDate,
      end_date: rawEndDate,
      event_date: rawEventDate,
      game_id: event.game_id || theme?.game_id || resolvedGame?.id || null,
      event_price: storedPrice,
      event_currency: event.event_currency || 'MYR',
      event_status: eventLifecycle,
      payment_status: paymentStatus as any,
      cancel_reason: event.cancel_reason || null,
      payment_mode: event.payment_mode || (isPaid ? 'FULL_PAID' : undefined),
      paid_amount: event.paid_amount !== undefined ? event.paid_amount : (isPaid ? storedPrice : 0),
      discount_amount: event.discount_amount || 0,
      calculated_status: calculated,
      setup_starts_at: setupStartTime.toISOString(),
      cancellation_eligibility: cancellationEligibility,
      game_theme: theme,
      game: resolvedGame
        ? {
            id: resolvedGame.id,
            name: resolvedGame.name,
            slug: resolvedGame.slug,
            game_type: resolvedGame.game_type || 'catch-brand',
            status: resolvedGame.status || 'active',
            description: resolvedGame.description || null,
            icon_name: resolvedGame.icon_name || null,
          }
        : null,
      showcase: showcase,
      showcase_status: showcase ? showcase.status : 'NOT_CREATED',
    };
  });
}

/**
 * Get single event by ID with full details.
 */
export async function getEventById(
  eventId: string,
  env?: Record<string, any>
): Promise<EventWithDetails | null> {
  if (!eventId || typeof eventId !== 'string' || eventId === 'undefined' || eventId === 'null') {
    return null;
  }

  let eventRecord: EventRecord | null = null;

  // If not a valid UUID string, check local cache directly without querying Supabase to avoid 22P02 Postgres syntax error
  if (!isUUID(eventId)) {
    eventRecord = localEventsCache.get(eventId) || null;
    if (!eventRecord) return null;
  } else {
    const supabase = getSupabaseServerClient(env);

    const { data: event, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .maybeSingle();

    if (error) {
      if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
        eventRecord = localEventsCache.get(eventId) || null;
      } else {
        console.error('Error in getEventById:', error);
        throw new Error(`Failed to get event: ${error.message}`);
      }
    } else {
      const raw = (event as EventRecord) || null;
      if (raw) {
        const cached = isLocalFallbackAllowed(env) ? localEventsCache.get(eventId) : undefined;
        eventRecord = {
          ...raw,
          ...(cached || {}),
          game_id: cached?.game_id || raw.game_id,
          status: cached?.status || raw.status,
          event_status: cached?.event_status || raw.event_status,
          payment_status: cached?.payment_status || raw.payment_status,
          cancel_reason: cached?.cancel_reason !== undefined ? cached.cancel_reason : raw.cancel_reason,
          payment_mode: cached?.payment_mode || raw.payment_mode,
          paid_amount: cached?.paid_amount !== undefined && cached.paid_amount !== null ? cached.paid_amount : raw.paid_amount,
          event_price: cached?.event_price !== undefined && cached.event_price !== null ? cached.event_price : raw.event_price,
          event_currency: cached?.event_currency || raw.event_currency || 'MYR',
        };
        if (isLocalFallbackAllowed(env)) {
          localEventsCache.set(raw.id, eventRecord);
        }
      } else {
        eventRecord = isLocalFallbackAllowed(env) ? (localEventsCache.get(eventId) || null) : null;
      }
    }
  }

  if (!eventRecord) return null;
  let theme: GameThemeRecord | null = null;
  let game: GameRecord | null = null;

  if (eventRecord.game_id) {
    game = await getGameById(eventRecord.game_id, env);
  }

  if (eventRecord.game_theme_id) {
    theme = await getThemeById(eventRecord.game_theme_id, env);
    if (!game && theme && theme.game_id) {
      game = await getGameById(theme.game_id, env);
    }
  }

  const showcase = await getShowcaseByEventId(eventId, env);
  const setupStartTime = getSetupDayStartTime(eventRecord);
  const cancellationEligibility = canCancelEvent(eventRecord);
  const storedPrice = eventRecord.event_price !== undefined && eventRecord.event_price !== null
    ? Number(eventRecord.event_price)
    : (eventRecord.paid_amount !== undefined && eventRecord.paid_amount !== null ? Number(eventRecord.paid_amount) : 1400.00);
  const paymentStatus = (eventRecord.payment_status || (eventRecord.status === 'pending_payment' ? 'PENDING_PAYMENT' : 'UNPAID')).toUpperCase();
  const isPaid = paymentStatus === 'PAID';
  const eventLifecycle = eventRecord.event_status || deriveEventLifecycleStatus(eventRecord);

  const rawStartDate = eventRecord.start_date || (eventRecord.starts_at ? eventRecord.starts_at.split('T')[0] : eventRecord.event_date) || null;
  const rawEndDate = eventRecord.end_date || (eventRecord.expires_at ? eventRecord.expires_at.split('T')[0] : rawStartDate) || rawStartDate;
  const rawEventDate = eventRecord.event_date || rawStartDate;

  // Automatic date-based test score transition check on event retrieval
  const { startDate: evStartDate } = getNormalizedEventDates(eventRecord);
  const curDate = getNormalizedCurrentDate();
  if (evStartDate && curDate >= evStartDate && !isEventTestScoresCleared(eventRecord.id, eventRecord)) {
    ensureTestScoresClearedForLiveEvent(eventRecord.id, eventRecord, env).catch((e) => {
      console.warn(`[getEventById] Notice ensuring test scores cleared for ${eventRecord.id}:`, e?.message || e);
    });
  }

  return {
    ...eventRecord,
    test_scores_cleared_at: eventRecord.test_scores_cleared_at || null,
    start_date: rawStartDate,
    end_date: rawEndDate,
    event_date: rawEventDate,
    game_id: eventRecord.game_id || theme?.game_id || game?.id || null,
    event_price: storedPrice,
    event_currency: eventRecord.event_currency || 'MYR',
    event_status: eventLifecycle,
    payment_status: paymentStatus as any,
    cancel_reason: eventRecord.cancel_reason || null,
    payment_mode: eventRecord.payment_mode || (isPaid ? 'FULL_PAID' : undefined),
    paid_amount: eventRecord.paid_amount !== undefined ? eventRecord.paid_amount : (isPaid ? storedPrice : 0),
    discount_amount: eventRecord.discount_amount || 0,
    calculated_status: calculateEventStatus(eventRecord),
    setup_starts_at: setupStartTime.toISOString(),
    cancellation_eligibility: cancellationEligibility,
    game_theme: theme,
    game: game
      ? {
          id: game.id,
          name: game.name,
          slug: game.slug,
          game_type: game.game_type || 'catch-brand',
          status: game.status || 'active',
          description: game.description || null,
          icon_name: game.icon_name || null,
        }
      : null,
    showcase: showcase,
    showcase_status: showcase ? showcase.status : 'NOT_CREATED',
  };
}

/**
 * Public resolution endpoint: Get event by public token.
 * By default, enforces strict public safety: ONLY returns PAID, LIVE, non-cancelled events.
 * Set options.allowUnpaid = true for internal preview or status verification.
 */
export async function getEventByPublicToken(
  publicToken: string,
  env?: Record<string, any>,
  options?: { allowUnpaid?: boolean }
): Promise<EventWithDetails | null> {
  if (!publicToken || typeof publicToken !== 'string' || publicToken === 'undefined' || publicToken === 'null' || !publicToken.trim()) {
    return null;
  }

  const supabase = getSupabaseServerClient(env);

  let eventRecord: EventRecord | null = null;
  const { data: event, error } = await supabase
    .from('events')
    .select('*')
    .eq('public_token', publicToken.trim().toUpperCase())
    .maybeSingle();

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      eventRecord = Array.from(localEventsCache.values()).find((e) => e.public_token?.trim().toUpperCase() === publicToken.trim().toUpperCase()) || null;
    } else {
      console.error('Error in getEventByPublicToken:', error);
      throw new Error(`Failed to get public event: ${error.message}`);
    }
  } else {
    const raw = (event as EventRecord) || null;
    if (raw) {
      const cached = isLocalFallbackAllowed(env)
        ? (localEventsCache.get(raw.id) || Array.from(localEventsCache.values()).find((e) => e.public_token === publicToken.trim().toUpperCase()))
        : undefined;
      eventRecord = {
        ...raw,
        ...(cached || {}),
        status: cached?.status || raw.status,
        event_status: cached?.event_status || raw.event_status,
        payment_status: cached?.payment_status || raw.payment_status,
        cancel_reason: cached?.cancel_reason !== undefined ? cached.cancel_reason : raw.cancel_reason,
        payment_mode: cached?.payment_mode || raw.payment_mode,
        paid_amount: cached?.paid_amount !== undefined && cached.paid_amount !== null ? cached.paid_amount : raw.paid_amount,
        event_price: cached?.event_price !== undefined && cached.event_price !== null ? cached.event_price : raw.event_price,
        event_currency: cached?.event_currency || raw.event_currency || 'MYR',
      };
      if (isLocalFallbackAllowed(env)) {
        localEventsCache.set(raw.id, eventRecord);
      }
    } else if (isLocalFallbackAllowed(env)) {
      eventRecord = Array.from(localEventsCache.values()).find((e) => e.public_token?.trim().toUpperCase() === publicToken.trim().toUpperCase()) || null;
    } else {
      eventRecord = null;
    }
  }

  if (!eventRecord) {
    return null;
  }

  const isExplicitlyCancelled = isEventExplicitlyCancelled(eventRecord);
  const derivedLifecycle = deriveEventLifecycleStatus(eventRecord);
  const calculatedStatus = calculateEventStatus(eventRecord);
  const paymentStatus = (eventRecord.payment_status || (eventRecord.status === 'pending_payment' ? 'PENDING_PAYMENT' : 'UNPAID')).toUpperCase();
  const isPaid = paymentStatus === 'PAID';
  const eventLifecycleStatus = derivedLifecycle;
  const allowUnpaid = Boolean(options?.allowUnpaid);

  // Strict Public Guard:
  // If allowUnpaid is NOT explicitly requested (e.g. playing/submitting scores):
  // Event MUST be PAID, NOT CANCELLED, and PLAYABLE/VALID.
  if (!allowUnpaid) {
    if (isExplicitlyCancelled || !isPaid) {
      return null;
    }
  }

  const theme = await getThemeById(eventRecord.game_theme_id, env);

  let game: GameRecord | null = null;
  if (eventRecord.game_id) {
    game = await getGameById(eventRecord.game_id, env);
  }
  if (!game && theme?.game_id) {
    game = await getGameById(theme.game_id, env);
  }

  // Also fetch organization details
  let orgName = 'Studio';
  let orgSlug = 'studio';
  const { data: orgData } = await supabase
    .from('organizations')
    .select('name, slug')
    .eq('id', eventRecord.organization_id)
    .maybeSingle();

  if (orgData) {
    orgName = orgData.name;
    orgSlug = orgData.slug;
  }

  const storedPrice = eventRecord.event_price !== undefined && eventRecord.event_price !== null
    ? Number(eventRecord.event_price)
    : (eventRecord.paid_amount !== undefined && eventRecord.paid_amount !== null ? Number(eventRecord.paid_amount) : 1400.00);

  const rawStartDate = eventRecord.start_date || (eventRecord.starts_at ? eventRecord.starts_at.split('T')[0] : eventRecord.event_date) || null;
  const rawEndDate = eventRecord.end_date || (eventRecord.expires_at ? eventRecord.expires_at.split('T')[0] : rawStartDate) || rawStartDate;
  const rawEventDate = eventRecord.event_date || rawStartDate;

  // Automatic date-based test score transition check on public event resolution
  const { startDate: pubStartDate } = getNormalizedEventDates(eventRecord);
  const curPubDate = getNormalizedCurrentDate();
  if (pubStartDate && curPubDate >= pubStartDate && !isEventTestScoresCleared(eventRecord.id, eventRecord)) {
    ensureTestScoresClearedForLiveEvent(eventRecord.id, eventRecord, env).catch((e) => {
      console.warn(`[getEventByPublicToken] Notice ensuring test scores cleared for ${eventRecord.id}:`, e?.message || e);
    });
  }

  return {
    ...eventRecord,
    test_scores_cleared_at: eventRecord.test_scores_cleared_at || null,
    start_date: rawStartDate,
    end_date: rawEndDate,
    event_date: rawEventDate,
    event_price: storedPrice,
    event_currency: eventRecord.event_currency || 'MYR',
    event_status: (isExplicitlyCancelled ? 'CANCELLED' : eventLifecycleStatus) as EventLifecycleStatus,
    status: isExplicitlyCancelled ? 'cancelled' : calculatedStatus,
    payment_status: paymentStatus as any,
    cancel_reason: isExplicitlyCancelled ? (eventRecord.cancel_reason || null) : null,
    payment_mode: eventRecord.payment_mode || (isPaid ? 'FULL_PAID' : undefined),
    paid_amount: eventRecord.paid_amount !== undefined ? eventRecord.paid_amount : (isPaid ? storedPrice : 0),
    discount_amount: eventRecord.discount_amount || 0,
    calculated_status: isExplicitlyCancelled ? 'cancelled' : calculatedStatus,
    game_id: eventRecord.game_id || theme?.game_id || game?.id || null,
    game_theme: theme,
    game: game
      ? {
          id: game.id,
          name: game.name,
          slug: game.slug,
          game_type: game.game_type || 'catch-brand',
        }
      : null,
    organization_name: orgName,
    organization_slug: orgSlug,
  };
}

/**
 * Creates a sanitized Public Event DTO for unauthenticated public players.
 *
 * Excludes all sensitive internal data:
 * - organization_id
 * - created_by
 * - payment information (paid_amount, payment_status, payment_mode)
 * - internal status fields (status, event_status, calculated_status)
 * - pricing information (event_price, event_currency, discounts, credits)
 * - cancellation reasons and audit columns
 *
 * Contains only the public player necessities:
 * {
 *   id,
 *   name,
 *   game,
 *   theme,
 *   branding,
 *   start_date,
 *   end_date,
 *   live_open_date
 * }
 */
export function toPublicEventDTO(rawEvent: any): PublicEventDTO {
  if (!rawEvent) {
    return rawEvent;
  }

  const { startDate, endDate, liveOpenDate } = getNormalizedEventDates(rawEvent);
  const rawTheme = rawEvent.game_theme || rawEvent.theme || null;

  // Sanitize theme so internal organization_id / created_by are not leaked
  let safeTheme: any = null;
  if (rawTheme) {
    const { organization_id, created_by, created_at, updated_at, ...restTheme } = rawTheme;
    safeTheme = restTheme;
  }

  const rawGame = rawEvent.game;
  const gameDTO = rawGame
    ? {
        id: rawGame.id,
        name: rawGame.name,
        slug: rawGame.slug,
        game_type: rawGame.game_type || rawEvent.game_type || rawEvent.game_id || 'catch-brand',
      }
    : (rawEvent.game_id
      ? {
          id: rawEvent.game_id,
          name: rawEvent.name || 'Game',
          game_type: rawEvent.game_type || rawEvent.game_id || 'catch-brand',
        }
      : null);

  const themeBranding = safeTheme?.branding || {};
  const eventBranding = rawEvent?.branding || {};

  const branding = {
    organization_name: rawEvent?.organization_name || eventBranding?.organization_name || 'Studio',
    logo_url: eventBranding?.logo_url || eventBranding?.logoUrl || themeBranding?.clientLogoUrl || themeBranding?.logoUrl || null,
    client_logo_url: eventBranding?.client_logo_url || eventBranding?.clientLogoUrl || themeBranding?.clientLogoUrl || null,
    game_title: eventBranding?.game_title || eventBranding?.gameTitle || themeBranding?.gameTitle || rawEvent?.name || '',
    subtitle: eventBranding?.subtitle || themeBranding?.subtitle || null,
    primary_color: eventBranding?.primary_color || themeBranding?.primaryColor || safeTheme?.visuals_config?.accentColor || '#f59e0b',
    accent_color: eventBranding?.accent_color || themeBranding?.accentColor || safeTheme?.visuals_config?.accentColor || '#10b981',
    hud_color: eventBranding?.hud_color || themeBranding?.hudColor || '#c8e038',
  };

  return {
    id: rawEvent.id,
    name: rawEvent.name,
    public_token: rawEvent.public_token || '',
    game: gameDTO,
    theme: safeTheme,
    game_theme: safeTheme,
    branding,
    start_date: startDate || '',
    end_date: endDate || '',
    live_open_date: liveOpenDate || '',
    event_timezone: rawEvent.event_timezone || rawEvent.timezone || PLATFORM_BUSINESS_TIMEZONE,
  };
}

/**
 * Authoritatively resolves the game type ('memory-match' | 'catch-brand' | string) for an event.
 * Inspects event.game.game_type, event.game.slug, event.game_id, event.game_theme, and fallback metadata.
 * Does NOT rely on untrusted client metadata.
 */
export async function resolveEventGameType(
  event: any,
  env?: Record<string, any>
): Promise<'memory-match' | 'catch-brand' | 'reaction-tap' | string> {
  if (!event) return 'catch-brand';

  // 1. Direct game object on event
  if (event.game) {
    if (event.game.game_type) {
      const gt = String(event.game.game_type).toLowerCase().trim();
      if (gt === 'reaction-tap' || gt === 'reaction-time') return 'reaction-tap';
      if (gt === 'memory-match' || gt === 'catch-brand') return gt;
    }
    if (event.game.slug) {
      const slug = String(event.game.slug).toLowerCase().trim();
      if (slug === 'reaction-tap' || slug === 'reaction-time') return 'reaction-tap';
      if (slug === 'memory-match') return 'memory-match';
      if (slug === 'catch-brand') return 'catch-brand';
    }
  }

  // 2. Direct event.game_id
  if (event.game_id) {
    const gid = String(event.game_id).toLowerCase().trim();
    if (gid === 'reaction-tap' || gid === 'reaction-time') return 'reaction-tap';
    if (gid === 'memory-match') return 'memory-match';
    if (gid === 'catch-brand') return 'catch-brand';

    try {
      const gameRecord = await getGameById(event.game_id, env);
      if (gameRecord) {
        const gt = (gameRecord.game_type || gameRecord.slug || '').toLowerCase().trim();
        if (gt === 'reaction-tap' || gt === 'reaction-time') return 'reaction-tap';
        if (gt === 'memory-match') return 'memory-match';
        if (gt === 'catch-brand') return 'catch-brand';
      }
    } catch {
      // Ignore lookup failure, continue
    }
  }

  // 3. Check event theme
  const theme = event.game_theme || (event.game_theme_id ? await getThemeById(event.game_theme_id, env).catch(() => null) : null);
  if (theme) {
    if (theme.game_type) {
      const tgt = String(theme.game_type).toLowerCase().trim();
      if (tgt === 'reaction-tap' || tgt === 'reaction-time') return 'reaction-tap';
      if (tgt === 'memory-match') return 'memory-match';
      if (tgt === 'catch-brand') return 'catch-brand';
    }
    if (theme.game_slug) {
      const tgs = String(theme.game_slug).toLowerCase().trim();
      if (tgs === 'reaction-tap' || tgs === 'reaction-time') return 'reaction-tap';
      if (tgs === 'memory-match') return 'memory-match';
      if (tgs === 'catch-brand') return 'catch-brand';
    }
    if (theme.base_theme_id) {
      const bti = String(theme.base_theme_id).toLowerCase().trim();
      if (bti === 'reaction-tap' || bti === 'reaction-time') return 'reaction-tap';
      if (bti === 'memory-match' || bti === 'memory-carnival') return 'memory-match';
      if (bti === 'catch-brand' || bti === 'carnival') return 'catch-brand';
    }
    if (theme.id) {
      const tid = String(theme.id).toLowerCase().trim();
      if (tid === 'reaction-tap' || tid === 'reaction-time') return 'reaction-tap';
      if (tid === 'memory-match' || tid === 'memory-carnival') return 'memory-match';
      if (tid === 'catch-brand' || tid === 'carnival') return 'catch-brand';
    }
    if (theme.slug) {
      const tslug = String(theme.slug).toLowerCase().trim();
      if (tslug.includes('reaction') || tslug.includes('reflex')) return 'reaction-tap';
      if (tslug === 'memory-match' || tslug === 'memory-carnival' || tslug.includes('memory')) return 'memory-match';
    }
    if (theme.game_id) {
      try {
        const themeGame = await getGameById(theme.game_id, env);
        if (themeGame) {
          const tgt = (themeGame.game_type || themeGame.slug || '').toLowerCase().trim();
          if (tgt === 'reaction-tap' || tgt === 'reaction-time') return 'reaction-tap';
          if (tgt === 'memory-match') return 'memory-match';
          if (tgt === 'catch-brand') return 'catch-brand';
        }
      } catch {
        // Ignore lookup failure
      }
    }
  }

  // 4. String checks on event.game_theme_id
  if (event.game_theme_id) {
    const gtid = String(event.game_theme_id).toLowerCase().trim();
    if (gtid === 'reaction-tap' || gtid === 'reaction-time' || gtid.includes('reaction')) {
      return 'reaction-tap';
    }
    if (gtid === 'memory-match' || gtid === 'memory-carnival' || gtid.includes('memory')) {
      return 'memory-match';
    }
  }

  // 5. Fallback check on event name or slug
  const eventName = (event.name || event.slug || '').toLowerCase();
  if (eventName.includes('reaction') || eventName.includes('reflex')) {
    return 'reaction-tap';
  }
  if (eventName.includes('memory-match') || eventName.includes('memory match') || eventName.includes('brand memory match')) {
    return 'memory-match';
  }

  return 'catch-brand';
}

/**
 * Resolves the server-authoritative Memory Match configuration for an event.
 * Follows the strict resolution hierarchy:
 * submitted event
 *       ↓
 * authoritative event/theme/game configuration
 *       ↓
 * Memory Match configuration
 *       ↓
 * authoritative totalPairs
 *
 * Enforces:
 * 1. Resolves actual event and theme from authoritative database/store.
 * 2. Theme must belong to Memory Match (cannot fall back to another game's configuration e.g. catch-brand).
 * 3. Never trusts client-provided metadata.totalPairs.
 */
export async function resolveAuthoritativeMemoryMatchConfig(
  event: any,
  env?: Record<string, any>
): Promise<{
  authoritativeTotalPairs: number;
  theme: any | null;
  gameConfig: any | null;
  gameType: string;
}> {
  if (!event) {
    const err: any = new Error('Event not found');
    err.status = 404;
    err.code = 'EVENT_NOT_FOUND';
    throw err;
  }

  // 1. Resolve event game type
  const gameType = await resolveEventGameType(event, env);
  if (gameType !== 'memory-match') {
    const err: any = new Error(
      `Event game type mismatch: Expected 'memory-match' but event is '${gameType}'. Cross-game configuration fallback is forbidden.`
    );
    err.status = 422;
    err.code = 'INVALID_GAME_TYPE';
    throw err;
  }

  // 2. Resolve theme
  let themeRecord: any = event.game_theme || event.theme || null;
  const themeId = event.game_theme_id || event.theme_id || (themeRecord && themeRecord.id);
  if (!themeRecord && themeId) {
    try {
      themeRecord = await getThemeById(themeId, env);
    } catch {
      themeRecord = null;
    }
  }

  // 3. Cross-game theme verification (cannot fall back to another game's configuration)
  if (themeRecord) {
    const themeGameType = (themeRecord.game_type || themeRecord.game_slug || '').toLowerCase().trim();
    if (themeGameType && themeGameType !== 'memory-match') {
      const err: any = new Error(
        `Theme game mismatch: Event requires Memory Match, but theme is configured for '${themeGameType}'. Cross-game configuration fallback is forbidden.`
      );
      err.status = 422;
      err.code = 'THEME_GAME_MISMATCH';
      throw err;
    }

    if (
      themeRecord.base_theme_id === 'carnival' ||
      themeRecord.id === 'carnival' ||
      themeRecord.base_theme_id === 'catch-brand' ||
      themeRecord.id === 'catch-brand'
    ) {
      const err: any = new Error(
        `Theme game mismatch: Theme '${themeRecord.id}' belongs to catch-brand. Cross-game configuration fallback is forbidden.`
      );
      err.status = 422;
      err.code = 'THEME_GAME_MISMATCH';
      throw err;
    }
  }

  // 4. Resolve Memory Match configuration (event custom override first, then theme game_config)
  let rawConfig = event.game_config || themeRecord?.game_config || null;
  if (typeof rawConfig === 'string') {
    try {
      rawConfig = JSON.parse(rawConfig);
    } catch {
      rawConfig = null;
    }
  }

  let authoritativeTotalPairs = 8; // Default 4x4 layout = 8 pairs

  if (rawConfig && typeof rawConfig === 'object') {
    // Priority A: Explicit totalPairs / total_pairs
    if (typeof rawConfig.totalPairs === 'number' && rawConfig.totalPairs > 0) {
      authoritativeTotalPairs = Math.floor(rawConfig.totalPairs);
    } else if (typeof rawConfig.total_pairs === 'number' && rawConfig.total_pairs > 0) {
      authoritativeTotalPairs = Math.floor(rawConfig.total_pairs);
    } else if (typeof rawConfig.board?.totalPairs === 'number' && rawConfig.board.totalPairs > 0) {
      authoritativeTotalPairs = Math.floor(rawConfig.board.totalPairs);
    } else if (typeof rawConfig.gameplay?.totalPairs === 'number' && rawConfig.gameplay.totalPairs > 0) {
      authoritativeTotalPairs = Math.floor(rawConfig.gameplay.totalPairs);
    } else {
      // Priority B: Board/Grid rows and cols
      const rows = Number(rawConfig.board?.rows) || Number(rawConfig.grid?.rows);
      const cols = Number(rawConfig.board?.cols) || Number(rawConfig.grid?.cols);
      if (rows > 0 && cols > 0) {
        const totalCards = (rows * cols) % 2 === 0 ? rows * cols : rows * cols - 1;
        const calculatedPairs = Math.floor(totalCards / 2);
        if (calculatedPairs > 0) {
          authoritativeTotalPairs = calculatedPairs;
        }
      } else if (Array.isArray(rawConfig.pairs) && rawConfig.pairs.length > 0) {
        // Priority C: Pairs array length
        authoritativeTotalPairs = rawConfig.pairs.length;
      }
    }
  } else if (themeRecord && Array.isArray(themeRecord.items_config) && themeRecord.items_config.length > 0) {
    // Legacy fallback ONLY if theme is verified Memory Match
    const themeGameType = (themeRecord.game_type || themeRecord.game_slug || '').toLowerCase().trim();
    if (themeGameType === 'memory-match' || (!themeGameType && !themeRecord.basket_config)) {
      authoritativeTotalPairs = Math.min(themeRecord.items_config.length, 8);
    }
  }

  return {
    authoritativeTotalPairs,
    theme: themeRecord,
    gameConfig: rawConfig,
    gameType: 'memory-match',
  };
}

export interface AuthoritativeCatchBrandConfig extends CatchBrandPhysicsSanityConfig {
  theme: any | null;
  gameConfig: any | null;
  gameType: string;
}

/**
 * Authoritatively resolves Catch The Brand configuration from the event and theme records.
 * Calculates physical gameplay limits, minimum spawn intervals, and score sanity ceiling.
 */
export async function resolveAuthoritativeCatchBrandConfig(
  event: any,
  env?: Record<string, any>
): Promise<AuthoritativeCatchBrandConfig> {
  if (!event) {
    const err: any = new Error('Event not found');
    err.status = 404;
    err.code = 'EVENT_NOT_FOUND';
    throw err;
  }

  // 1. Resolve event game type
  const gameType = await resolveEventGameType(event, env);
  if (gameType !== 'catch-brand') {
    const err: any = new Error(
      `Event game type mismatch: Expected 'catch-brand' but event is '${gameType}'. Cross-game configuration fallback is forbidden.`
    );
    err.status = 422;
    err.code = 'INVALID_GAME_TYPE';
    throw err;
  }

  // 2. Resolve theme
  let themeRecord: any = event.game_theme || event.theme || null;
  const themeId = event.game_theme_id || event.theme_id || (themeRecord && themeRecord.id);
  if (!themeRecord && themeId) {
    try {
      themeRecord = await getThemeById(themeId, env);
    } catch {
      themeRecord = null;
    }
  }

  // 3. Cross-game theme verification (cannot use memory-match theme for catch-brand)
  if (themeRecord) {
    const themeGameType = (themeRecord.game_type || themeRecord.game_slug || '').toLowerCase().trim();
    if (themeGameType === 'memory-match') {
      const err: any = new Error(
        `Theme game mismatch: Event requires Catch The Brand, but theme is configured for '${themeGameType}'. Cross-game configuration fallback is forbidden.`
      );
      err.status = 422;
      err.code = 'THEME_GAME_MISMATCH';
      throw err;
    }
  }

  // 4. Resolve raw custom game config if present
  let rawConfig = event.game_config || null;
  if (typeof rawConfig === 'string') {
    try {
      rawConfig = JSON.parse(rawConfig);
    } catch {
      rawConfig = null;
    }
  }

  // Fallback defaults from DEFAULT_CARNIVAL_THEME
  const defaultPhysics = DEFAULT_CARNIVAL_THEME.physics_config;
  const defaultItems = DEFAULT_CARNIVAL_THEME.items_config;

  // 5. Authoritative duration (seconds)
  let gameDurationSeconds = 20;
  if (typeof rawConfig?.gameDurationSeconds === 'number' && rawConfig.gameDurationSeconds > 0) {
    gameDurationSeconds = rawConfig.gameDurationSeconds;
  } else if (typeof rawConfig?.physics_config?.gameDurationSeconds === 'number' && rawConfig.physics_config.gameDurationSeconds > 0) {
    gameDurationSeconds = rawConfig.physics_config.gameDurationSeconds;
  } else if (typeof themeRecord?.physics_config?.gameDurationSeconds === 'number' && themeRecord.physics_config.gameDurationSeconds > 0) {
    gameDurationSeconds = themeRecord.physics_config.gameDurationSeconds;
  } else {
    gameDurationSeconds = defaultPhysics?.gameDurationSeconds || 20;
  }

  // 6. Authoritative items
  const rawItems = Array.isArray(rawConfig?.items_config) && rawConfig.items_config.length > 0
    ? rawConfig.items_config
    : Array.isArray(themeRecord?.items_config) && themeRecord.items_config.length > 0
      ? themeRecord.items_config
      : defaultItems || [];

  // 7. Determine minimum spawn interval (ms)
  const stages: any[] = Array.isArray(rawConfig?.physics_config?.difficultyStages) && rawConfig.physics_config.difficultyStages.length > 0
    ? rawConfig.physics_config.difficultyStages
    : Array.isArray(themeRecord?.physics_config?.difficultyStages) && themeRecord.physics_config.difficultyStages.length > 0
      ? themeRecord.physics_config.difficultyStages
      : defaultPhysics?.difficultyStages || [];

  let minSpawnIntervalMs = 550; // default fastest stage
  if (stages.length > 0) {
    const validIntervals = stages
      .map((s: any) => Number(s.spawnInterval))
      .filter((n: number) => !isNaN(n) && n > 0);
    if (validIntervals.length > 0) {
      minSpawnIntervalMs = Math.min(...validIntervals);
    }
  }

  const sanityLimits = calculateCatchBrandSanityLimits(
    gameDurationSeconds,
    minSpawnIntervalMs,
    rawItems as any
  );

  return {
    ...sanityLimits,
    theme: themeRecord,
    gameConfig: rawConfig,
    gameType: 'catch-brand',
  };
}

/**
 * Create a new Event record in the database.
 * Verifies that the referenced Game exists and is active.
 * Verifies that the referenced Game Theme belongs to the chosen Game and Organization.
 * Enforces the hard limit of MAXIMUM 2 PENDING_PAYMENT events per organization.
 */
export async function createEvent(
  params: {
    organization_id: string;
    game_id?: string | null;
    game_theme_id: string;
    name: string;
    event_date?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    starts_at?: string;
    expires_at?: string;
    status?: EventStatus;
    event_status?: EventLifecycleStatus;
    payment_status?: PaymentLifecycleStatus | 'PENDING_PAYMENT';
    cancel_reason?: EventCancelReason | null;
    payment_mode?: PaymentMode;
    paid_amount?: number;
    discount_amount?: number;
    event_price?: number;
    event_currency?: string;
    custom_price_override?: boolean;
    created_by?: string | null;
    skipPendingLimitCheck?: boolean;
    currentDate?: string | Date | null;
    event_timezone?: string | null;
  },
  env?: Record<string, any>
): Promise<EventRecord> {
  return withOrganizationLock(params.organization_id, async () => {
    const supabase = getSupabaseServerClient(env);

    // Mandatory Theme Setup Check: Organization must have a valid saved theme before creating events
    const themeReadiness = await checkOrganizationThemeReadiness(params.organization_id, env);
    if (!themeReadiness.hasValidTheme) {
      const err: any = new Error('Theme setup is required before creating an event. Please customize and save your organization theme first.');
      err.status = 422;
      err.code = 'THEME_SETUP_REQUIRED';
      err.theme_setup_required = true;
      throw err;
    }

  // 1. Verify organization isolation & system theme restriction: The theme must exist, belong to this organization, and not be a system theme!
  const theme = await getThemeById(params.game_theme_id, env);
  if (!theme) {
    const err: any = new Error('Selected Game Theme not found');
    err.status = 404;
    err.code = 'THEME_NOT_FOUND';
    throw err;
  }

  // System themes are read-only templates and cannot be used directly for events
  if (theme.is_system || theme.ownership_type === 'system') {
    const err: any = new Error('Only organization themes can be used for events.');
    err.status = 403;
    err.code = 'SYSTEM_THEME_NOT_ALLOWED';
    throw err;
  }

  // Theme must belong to the active organization
  if (theme.organization_id !== params.organization_id) {
    const err: any = new Error('Only organization themes can be used for events.');
    err.status = 403;
    err.code = 'THEME_FORBIDDEN';
    throw err;
  }

  // Theme must be active and cannot be an uncompleted onboarding draft
  if ((theme.status && theme.status !== 'active') || theme.game_config?.is_onboarding_draft === true) {
    const err: any = new Error('Theme setup is required before creating an event. Please customize and save your organization theme first.');
    err.status = 422;
    err.code = 'THEME_SETUP_REQUIRED';
    err.theme_setup_required = true;
    throw err;
  }

  // 2. Validate Game Existence & Active Status
  const targetGameId = params.game_id || theme.game_id;
  if (!targetGameId) {
    const err: any = new Error('No valid Game specified for this event.');
    err.status = 422;
    throw err;
  }

  // Verify theme belongs to chosen game
  if (params.game_id && theme.game_id && params.game_id !== theme.game_id) {
    const err: any = new Error('Selected theme does not belong to the chosen game.');
    err.code = 'THEME_GAME_MISMATCH';
    err.status = 422;
    throw err;
  }

  const game = await getGameById(targetGameId, env);
  if (!game) {
    const err: any = new Error('The selected game was not found.');
    err.code = 'GAME_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  // Validate active status for new event creation
  if (game.status === 'inactive') {
    const err: any = new Error('This game is currently inactive and cannot be selected for new events.');
    err.code = 'GAME_INACTIVE';
    err.status = 422;
    throw err;
  }

  if (game.organization_id && game.organization_id !== params.organization_id && !game.is_system) {
    const err: any = new Error('Security Error: Game does not belong to your organization');
    err.status = 403;
    throw err;
  }

  // Resolve authoritative event timezone: explicit parameter -> organization country default -> business default (Asia/Singapore)
  const org = await getOrganizationById(params.organization_id, env);
  const resolvedTimezone = resolveEventTimezone(params.event_timezone, org);

  // 3. Normalize calendar date boundaries (Start Date to End Date) in the event's timezone
  const norm = normalizeEventDateBoundaries(
    {
      start_date: params.start_date || params.startDate,
      end_date: params.end_date || params.endDate,
      event_date: params.event_date,
      starts_at: params.starts_at,
      expires_at: params.expires_at,
      event_timezone: resolvedTimezone,
    },
    { forCreation: true, currentDate: params.currentDate, event_timezone: resolvedTimezone }
  );

  // 4. Evaluate whether this event counts against the pending payment limit
  const effectivePaymentStatus = ((params.payment_status as string) || 'UNPAID').toUpperCase();
  const isPending = effectivePaymentStatus === 'PENDING_PAYMENT' ||
    effectivePaymentStatus === 'UNPAID' ||
    params.status === 'pending_payment';

  // 5. Resolve server-authoritative event pricing based on calendar duration
  let price = params.event_price;
  let currency = params.event_currency || 'MYR';
  if (params.custom_price_override && typeof price === 'number' && price > 0) {
    // Explicit custom price override (e.g. Developer Admin override)
  } else {
    const durationPricing = await calculateEventAuthoritativePrice({
      startDate: norm.startDate,
      endDate: norm.endDate,
    }, env);
    price = durationPricing.price;
    currency = durationPricing.currency;
  }

  // 6. Generate collision-resistant unique token
  let token = generatePublicToken();
  let attempts = 0;
  while (attempts < 5) {
    const { data: existing } = await supabase
      .from('events')
      .select('id')
      .eq('public_token', token)
      .maybeSingle();

    if (!existing) break;
    token = generatePublicToken();
    attempts++;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const initialEventStatus: EventLifecycleStatus = params.event_status || 'DRAFT';
  const initialPaymentStatus: PaymentLifecycleStatus = (params.payment_status as PaymentLifecycleStatus) || 'UNPAID';
  const initialStatus: EventStatus = params.status || (initialEventStatus === 'DRAFT' ? 'draft' : 'pending_payment');
  const safePaidAmount = params.paid_amount !== undefined ? params.paid_amount : (initialPaymentStatus === 'PAID' ? price : 0);

  // 7. ATOMIC DISTRIBUTED CREATION VIA RPC:
  // Calls create_event_atomic with exclusive row-level locking on the organization (SELECT ... FOR UPDATE).
  // This completely eliminates race conditions across distributed Cloudflare Worker instances.
  const rpcParams = {
    p_organization_id: params.organization_id,
    p_game_theme_id: params.game_theme_id,
    p_name: params.name.trim(),
    p_start_date: norm.start_date,
    p_end_date: norm.end_date,
    p_starts_at: norm.starts_at,
    p_expires_at: norm.expires_at,
    p_game_id: targetGameId,
    p_event_date: norm.event_date,
    p_status: initialStatus,
    p_event_status: initialEventStatus,
    p_payment_status: initialPaymentStatus,
    p_cancel_reason: params.cancel_reason || null,
    p_event_price: price,
    p_event_currency: currency,
    p_paid_amount: safePaidAmount,
    p_discount_amount: params.discount_amount || 0,
    p_payment_mode: params.payment_mode || (initialPaymentStatus === 'PAID' ? 'FULL_PAID' : null),
    p_public_token: token,
    p_created_by: params.created_by || null,
    p_event_id: id,
    p_max_pending_events: 2,
    p_skip_pending_limit_check: Boolean(params.skipPendingLimitCheck),
    p_event_timezone: resolvedTimezone,
  };

  let rpcAttempted = false;
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_event_atomic', rpcParams);
    rpcAttempted = true;

    if (!rpcError && rpcData) {
      if (rpcData.success === false) {
        if (
          rpcData.code === 'PENDING_EVENT_LIMIT_REACHED' ||
          String(rpcData.error || '').includes('PENDING_EVENT_LIMIT_REACHED') ||
          String(rpcData.message || '').includes('Maximum 2 pending payment events reached') ||
          String(rpcData.error || '').includes('23514')
        ) {
          const err: any = new Error(rpcData.message || 'Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.');
          err.code = 'PENDING_EVENT_LIMIT_REACHED';
          err.status = 422;
          err.stage = 'rpc_create_event_atomic';
          err.rpcName = 'create_event_atomic';
          err.operation = 'create_event';
          err.fallbackAttempted = false;
          err.eventCreated = false;
          throw err;
        }

        const isOperational =
          rpcData.code === 'ORGANIZATION_NOT_FOUND' ||
          rpcData.code === 'THEME_NOT_FOUND' ||
          rpcData.code === 'THEME_FORBIDDEN' ||
          rpcData.code === 'SYSTEM_THEME_NOT_ALLOWED' ||
          rpcData.code === 'THEME_INACTIVE' ||
          rpcData.code === 'GAME_INACTIVE' ||
          rpcData.code === 'GAME_NOT_FOUND' ||
          rpcData.code === 'THEME_GAME_MISMATCH' ||
          rpcData.code === 'VALIDATION_ERROR';

        const err: any = new Error(rpcData.error || rpcData.message || 'Failed to create event');
        err.code = rpcData.code || 'EVENT_CREATION_FAILED';
        err.status = isOperational
          ? (rpcData.code === 'ORGANIZATION_NOT_FOUND' || rpcData.code === 'THEME_NOT_FOUND' || rpcData.code === 'GAME_NOT_FOUND' ? 404 :
             rpcData.code === 'THEME_FORBIDDEN' ? 403 : 422)
          : 500;
        err.stage = 'rpc_create_event_atomic';
        err.rpcName = 'create_event_atomic';
        err.operation = 'create_event';
        err.fallbackAttempted = false;
        err.eventCreated = false;
        err.postgresCode = rpcData.code || null;
        err.details = rpcData.error || null;
        throw err;
      }

      if (rpcData.success === true && rpcData.event) {
        const fullRecord: EventRecord = {
          ...(rpcData.event as any),
          game_id: targetGameId,
          status: initialStatus,
          event_status: initialEventStatus,
          payment_status: initialPaymentStatus,
          cancel_reason: params.cancel_reason || null,
          payment_mode: params.payment_mode || (initialPaymentStatus === 'PAID' ? 'FULL_PAID' : undefined),
          paid_amount: safePaidAmount,
          discount_amount: params.discount_amount || 0,
          event_price: price,
          event_currency: currency,
          event_timezone: (rpcData.event as any)?.event_timezone || resolvedTimezone,
        };
        localEventsCache.set(fullRecord.id, fullRecord);

        // Dispatch central EVENT_CREATED notification upon verified RPC creation success
        await dispatchNotificationEvent(
          {
            eventType: 'EVENT_CREATED',
            organizationId: fullRecord.organization_id,
            recipientUserId: params.created_by || undefined,
            eventId: fullRecord.id,
            eventName: fullRecord.name,
            startDate: fullRecord.start_date || fullRecord.event_date || '',
            endDate: fullRecord.end_date || fullRecord.event_date || '',
          },
          env
        ).catch((err) => {
          console.error('[NOTIFICATION] EVENT_CREATED notification dispatch failed on RPC success:', {
            error: err?.message || err,
            eventId: fullRecord.id,
            organizationId: fullRecord.organization_id,
          });
        });

        if (fullRecord.payment_status === 'PAID' && fullRecord.event_status === 'LIVE') {
          await dispatchNotificationEvent(
            {
              eventType: 'EVENT_LIVE',
              organizationId: fullRecord.organization_id,
              recipientUserId: params.created_by || undefined,
              eventId: fullRecord.id,
              eventName: fullRecord.name,
              publicUrl: `/play/${fullRecord.public_token}`,
            },
            env
          ).catch((err) => {
            console.error('[NOTIFICATION] EVENT_LIVE notification dispatch failed on RPC success:', {
              error: err?.message || err,
              eventId: fullRecord.id,
              organizationId: fullRecord.organization_id,
            });
          });
        }

        return fullRecord;
      }
    }

    if (rpcError) {
      console.warn('[createEvent] RPC create_event_atomic error:', rpcError);
      if (
        rpcError.message?.includes('PENDING_EVENT_LIMIT_REACHED') ||
        rpcError.code === '23514' ||
        rpcError.details?.includes('PENDING_EVENT_LIMIT_REACHED') ||
        rpcError.message?.includes('pending payment events reached')
      ) {
        const err: any = new Error('Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.');
        err.code = 'PENDING_EVENT_LIMIT_REACHED';
        err.status = 422;
        err.stage = 'rpc_create_event_atomic';
        err.rpcName = 'create_event_atomic';
        err.operation = 'create_event';
        err.fallbackAttempted = false;
        err.eventCreated = false;
        throw err;
      }

      if (!isLocalFallbackAllowed(env) && isSupabaseConfigured(env)) {
        const err: any = new Error(`Event creation failed during atomic RPC: ${rpcError.message || 'Unknown database error'}`);
        err.code = rpcError.code || 'RPC_EXECUTION_FAILED';
        err.status = 500;
        err.stage = 'rpc_create_event_atomic';
        err.rpcName = 'create_event_atomic';
        err.operation = 'create_event';
        err.fallbackAttempted = false;
        err.eventCreated = false;
        err.postgresCode = rpcError.code || null;
        err.details = rpcError.details || null;
        throw err;
      }
      // If RPC is missing in local/mock environment, fall through to local fallback
    }
  } catch (err: any) {
    if (
      (err?.status && err.status >= 400 && err.status < 500) ||
      err?.code === 'PENDING_EVENT_LIMIT_REACHED' ||
      err?.code === 'ORGANIZATION_NOT_FOUND' ||
      err?.code === 'THEME_NOT_FOUND' ||
      err?.code === 'THEME_FORBIDDEN' ||
      err?.code === 'SYSTEM_THEME_NOT_ALLOWED' ||
      err?.code === 'GAME_INACTIVE' ||
      err?.code === 'GAME_NOT_FOUND' ||
      err?.code === 'THEME_GAME_MISMATCH' ||
      err?.code === 'VALIDATION_ERROR' ||
      (!isLocalFallbackAllowed(env) && isSupabaseConfigured(env))
    ) {
      throw err;
    }
    // Fallback if network or unmocked RPC
  }

  // 8. Fallback Path: In-process limit check + direct insert (for mock/unit test environments without live RPC)
  if (isPending && !params.skipPendingLimitCheck) {
    const pendingCount = await getPendingEventsCountByOrgId(params.organization_id, env);
    if (pendingCount >= 2) {
      const err: any = new Error('Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.');
      err.code = 'PENDING_EVENT_LIMIT_REACHED';
      err.status = 422;
      throw err;
    }
  }

  const dbPayload: any = {
    id,
    organization_id: params.organization_id,
    game_id: targetGameId,
    game_theme_id: params.game_theme_id,
    name: params.name.trim(),
    event_date: norm.event_date,
    start_date: norm.start_date,
    end_date: norm.end_date,
    starts_at: norm.starts_at,
    expires_at: norm.expires_at,
    status: initialStatus,
    event_status: initialEventStatus,
    payment_status: initialPaymentStatus,
    cancel_reason: params.cancel_reason || null,
    event_price: price,
    event_currency: currency,
    event_timezone: resolvedTimezone,
    public_token: token,
    created_by: params.created_by || null,
    created_at: now,
    updated_at: now,
  };

  let { data, error } = await supabase
    .from('events')
    .insert(dbPayload)
    .select()
    .single();

  if (error) {
    // Check if error is pending event limit reached (from DB trigger or check constraint)
    if (
      error.code === '23514' ||
      error.message?.includes('PENDING_EVENT_LIMIT_REACHED') ||
      error.message?.includes('pending payment events reached')
    ) {
      const err: any = new Error('Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.');
      err.code = 'PENDING_EVENT_LIMIT_REACHED';
      err.status = 422;
      throw err;
    }

    if (error.code === '23503') {
      const errorMsg = String(error.message || '').toLowerCase();
      if (errorMsg.includes('game_theme') || errorMsg.includes('game_themes')) {
        const err: any = new Error('Selected Game Theme not found');
        err.code = 'THEME_NOT_FOUND';
        err.status = 404;
        throw err;
      }
      if (errorMsg.includes('games') || errorMsg.includes('game_id')) {
        const err: any = new Error('The selected game was not found.');
        err.code = 'GAME_NOT_FOUND';
        err.status = 404;
        throw err;
      }
      if (errorMsg.includes('organization') || errorMsg.includes('organizations')) {
        const err: any = new Error('Organization not found');
        err.code = 'ORGANIZATION_NOT_FOUND';
        err.status = 404;
        throw err;
      }
    }

    // If schema cache lacks newly added columns (PGRST204) or undefined column (42703):
    if (
      error.code === 'PGRST204' ||
      error.code === '42703' ||
      error.message?.includes('schema cache') ||
      error.message?.includes('column')
    ) {
      // Create a compatible payload with core columns
      const compatiblePayload: any = {
        id,
        organization_id: params.organization_id,
        game_id: targetGameId,
        game_theme_id: params.game_theme_id,
        name: params.name.trim(),
        event_date: norm.event_date,
        starts_at: norm.starts_at,
        expires_at: norm.expires_at,
        status: (initialStatus === 'pending_payment' ? 'draft' : initialStatus) as any,
        public_token: token,
        created_by: params.created_by || null,
        created_at: now,
        updated_at: now,
      };

      const retry = await supabase
        .from('events')
        .insert(compatiblePayload)
        .select()
        .single();

      if (!retry.error) {
        data = retry.data;
        error = null;
      } else {
        error = retry.error;
        if (
          error.code === '23514' ||
          error.message?.includes('PENDING_EVENT_LIMIT_REACHED') ||
          error.message?.includes('pending payment events reached')
        ) {
          const err: any = new Error('Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.');
          err.code = 'PENDING_EVENT_LIMIT_REACHED';
          err.status = 422;
          throw err;
        }
      }
    }

    if (error) {
      if (
        error.message?.includes('Placeholder') ||
        error.code === 'PGRST000' ||
        error.code === 'PGRST204' ||
        error.message?.includes('schema cache')
      ) {
        const fullRecord: EventRecord = {
          ...dbPayload,
          event_status: initialEventStatus,
          payment_status: initialPaymentStatus,
          cancel_reason: params.cancel_reason || null,
          payment_mode: params.payment_mode || (initialPaymentStatus === 'PAID' ? 'FULL_PAID' : undefined),
          paid_amount: safePaidAmount,
          discount_amount: params.discount_amount || 0,
          event_price: price,
          event_currency: currency,
        };
        localEventsCache.set(dbPayload.id, fullRecord);

        await dispatchNotificationEvent(
          {
            eventType: 'EVENT_CREATED',
            organizationId: fullRecord.organization_id,
            recipientUserId: params.created_by || undefined,
            eventId: fullRecord.id,
            eventName: fullRecord.name,
            startDate: fullRecord.start_date || fullRecord.event_date || '',
            endDate: fullRecord.end_date || fullRecord.event_date || '',
          },
          env
        ).catch((err) => {
          console.error('[NOTIFICATION] EVENT_CREATED notification dispatch failed on local fallback:', {
            error: err?.message || err,
            eventId: fullRecord.id,
            organizationId: fullRecord.organization_id,
          });
        });

        if (fullRecord.payment_status === 'PAID' && fullRecord.event_status === 'LIVE') {
          await dispatchNotificationEvent(
            {
              eventType: 'EVENT_LIVE',
              organizationId: fullRecord.organization_id,
              recipientUserId: params.created_by || undefined,
              eventId: fullRecord.id,
              eventName: fullRecord.name,
              publicUrl: `/play/${fullRecord.public_token}`,
            },
            env
          ).catch((err) => {
            console.error('[NOTIFICATION] EVENT_LIVE notification dispatch failed on local fallback:', {
              error: err?.message || err,
              eventId: fullRecord.id,
              organizationId: fullRecord.organization_id,
            });
          });
        }

        return fullRecord;
      }
      console.error('Error in createEvent:', error);
      if (
        error.code === '23514' ||
        error.message?.includes('PENDING_EVENT_LIMIT_REACHED') ||
        error.message?.includes('pending payment events reached')
      ) {
        const err: any = new Error('Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.');
        err.code = 'PENDING_EVENT_LIMIT_REACHED';
        err.status = 422;
        err.stage = 'fallback_insert';
        err.rpcName = 'create_event_atomic';
        err.operation = 'create_event';
        err.fallbackAttempted = true;
        err.eventCreated = false;
        throw err;
      }
      const err: any = new Error(error.message || 'Failed to create event');
      err.code = error.code || 'EVENT_CREATION_FAILED';
      err.status = 500;
      err.stage = 'fallback_insert';
      err.rpcName = 'create_event_atomic';
      err.operation = 'create_event';
      err.fallbackAttempted = true;
      err.eventCreated = false;
      err.postgresCode = error.code || null;
      err.details = error.details || null;
      throw err;
    }
  }

  const fullRecord: EventRecord = {
    ...(data as any),
    game_id: targetGameId,
    status: initialStatus,
    event_status: initialEventStatus,
    payment_status: initialPaymentStatus,
    cancel_reason: params.cancel_reason || null,
    payment_mode: params.payment_mode || (initialPaymentStatus === 'PAID' ? 'FULL_PAID' : undefined),
    paid_amount: safePaidAmount,
    discount_amount: params.discount_amount || 0,
    event_price: price,
    event_currency: currency,
  };
  localEventsCache.set(fullRecord.id, fullRecord);

  await dispatchNotificationEvent(
    {
      eventType: 'EVENT_CREATED',
      organizationId: fullRecord.organization_id,
      recipientUserId: params.created_by || undefined,
      eventId: fullRecord.id,
      eventName: fullRecord.name,
      startDate: fullRecord.start_date || fullRecord.event_date || '',
      endDate: fullRecord.end_date || fullRecord.event_date || '',
    },
    env
  ).catch((err) => {
    console.error('[NOTIFICATION] EVENT_CREATED notification dispatch failed on direct insert:', {
      error: err?.message || err,
      eventId: fullRecord.id,
      organizationId: fullRecord.organization_id,
    });
  });

  if (fullRecord.payment_status === 'PAID' && fullRecord.event_status === 'LIVE') {
    await dispatchNotificationEvent(
      {
        eventType: 'EVENT_LIVE',
        organizationId: fullRecord.organization_id,
        recipientUserId: params.created_by || undefined,
        eventId: fullRecord.id,
        eventName: fullRecord.name,
        publicUrl: `/play/${fullRecord.public_token}`,
      },
      env
    ).catch((err) => {
      console.error('[NOTIFICATION] EVENT_LIVE notification dispatch failed on direct insert:', {
        error: err?.message || err,
        eventId: fullRecord.id,
        organizationId: fullRecord.organization_id,
      });
    });
  }

  return fullRecord;
  });
}

/**
 * Atomically create an Event and process wallet payment.
 */
export async function createEventWithAtomicPayment(
  params: {
    organization_id: string;
    game_id?: string | null;
    game_theme_id: string;
    name: string;
    event_date?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    starts_at: string;
    expires_at: string;
    status?: EventStatus;
    created_by?: string | null;
    payment_mode?: PaymentMode;
    topup_credit_requested?: number;
    event_price?: number;
    event_currency?: string;
    custom_price_override?: boolean;
    reference_id?: string;
    event_timezone?: string | null;
  },
  env?: Record<string, any>
): Promise<{
  event: EventWithDetails;
  payment: {
    success: boolean;
    paymentCalculation: EventPaymentCalculation;
    transactions: WalletTransactionRecord[];
    wallet: WalletBalanceSummary;
    quote: any;
  };
}> {
  return withOrganizationLock(params.organization_id, async () => {
    // Mandatory Theme Setup Check: Organization must have a valid saved theme before creating events
    const themeReadiness = await checkOrganizationThemeReadiness(params.organization_id, env);
    if (!themeReadiness.hasValidTheme) {
      const err: any = new Error('Theme setup is required before creating an event. Please customize and save your organization theme first.');
      err.status = 422;
      err.code = 'THEME_SETUP_REQUIRED';
      err.theme_setup_required = true;
      throw err;
    }

    const {
      organization_id,
      game_id,
      game_theme_id,
      name,
      event_date,
      starts_at,
      expires_at,
      status = 'scheduled',
      created_by,
      payment_mode = 'FULL_PAID',
      topup_credit_requested,
      reference_id,
    } = params;

    // Resolve server-authoritative event pricing based on duration
    let eventPrice = params.event_price;
    let eventCurrency = params.event_currency || 'MYR';
    if (params.custom_price_override && typeof eventPrice === 'number' && eventPrice > 0) {
      // Explicit custom price override
    } else {
      const durationPricing = await calculateEventAuthoritativePrice({
        start_date: params.start_date || params.startDate,
        end_date: params.end_date || params.endDate,
        event_date: params.event_date,
        starts_at: params.starts_at,
        expires_at: params.expires_at,
      }, env);
      eventPrice = durationPricing.price;
      eventCurrency = durationPricing.currency;
    }

    // 1. Validate Theme & Organization Isolation & System Theme Restriction
    const theme = await getThemeById(game_theme_id, env);
    if (!theme) {
      const err: any = new Error('Selected Game Theme not found');
      err.status = 404;
      err.code = 'THEME_NOT_FOUND';
      throw err;
    }

    if (theme.is_system || theme.ownership_type === 'system' || theme.organization_id !== organization_id) {
      const err: any = new Error('Only organization themes can be used for events.');
      err.status = 403;
      err.code = 'SYSTEM_THEME_NOT_ALLOWED';
      throw err;
    }

    if (theme.status && theme.status !== 'active') {
      const err: any = new Error('The selected theme is not active.');
      err.status = 422;
      err.code = 'THEME_INACTIVE';
      throw err;
    }

    // 2. Validate Game Existence & Active Status
    const targetGameId = game_id || theme.game_id;
    if (!targetGameId) {
      throw new Error('No game specified for this event');
    }

    if (game_id && theme.game_id && game_id !== theme.game_id) {
      const err: any = new Error('Selected theme does not belong to the chosen game.');
      err.code = 'THEME_GAME_MISMATCH';
      err.status = 422;
      throw err;
    }

    const game = await getGameById(targetGameId, env);
    if (!game) {
      const err: any = new Error('The selected game was not found.');
      err.code = 'GAME_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (game.status === 'inactive') {
      const err: any = new Error('This game is currently inactive and cannot be selected for new events.');
      err.code = 'GAME_INACTIVE';
      err.status = 422;
      throw err;
    }

    // 3. Validate calendar date boundaries
    const norm = normalizeEventDateBoundaries(
      {
        start_date: params.start_date || params.startDate,
        end_date: params.end_date || params.endDate,
        event_date: params.event_date,
        starts_at: params.starts_at,
        expires_at: params.expires_at,
        event_timezone: params.event_timezone,
      },
      { forCreation: true, event_timezone: params.event_timezone }
    );

    const startsAtTime = new Date(norm.starts_at).getTime();
    const expiresAtTime = new Date(norm.expires_at).getTime();

    if (isNaN(startsAtTime) || isNaN(expiresAtTime)) {
      throw new Error('Invalid start or expiry date/time');
    }

    if (expiresAtTime <= startsAtTime) {
      throw new Error('Expiry time must be later than start time');
    }

    // 4. Server-side payment calculation and validation (Authoritative Balance & Credit Check)
    const calculation = await calculateEventPayment(
      eventPrice,
      payment_mode,
      organization_id,
      { topupCreditRequested: topup_credit_requested },
      env
    );

    if (!calculation.isPayable) {
      if (calculation.reasons.some((r) => r.toLowerCase().includes('insufficient'))) {
        await dispatchNotificationEvent(
          {
            eventType: 'INSUFFICIENT_BALANCE',
            organizationId: organization_id,
            recipientUserId: created_by || null,
            currentBalance: calculation.availableBalances.paid_balance,
            requiredAmount: calculation.paidAmount,
            currency: eventCurrency,
            eventName: name.trim(),
            metadata: {
              reasons: calculation.reasons,
            },
          },
          env
        ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch INSUFFICIENT_BALANCE:', err));
      }

      await dispatchEventPaymentFailed(
        {
          organizationId: organization_id,
          recipientUserId: created_by || null,
          eventId: 'pending_creation',
          eventName: name.trim(),
          amount: eventPrice,
          currency: eventCurrency,
          reason: calculation.reasons.join('; ') || 'Insufficient balance for event creation',
        },
        env
      ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch EVENT_PAYMENT_FAILED:', err));

      const error: any = new Error('Insufficient balance. Please top up your wallet to continue.');
      error.code = 'INSUFFICIENT_BALANCE';
      error.status = 402;
      error.required = calculation.paidAmount;
      error.available = calculation.availableBalances.paid_balance;
      error.shortfall = Math.max(0, calculation.paidAmount - calculation.availableBalances.paid_balance);
      error.reasons = calculation.reasons;
      throw error;
    }

    // 5. Create the Event Record with UNPAID status before atomic payment transaction
    const createdEventRecord = await createEvent(
      {
        organization_id,
        game_id: targetGameId,
        game_theme_id,
        name,
        event_date,
        starts_at,
        expires_at,
        status: 'pending_payment',
        created_by,
        payment_status: 'UNPAID',
        payment_mode,
        paid_amount: calculation.paidAmount,
        discount_amount: calculation.totalDiscount,
        event_price: eventPrice,
        event_currency: eventCurrency,
        event_timezone: params.event_timezone,
        skipPendingLimitCheck: true,
      },
      env
    );

    // 6. Execute Atomic Ledger Payment
    try {
      const paymentResult = await processEventPayment(
        {
          organizationId: organization_id,
          eventId: createdEventRecord.id,
          eventName: name.trim(),
          paymentMode: payment_mode,
          eventPrice,
          topupCreditRequested: topup_credit_requested,
          referenceId: reference_id,
          createdBy: created_by || undefined,
          description: `Payment for Event "${name.trim()}" (${payment_mode.replace('_', ' ')})`,
        },
        env
      );

      // 7. Fetch fully enriched event
      const enrichedEvent = await getEventById(createdEventRecord.id, env);
      if (!enrichedEvent) {
        throw new Error('Failed to retrieve newly created event');
      }

      return {
        event: enrichedEvent,
        payment: paymentResult,
      };
    } catch (paymentError: any) {
      console.error('Fatal: Event payment failed after record insertion. Initiating automatic ACID rollback:', paymentError);
      await deleteEvent(createdEventRecord.id, env).catch((rollbackErr) => {
        console.error('CRITICAL: Failed to rollback event creation after payment error:', rollbackErr);
      });
      throw paymentError;
    }
  });
}


/**
 * Update an existing Event.
 * If game_theme_id is changed, validates that the new theme belongs to the event's organization.
 * Note: Keeps the original public_token intact!
 */
export async function updateEvent(
  eventId: string,
  updates: {
    name?: string;
    game_theme_id?: string;
    event_date?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    starts_at?: string;
    expires_at?: string;
    status?: EventStatus;
    event_status?: EventLifecycleStatus;
    payment_status?: PaymentLifecycleStatus | 'PENDING_PAYMENT';
    cancel_reason?: EventCancelReason | null;
    event_timezone?: string | null;
  },
  env?: Record<string, any>,
  options?: { isSystemLifecycle?: boolean }
): Promise<EventRecord> {
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  // 1. Fetch current event
  const existing = await getEventById(eventId, env);
  if (!existing) {
    throw new Error('Event not found');
  }

  // Security Rule: Paid event = admin/user cannot manually edit event setup.
  // System automatic lifecycle transitions must continue to work.
  const isPaid = (existing.payment_status || '').toUpperCase() === 'PAID';
  const hasSetupFieldUpdate =
    (updates.name !== undefined && updates.name.trim() !== existing.name) ||
    (updates.game_theme_id !== undefined && updates.game_theme_id !== existing.game_theme_id) ||
    (updates.start_date !== undefined && updates.start_date !== existing.start_date) ||
    (updates.end_date !== undefined && updates.end_date !== existing.end_date) ||
    (updates.startDate !== undefined && updates.startDate !== existing.start_date) ||
    (updates.endDate !== undefined && updates.endDate !== existing.end_date) ||
    (updates.event_date !== undefined && updates.event_date !== existing.event_date) ||
    (updates.starts_at !== undefined && updates.starts_at !== existing.starts_at) ||
    (updates.expires_at !== undefined && updates.expires_at !== existing.expires_at) ||
    (updates.status !== undefined && updates.status !== existing.status) ||
    (updates.event_status !== undefined && updates.event_status !== existing.event_status) ||
    (updates.event_timezone !== undefined && updates.event_timezone !== existing.event_timezone);

  if (isPaid && hasSetupFieldUpdate && !options?.isSystemLifecycle) {
    const err: any = new Error('Event setup cannot be modified after payment has been completed.');
    err.status = 403;
    err.code = 'EVENT_LOCKED_AFTER_PAYMENT';
    throw err;
  }

  const payload: any = {
    updated_at: now,
  };

  if (updates.name !== undefined) {
    payload.name = updates.name.trim();
  }

  if (updates.event_timezone !== undefined) {
    if (updates.event_timezone && !isValidTimezone(updates.event_timezone)) {
      const err: any = new Error(`Invalid timezone: ${updates.event_timezone}`);
      err.status = 422;
      err.code = 'INVALID_TIMEZONE';
      throw err;
    }
    payload.event_timezone = updates.event_timezone;
  }

  const targetTimezone = updates.event_timezone || existing.event_timezone || PLATFORM_BUSINESS_TIMEZONE;

  const hasDateUpdate =
    updates.start_date !== undefined ||
    updates.end_date !== undefined ||
    updates.startDate !== undefined ||
    updates.endDate !== undefined ||
    updates.event_date !== undefined ||
    updates.starts_at !== undefined ||
    updates.expires_at !== undefined ||
    (updates.event_timezone !== undefined && updates.event_timezone !== existing.event_timezone);

  if (hasDateUpdate) {
    const norm = normalizeEventDateBoundaries({
      start_date: updates.start_date || updates.startDate || existing.start_date || existing.event_date,
      end_date: updates.end_date || updates.endDate || existing.end_date || existing.event_date,
      event_date: updates.event_date || existing.event_date || existing.start_date,
      starts_at: updates.starts_at || existing.starts_at,
      expires_at: updates.expires_at || existing.expires_at,
      event_timezone: targetTimezone,
    }, {
      event_timezone: targetTimezone,
    });
    payload.event_date = norm.event_date;
    payload.start_date = norm.start_date;
    payload.end_date = norm.end_date;
    payload.starts_at = norm.starts_at;
    payload.expires_at = norm.expires_at;
    payload.setup_starts_at = norm.setup_starts_at;
  }

  if (updates.status !== undefined) {
    payload.status = updates.status;
  }

  if (updates.event_status !== undefined) {
    payload.event_status = updates.event_status;
  }

  if (updates.payment_status !== undefined) {
    payload.payment_status = updates.payment_status;
  }

  if (updates.cancel_reason !== undefined) {
    payload.cancel_reason = updates.cancel_reason;
  }

  // 2. If changing theme, verify organizational isolation, system theme restriction, and game compatibility
  if (updates.game_theme_id !== undefined && updates.game_theme_id !== existing.game_theme_id) {
    const newTheme = await getThemeById(updates.game_theme_id, env);
    if (!newTheme) {
      const err: any = new Error('New Game Theme not found');
      err.status = 404;
      err.code = 'THEME_NOT_FOUND';
      throw err;
    }
    if (newTheme.is_system || newTheme.ownership_type === 'system' || newTheme.organization_id !== existing.organization_id) {
      const err: any = new Error('Only organization themes can be used for events.');
      err.status = 403;
      err.code = 'SYSTEM_THEME_NOT_ALLOWED';
      throw err;
    }
    if (newTheme.status && newTheme.status !== 'active') {
      const err: any = new Error('The selected theme is not active.');
      err.status = 422;
      err.code = 'THEME_INACTIVE';
      throw err;
    }
    if (existing.game_id && newTheme.game_id && existing.game_id !== newTheme.game_id) {
      const err: any = new Error('Selected theme does not belong to the chosen game for this event.');
      err.code = 'THEME_GAME_MISMATCH';
      err.status = 422;
      throw err;
    }
    payload.game_theme_id = updates.game_theme_id;
  }

  // 3. Validate times if both are present or one changed
  const finalStarts = payload.starts_at || existing.starts_at;
  const finalExpires = payload.expires_at || existing.expires_at;
  if (new Date(finalExpires).getTime() <= new Date(finalStarts).getTime()) {
    throw new Error('Expiry time must be later than start time');
  }

  const { data, error } = await supabase
    .from('events')
    .update(payload)
    .eq('id', eventId)
    .select()
    .single();

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000') {
      const merged = { ...existing, ...payload };
      localEventsCache.set(eventId, merged);
      return merged as EventRecord;
    }
    console.error('Error in updateEvent:', error);
    throw new Error(`Failed to update event: ${error.message}`);
  }

  localEventsCache.set((data as EventRecord).id, data as EventRecord);
  return data as EventRecord;
}

/**
 * Cancel an event after verifying cancellation rules and executing any eligible refunds.
 */
export async function cancelEvent(
  eventId: string,
  options?: {
    cancelledBy?: string;
    reason?: string;
    cancelReason?: EventCancelReason;
    force?: boolean;
    skipRefund?: boolean;
    now?: Date;
  },
  env?: Record<string, any>
): Promise<EventRecord & { eligibility?: EventCancellationEligibility; refundResult?: any }> {
  const existing = await getEventById(eventId, env);
  if (!existing) {
    throw new Error('Event not found');
  }

  const now = options?.now || new Date();
  const eligibility = canCancelEvent(existing, now);

  if (!eligibility.canCancel && !options?.force) {
    const err: any = new Error(`Cancellation rejected: ${eligibility.reason}`);
    err.code = eligibility.code;
    err.eligibility = eligibility;
    throw err;
  }

  let refundResult: any = null;
  const refundInfo = determineEventRefund(existing, now);

  if (refundInfo.canRefund && !options?.skipRefund) {
    refundResult = await refundEventPayment(
      {
        organizationId: existing.organization_id,
        eventId: existing.id,
        eventName: existing.name,
        paidAmount: refundInfo.refundPaidAmount,
        discountAmount: refundInfo.creditReversalAmount,
        paymentMode: refundInfo.creditType || existing.payment_mode,
        reason: options?.reason || `Event cancellation: ${eligibility.reason}`,
        createdBy: options?.cancelledBy,
        now,
      },
      env
    );
  }

  const determinedReason: EventCancelReason =
    options?.cancelReason ||
    (options?.cancelledBy === 'admin'
      ? 'ADMIN_CANCELLED'
      : 'USER_CANCELLED');

  const updatePayload: any = {
    status: 'cancelled',
    event_status: 'CANCELLED',
    cancel_reason: determinedReason,
  };

  if (refundInfo.canRefund && !options?.skipRefund) {
    updatePayload.payment_status = 'REFUNDED';
  }

  const updated = await updateEvent(eventId, updatePayload, env, { isSystemLifecycle: true });

  return {
    ...updated,
    eligibility,
    refundResult,
  };
}

/**
 * Admin override: Reactivate a cancelled or draft event.
 */
export async function reactivateEvent(
  eventId: string,
  options?: { adminUserId?: string; reason?: string },
  env?: Record<string, any>
): Promise<EventWithDetails> {
  const existing = await getEventById(eventId, env);
  if (!existing) {
    throw new Error('Event not found');
  }

  const isPaid = existing.payment_status === 'PAID';
  const targetEventStatus: EventLifecycleStatus = isPaid ? 'LIVE' : 'PAYMENT_PENDING';
  const targetStatus: EventStatus = isPaid ? 'scheduled' : 'pending_payment';

  const updatePayload: any = {
    event_status: targetEventStatus,
    status: targetStatus,
    cancel_reason: null,
    updated_at: new Date().toISOString(),
  };

  const supabase = getSupabaseServerClient(env);
  const { error: reopenErr } = await supabase.from('events').update(updatePayload).eq('id', eventId);
  if (reopenErr) {
    if (!isLocalFallbackAllowed(env) || (!reopenErr.message?.includes('Placeholder') && reopenErr.code !== 'PGRST000')) {
      console.error(`Failed to reopen event ${eventId}:`, reopenErr);
      throw new Error(`Failed to reopen event: ${reopenErr.message}`);
    }
  }

  const cached = localEventsCache.get(eventId);
  if (cached) {
    cached.event_status = targetEventStatus;
    cached.status = targetStatus;
    cached.cancel_reason = null;
    cached.updated_at = updatePayload.updated_at;
    localEventsCache.set(eventId, cached);
  }

  await recordWalletAuditEvent(
    {
      organizationId: existing.organization_id,
      eventType: 'ADMIN_ADJUSTMENT',
      amount: 0,
      currency: existing.event_currency || 'MYR',
      actorId: options?.adminUserId || undefined,
      metadata: {
        action: 'EVENT_REACTIVATED',
        event_id: eventId,
        event_name: existing.name,
        previous_status: existing.event_status,
        new_event_status: targetEventStatus,
        reason: options?.reason || 'Admin reactivated event',
      },
    },
    env
  );

  const updated = await getEventById(eventId, env);
  if (!updated) throw new Error('Failed to load reactivated event');
  return updated;
}

/**
 * Scheduled Worker Maintenance Job:
 * 1. Evaluates business date boundaries across all events.
 * 2. Unpaid events:
 *    - If event end date has passed (curDate > endDate):
 *      - Marks event as EXPIRED (status: 'expired', event_status: 'EXPIRED')
 *    - Business Rule: Setup Day must NEVER automatically trigger payment.
 *      - Setup Day only enforces the non-refundable/non-cancellable state.
 *      - The cron must never silently spend organization wallet balance.
 *      - Payment remains strictly an explicit user action.
 * 3. Paid events:
 *    - If event end date has passed (curDate > endDate):
 *      - Marks event as COMPLETED (status: 'completed', event_status: 'COMPLETED')
 *    - While within start_date <= curDate <= end_date:
 *      - Ensures event status is 'live' and event_status is 'LIVE'
 *    - If before start_date:
 *      - Ensures event status is 'scheduled' and event_status is 'SCHEDULED'
 * 4. Automatic Test Score Clearing:
 *    - When an event reaches its configured start date (Asia/Singapore calendar date):
 *    - Automatically and idempotently clears TEST scores for that event while preserving LIVE scores.
 */
export async function runEventLifecycleMaintenance(
  env?: Record<string, any>,
  now: Date = new Date()
): Promise<{
  paidCount: number;
  paymentFailedCount: number;
  cancelledCount: number;
  completedCount: number;
  expiredCount: number;
  testScoresClearedCount: number;
  paidEvents: string[];
  paymentFailedEvents: string[];
  cancelledEvents: string[];
  completedEvents: string[];
  expiredEvents: string[];
  testScoresClearedEvents: string[];
}> {
  assertProductionMaintenanceSafe('runEventLifecycleMaintenance', env);

  const supabase = getSupabaseServerClient(env);
  const nowIso = now.toISOString();
  const paidEvents: string[] = [];
  const paymentFailedEvents: string[] = [];
  const cancelledEvents: string[] = [];
  const completedEvents: string[] = [];
  const expiredEvents: string[] = [];
  const testScoresClearedEvents: string[] = [];

  let allEvents: EventRecord[] = [];
  const { data, error } = await supabase.from('events').select('*');
  if (error || !data) {
    if (!isLocalFallbackAllowed(env)) {
      const errorDetail = error ? `[${error.code || 'ERROR'}] ${error.message}` : 'Supabase returned empty or null data response';
      console.error(`[Event Lifecycle Maintenance] Fatal: Failed to fetch events from database in production: ${errorDetail}`);
      throw new Error(
        `[Event Lifecycle Maintenance] Fatal: Failed to fetch events from Supabase in production: ${errorDetail}. Local cache fallback is strictly prohibited in production.`
      );
    }
    allEvents = Array.from(localEventsCache.values());
  } else {
    allEvents = data as EventRecord[];
    if (isLocalFallbackAllowed(env)) {
      for (const ev of allEvents) {
        localEventsCache.set(ev.id, ev);
      }
      // Include any local non-database events present in local cache
      const dbIds = new Set(allEvents.map((e) => e.id));
      for (const [id, cachedEv] of localEventsCache.entries()) {
        if (!dbIds.has(id)) {
          allEvents.push(cachedEv);
        }
      }
    }
  }

  for (const ev of allEvents) {
    const payStatus = (ev.payment_status || '').toUpperCase();
    const evStatus = (ev.event_status || '').toUpperCase();
    const rawStatus = (ev.status || '').toLowerCase();
    const startsAtTime = new Date(ev.starts_at).getTime();
    const expiresAtTime = new Date(ev.expires_at).getTime();
    const nowTime = now.getTime();

    // Skip already cancelled events
    if (evStatus === 'CANCELLED' || rawStatus === 'cancelled') {
      continue;
    }

    const { startDate } = getNormalizedEventDates(ev);
    const evTimezone = resolveEventTimezone(ev);
    const curDate = getNormalizedCurrentDate(now, evTimezone);
    const hasReachedStartDate = Boolean(startDate && curDate >= startDate);

    // 0. Automatic Test Score Clearing:
    // When an event reaches its configured start date:
    // - Remove all TEST scores for that event.
    // - Preserve LIVE scores if any already exist.
    // - The operation must be idempotent and safe across multiple worker instances.
    if (hasReachedStartDate && !isEventTestScoresCleared(ev.id, ev)) {
      try {
        await clearEventTestScores(ev.id, env);
        testScoresClearedEvents.push(ev.id);
      } catch (clearErr: any) {
        if (!isLocalFallbackAllowed(env)) {
          console.error(`[Event Lifecycle Maintenance] Fatal: Failed to clear test scores for event ${ev.id} in production:`, clearErr);
          throw new Error(`[Event Lifecycle Maintenance] Fatal: Failed to clear test scores for event ${ev.id}: ${clearErr?.message || clearErr}`);
        }
        console.warn(`[Maintenance] Automatic test score clearing failed for event ${ev.id}:`, clearErr?.message || clearErr);
      }
    }

    // 1. Unpaid events:
    if (payStatus !== 'PAID') {
      const { endDate } = getNormalizedEventDates(ev);
      const isAfterEndDate = Boolean(endDate && curDate > endDate);

      // If the event date has completely finished without payment -> Mark EXPIRED
      if (isAfterEndDate && (evStatus !== 'EXPIRED' || rawStatus !== 'expired')) {
        const payload = {
          event_status: 'EXPIRED' as EventLifecycleStatus,
          status: 'expired' as EventStatus,
          updated_at: nowIso,
        };
        const { error: updateErr } = await supabase.from('events').update(payload).eq('id', ev.id);
        if (updateErr) {
          if (!isLocalFallbackAllowed(env) || (!updateErr.message?.includes('Placeholder') && updateErr.code !== 'PGRST000')) {
            console.error(`[Event Lifecycle Maintenance] Fatal: Failed to update event ${ev.id} to EXPIRED in database:`, updateErr);
            throw new Error(`[Event Lifecycle Maintenance] Failed to update event ${ev.id} to EXPIRED in database: ${updateErr.message}`);
          }
        }
        expiredEvents.push(ev.id);
        await dispatchNotificationEvent(
          {
            eventType: 'EVENT_EXPIRED',
            organizationId: ev.organization_id,
            eventId: ev.id,
            eventName: ev.name,
            reason: 'UNPAID_EXPIRED',
          },
          env
        ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch EVENT_EXPIRED (unpaid):', err));
        if (isLocalFallbackAllowed(env)) {
          const cached = localEventsCache.get(ev.id);
          if (cached) {
            localEventsCache.set(ev.id, { ...cached, ...payload });
          }
        }
      }

      // BUSINESS RULE: Setup Day must NEVER automatically trigger payment.
      // Setup Day exists ONLY to change the event's cancellation/refund eligibility.
      // Payment requires explicit user action. The cron must never silently spend wallet balance.
      continue;
    }

    // 2. Paid events:
    if (payStatus === 'PAID') {
      const { endDate, startDate } = getNormalizedEventDates(ev);
      const isAfterEndDate = Boolean(endDate && curDate > endDate);
      const isLiveNow = Boolean(startDate && endDate && curDate >= startDate && curDate <= endDate);

      // Event date has completely passed -> Mark COMPLETED
      if (isAfterEndDate) {
        if (evStatus !== 'COMPLETED' || rawStatus !== 'completed') {
          const payload = {
            event_status: 'COMPLETED' as EventLifecycleStatus,
            status: 'completed' as EventStatus,
            updated_at: nowIso,
          };
          const { error: updateErr } = await supabase.from('events').update(payload).eq('id', ev.id);
          if (updateErr) {
            if (!isLocalFallbackAllowed(env) || (!updateErr.message?.includes('Placeholder') && updateErr.code !== 'PGRST000')) {
              console.error(`[Event Lifecycle Maintenance] Fatal: Failed to update event ${ev.id} to COMPLETED in database:`, updateErr);
              throw new Error(`[Event Lifecycle Maintenance] Failed to update event ${ev.id} to COMPLETED in database: ${updateErr.message}`);
            }
          }
          completedEvents.push(ev.id);
          await dispatchNotificationEvent(
            {
              eventType: 'EVENT_EXPIRED',
              organizationId: ev.organization_id,
              eventId: ev.id,
              eventName: ev.name,
              reason: 'COMPLETED',
            },
            env
          ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch EVENT_EXPIRED (completed):', err));
          if (isLocalFallbackAllowed(env)) {
            const cached = localEventsCache.get(ev.id);
            if (cached) {
              localEventsCache.set(ev.id, { ...cached, ...payload });
            }
          }
        }
      }
      // On event date -> LIVE
      else if (isLiveNow) {
        if (evStatus !== 'LIVE' || rawStatus !== 'live') {
          const livePayload = {
            event_status: 'LIVE' as EventLifecycleStatus,
            status: 'live' as EventStatus,
            updated_at: nowIso,
          };
          const { error: updateErr } = await supabase.from('events').update(livePayload).eq('id', ev.id);
          if (updateErr) {
            if (!isLocalFallbackAllowed(env) || (!updateErr.message?.includes('Placeholder') && updateErr.code !== 'PGRST000')) {
              console.error(`[Event Lifecycle Maintenance] Fatal: Failed to update event ${ev.id} to LIVE in database:`, updateErr);
              throw new Error(`[Event Lifecycle Maintenance] Failed to update event ${ev.id} to LIVE in database: ${updateErr.message}`);
            }
          }
          if (isLocalFallbackAllowed(env)) {
            const cached = localEventsCache.get(ev.id);
            if (cached) {
              localEventsCache.set(ev.id, { ...cached, ...livePayload });
            }
          }
          await dispatchNotificationEvent(
            {
              eventType: 'EVENT_LIVE',
              organizationId: ev.organization_id,
              eventId: ev.id,
              eventName: ev.name,
              publicUrl: `/play/${ev.public_token}`,
            },
            env
          ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch EVENT_LIVE:', err));
        }

        if (endDate) {
          const endDateTime = getUtcBoundaryInTimezone(endDate, 'end', evTimezone).getTime();
          const diffHours = (endDateTime - nowTime) / (1000 * 60 * 60);
          if (diffHours > 0 && diffHours <= 24) {
            const timeRemaining = `${Math.ceil(diffHours)} hours`;
            await dispatchNotificationEvent(
              {
                eventType: 'EVENT_EXPIRING',
                organizationId: ev.organization_id,
                eventId: ev.id,
                eventName: ev.name,
                endDate,
                timeRemaining,
              },
              env
            ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch EVENT_EXPIRING:', err));
          }
        }
      } else if (startDate && curDate < startDate) {
        const startDateTime = getUtcBoundaryInTimezone(startDate, 'start', evTimezone).getTime();
        const diffHoursToStart = (startDateTime - nowTime) / (1000 * 60 * 60);
        // Approaching when within 36 hours of start date (tomorrow / setup day)
        if (diffHoursToStart > 0 && diffHoursToStart <= 36) {
          await dispatchNotificationEvent(
            {
              eventType: 'EVENT_APPROACHING',
              organizationId: ev.organization_id,
              eventId: ev.id,
              eventName: ev.name,
              startDate,
            },
            env
          ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch EVENT_APPROACHING:', err));
        }
      }
    }
  }

  try {
    await cleanupExpiredNotifications(env);
  } catch (cleanErr) {
    console.warn('[Event Lifecycle Maintenance] Notification cleanup warning:', cleanErr);
  }

  return {
    paidCount: paidEvents.length,
    paymentFailedCount: paymentFailedEvents.length,
    cancelledCount: cancelledEvents.length,
    completedCount: completedEvents.length,
    expiredCount: expiredEvents.length,
    testScoresClearedCount: testScoresClearedEvents.length,
    paidEvents,
    paymentFailedEvents,
    cancelledEvents,
    completedEvents,
    expiredEvents,
    testScoresClearedEvents,
  };
}

/**
 * Delete an event from database
 */
export async function deleteEvent(eventId: string, env?: Record<string, any>): Promise<void> {
  const supabase = getSupabaseServerClient(env);
  localEventsCache.delete(eventId);
  const { error } = await supabase.from('events').delete().eq('id', eventId);

  if (error && !error.message?.includes('Placeholder') && error.code !== 'PGRST000') {
    console.error('Error in deleteEvent:', error);
    throw new Error(`Failed to delete event: ${error.message}`);
  }
}

/**
 * Developer Admin: Get all events across all organizations with enriched details.
 */
export async function getAllAdminEvents(
  env?: Record<string, any>
): Promise<EventWithDetails[]> {
  const supabase = getSupabaseServerClient(env);

  let events: EventRecord[] = [];
  const { data: eventsData, error: eventsError } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false });

  if (eventsError) {
    if (eventsError.message?.includes('Placeholder') || eventsError.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      events = Array.from(localEventsCache.values());
    } else {
      console.error('Error in getAllAdminEvents:', eventsError);
      throw new Error(`Failed to list admin events: ${eventsError.message}`);
    }
  } else {
    events = (eventsData || []) as EventRecord[];
    if (isLocalFallbackAllowed(env)) {
      for (const ev of events) {
        localEventsCache.set(ev.id, ev);
      }
    }
  }

  // Fetch all organizations
  const { data: orgsData } = await supabase
    .from('organizations')
    .select('id, name, slug');
  const orgsMap = new Map<string, { id: string; name: string; slug: string }>();
  if (orgsData) {
    for (const org of orgsData) {
      orgsMap.set(org.id, org);
    }
  }

  // Fetch related game themes and games
  const themeIds = Array.from(new Set(events.map((e) => e.game_theme_id).filter(Boolean)));
  const { data: themesData } = await supabase
    .from('game_themes')
    .select('*, games(id, name, slug, game_type)')
    .in('id', themeIds);

  const enrichedThemes = await enrichThemesWithGameData(themesData || [], env);
  const themesMap = new Map<string, any>();
  for (const t of enrichedThemes) {
    themesMap.set(t.id, t);
  }

  return events.map((event) => {
    const org = orgsMap.get(event.organization_id);
    const theme = themesMap.get(event.game_theme_id) || null;
    const game = theme?.games || null;
    const calculated = calculateEventStatus(event);
    const storedPrice = event.event_price !== undefined && event.event_price !== null
      ? Number(event.event_price)
      : (event.paid_amount !== undefined && event.paid_amount !== null ? Number(event.paid_amount) : 1400.00);
    const paymentStatus = (event.payment_status || (event.status === 'pending_payment' ? 'PENDING_PAYMENT' : 'UNPAID')).toUpperCase();
    const isPaid = paymentStatus === 'PAID';
    const eventLifecycle = event.event_status || deriveEventLifecycleStatus(event);

    const durDays = calculateEventCalendarDays(event.start_date || event.event_date, event.end_date || event.start_date || event.event_date);

    return {
      ...event,
      duration_days: durDays,
      event_price: storedPrice,
      event_currency: event.event_currency || 'MYR',
      event_status: eventLifecycle,
      payment_status: paymentStatus as any,
      cancel_reason: event.cancel_reason || null,
      payment_mode: event.payment_mode || (isPaid ? 'FULL_PAID' : undefined),
      paid_amount: event.paid_amount !== undefined ? event.paid_amount : (isPaid ? storedPrice : 0),
      discount_amount: event.discount_amount || 0,
      organization_name: org?.name || 'Unknown Organization',
      organization_slug: org?.slug || 'unknown',
      calculated_status: calculated,
      game_theme: theme,
      game: game
        ? {
            id: game.id,
            name: game.name,
            slug: game.slug,
            game_type: game.game_type || 'catch-brand',
          }
        : null,
      showcase_status: 'NOT_CREATED',
    };
  });
}

/**
 * Developer Admin: Update price of an individual event.
 * Server-authoritative price override.
 */
export async function updateEventPrice(
  eventId: string,
  priceOrObj: { event_price: number; event_currency?: string } | number,
  currencyOrAdmin?: string,
  adminUserIdOrEnv?: string | Record<string, any>,
  envParam?: Record<string, any>
): Promise<EventWithDetails> {
  let price: number;
  let cur: string = 'MYR';
  let adminUserId: string | undefined = undefined;
  let env: Record<string, any> | undefined = undefined;

  if (typeof priceOrObj === 'object' && priceOrObj !== null) {
    price = Number(priceOrObj.event_price);
    cur = (priceOrObj.event_currency || 'MYR').trim().toUpperCase();
    if (typeof currencyOrAdmin === 'string') {
      adminUserId = currencyOrAdmin;
    }
    if (typeof adminUserIdOrEnv === 'object' && adminUserIdOrEnv !== null) {
      env = adminUserIdOrEnv;
    }
  } else {
    price = Number(priceOrObj);
    if (typeof currencyOrAdmin === 'string') {
      cur = currencyOrAdmin.trim().toUpperCase();
    }
    if (typeof adminUserIdOrEnv === 'string') {
      adminUserId = adminUserIdOrEnv;
    }
    env = envParam;
  }

  const existing = await getEventById(eventId, env);
  if (!existing) {
    throw new Error('Event not found');
  }

  if (isNaN(price) || price <= 0) {
    throw new Error('Event price must be a valid number greater than 0');
  }

  if (!cur || cur.length > 5) {
    throw new Error('Invalid currency code');
  }

  const oldPrice = existing.event_price || 1400.00;
  const oldCurrency = existing.event_currency || 'MYR';
  const now = new Date().toISOString();

  const supabase = getSupabaseServerClient(env);
  const { error } = await supabase
    .from('events')
    .update({
      event_price: price,
      event_currency: cur,
      updated_at: now,
    })
    .eq('id', eventId);

  if (error && !error.message?.includes('Placeholder') && error.code !== 'PGRST000') {
    console.error('Error in updateEventPrice:', error);
    throw new Error(`Failed to update event price: ${error.message}`);
  }

  // Update local cache
  const cached = localEventsCache.get(eventId);
  if (cached) {
    cached.event_price = price;
    cached.event_currency = cur;
    cached.updated_at = now;
    localEventsCache.set(eventId, cached);
  }

  // Record traceable audit log
  await recordWalletAuditEvent(
    {
      organizationId: existing.organization_id,
      eventType: 'ADMIN_ADJUSTMENT',
      amount: price,
      currency: cur,
      actorId: adminUserId || undefined,
      metadata: {
        action: 'EVENT_PRICE_UPDATED',
        event_id: eventId,
        event_name: existing.name,
        old_price: oldPrice,
        new_price: price,
        old_currency: oldCurrency,
        new_currency: cur,
        changed_by_admin_id: adminUserId || null,
        description: `Admin updated price for event "${existing.name}" from ${oldCurrency} ${Number(oldPrice).toFixed(2)} to ${cur} ${price.toFixed(2)}`,
      },
    },
    env
  );

  const updated = await getEventById(eventId, env);
  if (!updated) {
    throw new Error('Failed to load updated event');
  }
  return updated;
}
