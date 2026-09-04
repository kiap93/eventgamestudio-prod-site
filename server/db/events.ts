import { getSupabaseServerClient, isLocalFallbackAllowed } from '../supabase.js';
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
} from './types.js';
import { getThemeById, isUUID, enrichThemesWithGameData } from './themes.js';
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
 * Normalizes input date representation to YYYY-MM-DD string.
 */
export function getNormalizedCurrentDate(currentDate?: string | Date | null): string {
  if (typeof currentDate === 'string') {
    const match = currentDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const dt = currentDate instanceof Date ? currentDate : new Date();
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Singapore',
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
 * Checks whether an event is strictly before its configured start date (Asia/Singapore calendar date).
 * In this pre-event window (including Setup Day), the event is in TEST mode and TEST scores can be manually cleared.
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
 * Calculates current dynamic event status for standard lifecycle management.
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
  const rawStatus = (event.status || '').toLowerCase();
  const eventStatus = (event.event_status || '').toUpperCase();
  const cancelReason = event.cancel_reason || null;

  if (rawStatus === 'cancelled' || eventStatus === 'CANCELLED' || cancelReason) {
    return 'cancelled';
  }

  const { startDate, endDate, liveOpenDate } = getNormalizedEventDates(event);
  const curDate = getNormalizedCurrentDate(now);
  const isPaid = (event.payment_status || '').toUpperCase() === 'PAID';

  if (endDate && curDate > endDate) {
    return 'expired';
  }

  if (!isPaid) {
    if (rawStatus === 'draft' || eventStatus === 'DRAFT') {
      return 'draft';
    }
    return 'pending_payment';
  }

  if (liveOpenDate && curDate < liveOpenDate) {
    return 'scheduled';
  }

  return 'live';
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
 * 1. CANCELLED -> 'CANCELLED'
 * 2. unpaid / pending payment -> 'DRAFT' | 'PENDING_PAYMENT' | 'CANCELLED' (if expired)
 * 3. paid + curDate > endDate -> 'COMPLETED'
 * 4. paid + curDate < liveOpenDate -> 'SCHEDULED'
 * 5. paid + liveOpenDate <= curDate <= endDate -> 'LIVE'
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
  const rawStatus = (event.status || '').toLowerCase();
  const eventStatus = (event.event_status || '').toUpperCase();
  const payStatus = (event.payment_status || '').toUpperCase();
  const cancelReason = event.cancel_reason || null;

  // 1. CANCELLED -> 'CANCELLED'
  if (rawStatus === 'cancelled' || eventStatus === 'CANCELLED' || cancelReason) {
    return 'CANCELLED';
  }

  const { startDate, endDate, liveOpenDate } = getNormalizedEventDates(event);
  const curDate = getNormalizedCurrentDate(now);
  const isPaid = payStatus === 'PAID';

  // 2. unpaid / pending payment
  if (!isPaid) {
    if (endDate && curDate > endDate) {
      return 'CANCELLED';
    }
    if (eventStatus === 'DRAFT' || rawStatus === 'draft') {
      return 'DRAFT';
    }
    return 'PENDING_PAYMENT';
  }

  // 3. Paid events:
  // Paid + curDate > endDate -> COMPLETED
  if ((endDate && curDate > endDate) || eventStatus === 'COMPLETED' || rawStatus === 'expired' || rawStatus === 'completed') {
    return 'COMPLETED';
  }

  // Paid + before liveOpenDate (start_date - 1 day) -> SCHEDULED
  if (liveOpenDate && curDate < liveOpenDate) {
    return 'SCHEDULED';
  }

  // Paid + liveOpenDate <= curDate <= endDate -> LIVE
  return 'LIVE';
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
    if (rawStatus === 'cancelled') return false;
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
export function normalizeEventDateBoundaries(params: {
  start_date?: string | null;
  end_date?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  event_date?: string | null;
  starts_at?: string | null;
  expires_at?: string | null;
}): {
  startDate: string;
  endDate: string;
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

  const [startY, startM, startD] = startDate.split('-').map(Number);
  const [endY, endM, endD] = endDate.split('-').map(Number);

  const startUtc = new Date(Date.UTC(startY, startM - 1, startD, 0, 0, 0, 0));
  const endUtc = new Date(Date.UTC(endY, endM - 1, endD, 23, 59, 59, 999));

  if (isNaN(startUtc.getTime()) || isNaN(endUtc.getTime())) {
    const err: any = new Error('Invalid Start Date or End Date');
    err.status = 422;
    err.code = 'INVALID_DATE_FORMAT';
    throw err;
  }

  if (endDate < startDate) {
    const err: any = new Error('End Date must be on or after Start Date');
    err.status = 422;
    err.code = 'INVALID_DATE_RANGE';
    throw err;
  }

  // Setup Day begins at 00:00:00 UTC on the calendar day immediately preceding the Start Date
  const setupUtc = new Date(Date.UTC(startY, startM - 1, startD - 1, 0, 0, 0, 0));

  return {
    startDate,
    endDate,
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
 * The Setup Day is the calendar day immediately before the event starts (00:00:00 UTC).
 * For an event scheduled for:
 * Event date: 2 September – 3 September (e.g. 2026-09-02)
 * the Setup Day / Payment Deduction Day = 1 September 00:00:00 (2026-09-01T00:00:00.000Z)
 */
export function getSetupDayStartTime(event: {
  starts_at?: string | null;
  event_date?: string | null;
  start_date?: string | null;
  setup_starts_at?: string | null;
}): Date {
  if (event.setup_starts_at) {
    return new Date(event.setup_starts_at);
  }

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
      return new Date(Date.UTC(year, month, day - 1, 0, 0, 0, 0));
    }
  }

  const startDate = new Date(event.starts_at || Date.now());
  return new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate() - 1, 0, 0, 0, 0));
}

/**
 * Checks whether Setup Day / Testing has started.
 */
export function isSetupDayStarted(
  event: {
    starts_at: string;
    event_date?: string | null;
    setup_starts_at?: string | null;
    [key: string]: any;
  },
  now: Date = new Date()
): boolean {
  const setupTime = getSetupDayStartTime(event);
  return now.getTime() >= setupTime.getTime();
}

/**
 * Dedicated engine to determine whether refund is allowed for an event and calculates refund amounts.
 *
 * Rules:
 * 1. Before Setup Day: Cancellation is allowed (Unpaid events need no refund; paid events receive 100% full refund).
 * 2. On/After Setup Day starts or After successful payment:
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

  // After successful payment deduction or on/after Setup Day:
  if (paymentStatus === 'PAID' || isSetupDayStarted(event, now)) {
    return {
      canRefund: false,
      refundPaidAmount: 0,
      creditReversalAmount: 0,
      creditType: paymentMode,
      paymentStatus,
      reason: paymentStatus === 'PAID'
        ? 'After successful payment deduction, cancellation and refunds are disabled.'
        : 'Once Setup Day starts, cancellation and refunds are not allowed.',
    };
  }

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

  // Prior to Setup Day with paid balance: full refund
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
 * DRAFT (before Setup Day, unpaid)   → YES
 * SCHEDULED (before Setup Day, unpaid) → YES
 * PAID (any time)                   → NO
 * ON / AFTER SETUP DAY              → NO
 * ACTIVE / LIVE                     → NO
 * COMPLETED / EXPIRED               → NO
 * CANCELLED                         → NO
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
  const setupDayStarted = nowTime >= setupStartTime.getTime();

  const refundInfo = determineEventRefund(event, now);

  // Derive calculated status
  let calculatedStatus = rawStatus;
  if (rawStatus === 'cancelled' || eventStatus === 'CANCELLED') {
    calculatedStatus = 'cancelled';
  } else if (rawStatus === 'draft' || eventStatus === 'DRAFT') {
    calculatedStatus = 'draft';
  } else if (nowTime >= expiresAtTime || rawStatus === 'expired' || rawStatus === 'completed' || eventStatus === 'COMPLETED') {
    calculatedStatus = 'expired';
  } else if (nowTime >= startsAtTime || rawStatus === 'live' || rawStatus === 'active' || eventStatus === 'LIVE') {
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

  // 3. AFTER SUCCESSFUL PAYMENT -> NO (Once paid, cancellation and refund are strictly disabled)
  if (payStatus === 'PAID') {
    return {
      ...baseResult,
      canCancel: false,
      canRefund: false,
      reason: 'After successful payment deduction, cancellation and refunds are disabled.',
      code: 'PAYMENT_COMMITTED',
    };
  }

  // 4. ACTIVE / LIVE -> NO
  if (calculatedStatus === 'live' || rawStatus === 'live' || rawStatus === 'active' || (nowTime >= startsAtTime && nowTime < expiresAtTime)) {
    return {
      ...baseResult,
      canCancel: false,
      canRefund: false,
      reason: 'Active and live events cannot be cancelled.',
      code: 'EVENT_ACTIVE',
    };
  }

  // 5. ONCE SETUP DAY STARTS -> NO
  if (setupDayStarted) {
    return {
      ...baseResult,
      canCancel: false,
      canRefund: false,
      reason: 'Once Setup Day starts, cancellation and refunds are not allowed.',
      code: 'SETUP_DAY_STARTED',
    };
  }

  // 6. BEFORE SETUP DAY (DRAFT or SCHEDULED without payment) -> YES
  return {
    ...baseResult,
    canCancel: true,
    canRefund: refundInfo.canRefund,
    reason: 'Event is scheduled before Setup Day and is eligible for cancellation.',
    code: 'ELIGIBLE_FOR_CANCELLATION',
  };
}

/**
 * Generate a short, unique, user-friendly alphanumeric token for public event links (e.g. 7KQ2M9X)
 */
export function generatePublicToken(length: number = 7): string {
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
  const supabase = getSupabaseServerClient(env);

  let events: EventRecord[] = [];
  const { data: eventsData, error: eventsError } = await supabase
    .from('events')
    .select('*')
    .eq('organization_id', organizationId)
    .order('starts_at', { ascending: false });

  if (eventsError) {
    if (eventsError.message?.includes('Placeholder') || eventsError.code === 'PGRST000') {
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
    const paymentStatus = event.payment_status || (event.status === 'pending_payment' ? 'PENDING_PAYMENT' : 'PAID');
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
      if (error.message?.includes('Placeholder') || error.code === 'PGRST000') {
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
        eventRecord = null;
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
  const paymentStatus = eventRecord.payment_status || (eventRecord.status === 'pending_payment' ? 'PENDING_PAYMENT' : 'PAID');
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
    if (eventLifecycleStatus === 'CANCELLED' || eventRecord.status === 'cancelled' || !isPaid) {
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
    event_status: eventLifecycleStatus as EventLifecycleStatus,
    payment_status: paymentStatus as any,
    cancel_reason: eventRecord.cancel_reason || null,
    payment_mode: eventRecord.payment_mode || (isPaid ? 'FULL_PAID' : undefined),
    paid_amount: eventRecord.paid_amount !== undefined ? eventRecord.paid_amount : (isPaid ? storedPrice : 0),
    discount_amount: eventRecord.discount_amount || 0,
    calculated_status: calculateEventStatus(eventRecord),
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
 * Authoritatively resolves the game type ('memory-match' | 'catch-brand' | string) for an event.
 * Inspects event.game.game_type, event.game.slug, event.game_id, event.game_theme, and fallback metadata.
 * Does NOT rely on untrusted client metadata.
 */
export async function resolveEventGameType(
  event: any,
  env?: Record<string, any>
): Promise<'memory-match' | 'catch-brand' | string> {
  if (!event) return 'catch-brand';

  // 1. Direct game object on event
  if (event.game) {
    if (event.game.game_type) {
      const gt = String(event.game.game_type).toLowerCase().trim();
      if (gt === 'memory-match' || gt === 'catch-brand') return gt;
    }
    if (event.game.slug) {
      const slug = String(event.game.slug).toLowerCase().trim();
      if (slug === 'memory-match') return 'memory-match';
      if (slug === 'catch-brand') return 'catch-brand';
    }
  }

  // 2. Direct event.game_id
  if (event.game_id) {
    const gid = String(event.game_id).toLowerCase().trim();
    if (gid === 'memory-match') return 'memory-match';
    if (gid === 'catch-brand') return 'catch-brand';

    try {
      const gameRecord = await getGameById(event.game_id, env);
      if (gameRecord) {
        const gt = (gameRecord.game_type || gameRecord.slug || '').toLowerCase().trim();
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
      if (tgt === 'memory-match') return 'memory-match';
      if (tgt === 'catch-brand') return 'catch-brand';
    }
    if (theme.game_slug) {
      const tgs = String(theme.game_slug).toLowerCase().trim();
      if (tgs === 'memory-match') return 'memory-match';
      if (tgs === 'catch-brand') return 'catch-brand';
    }
    if (theme.base_theme_id) {
      const bti = String(theme.base_theme_id).toLowerCase().trim();
      if (bti === 'memory-match' || bti === 'memory-carnival') return 'memory-match';
      if (bti === 'catch-brand' || bti === 'carnival') return 'catch-brand';
    }
    if (theme.id) {
      const tid = String(theme.id).toLowerCase().trim();
      if (tid === 'memory-match' || tid === 'memory-carnival') return 'memory-match';
      if (tid === 'catch-brand' || tid === 'carnival') return 'catch-brand';
    }
    if (theme.slug) {
      const tslug = String(theme.slug).toLowerCase().trim();
      if (tslug === 'memory-match' || tslug === 'memory-carnival' || tslug.includes('memory')) return 'memory-match';
    }
    if (theme.game_id) {
      try {
        const themeGame = await getGameById(theme.game_id, env);
        if (themeGame) {
          const tgt = (themeGame.game_type || themeGame.slug || '').toLowerCase().trim();
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
    if (gtid === 'memory-match' || gtid === 'memory-carnival' || gtid.includes('memory')) {
      return 'memory-match';
    }
  }

  // 5. Fallback check on event name or slug
  const eventName = (event.name || event.slug || '').toLowerCase();
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
  },
  env?: Record<string, any>
): Promise<EventRecord> {
  const supabase = getSupabaseServerClient(env);

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

  // Theme must be active
  if (theme.status && theme.status !== 'active') {
    const err: any = new Error('The selected theme is not active.');
    err.status = 422;
    err.code = 'THEME_INACTIVE';
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

  // 3. Normalize calendar date boundaries (Start Date to End Date)
  const norm = normalizeEventDateBoundaries({
    start_date: params.start_date || params.startDate,
    end_date: params.end_date || params.endDate,
    event_date: params.event_date,
    starts_at: params.starts_at,
    expires_at: params.expires_at,
  });

  // 4. Enforce maximum 2 PENDING_PAYMENT events limit per organization
  const effectivePaymentStatus = ((params.payment_status as string) || 'UNPAID').toUpperCase();
  const isPending = effectivePaymentStatus === 'PENDING_PAYMENT' ||
    effectivePaymentStatus === 'UNPAID' ||
    params.status === 'pending_payment';

  if (isPending && !params.skipPendingLimitCheck) {
    const pendingCount = await getPendingEventsCountByOrgId(params.organization_id, env);
    if (pendingCount >= 2) {
      const err: any = new Error('Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.');
      err.code = 'PENDING_EVENT_LIMIT_REACHED';
      err.status = 422;
      throw err;
    }
  }

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
    // If schema cache lacks newly added columns (PGRST204) or check constraint (23514) on status:
    if (
      error.code === 'PGRST204' ||
      error.code === '23514' ||
      error.message?.includes('schema cache') ||
      error.message?.includes('violates check constraint')
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
        return fullRecord;
      }
      console.error('Error in createEvent:', error);
      throw new Error(`Failed to create event: ${error.message}`);
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
  return fullRecord;
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

    // 3. Validate time boundaries
    const startsAtTime = new Date(starts_at).getTime();
    const expiresAtTime = new Date(expires_at).getTime();

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
      const error: any = new Error('Insufficient balance. Please top up your wallet to continue.');
      error.code = 'INSUFFICIENT_BALANCE';
      error.status = 402;
      error.required = calculation.paidAmount;
      error.available = calculation.availableBalances.paid_balance;
      error.shortfall = Math.max(0, calculation.paidAmount - calculation.availableBalances.paid_balance);
      error.reasons = calculation.reasons;
      throw error;
    }

    // 5. Create the Event Record with PAID status & payment details
    const createdEventRecord = await createEvent(
      {
        organization_id,
        game_id: targetGameId,
        game_theme_id,
        name,
        event_date,
        starts_at,
        expires_at,
        status,
        created_by,
        payment_status: 'PAID',
        payment_mode,
        paid_amount: calculation.paidAmount,
        discount_amount: calculation.totalDiscount,
        event_price: eventPrice,
        event_currency: eventCurrency,
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
  },
  env?: Record<string, any>
): Promise<EventRecord> {
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  // 1. Fetch current event
  const existing = await getEventById(eventId, env);
  if (!existing) {
    throw new Error('Event not found');
  }

  const payload: any = {
    updated_at: now,
  };

  if (updates.name !== undefined) {
    payload.name = updates.name.trim();
  }

  const hasDateUpdate =
    updates.start_date !== undefined ||
    updates.end_date !== undefined ||
    updates.startDate !== undefined ||
    updates.endDate !== undefined ||
    updates.event_date !== undefined ||
    updates.starts_at !== undefined ||
    updates.expires_at !== undefined;

  if (hasDateUpdate) {
    const norm = normalizeEventDateBoundaries({
      start_date: updates.start_date || updates.startDate,
      end_date: updates.end_date || updates.endDate,
      event_date: updates.event_date,
      starts_at: updates.starts_at || existing.starts_at,
      expires_at: updates.expires_at || existing.expires_at,
    });
    payload.event_date = norm.event_date;
    payload.start_date = norm.start_date;
    payload.end_date = norm.end_date;
    payload.starts_at = norm.starts_at;
    payload.expires_at = norm.expires_at;
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
      },
      env
    );
  }

  const determinedReason: EventCancelReason =
    options?.cancelReason ||
    (options?.reason?.includes('TIMEOUT')
      ? 'PAYMENT_TIMEOUT'
      : options?.cancelledBy === 'admin'
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

  const updated = await updateEvent(eventId, updatePayload, env);

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
  await supabase.from('events').update(updatePayload).eq('id', eventId);

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
 * 1. Checks events on / approaching Setup Day (now >= setup_starts_at):
 *    - If event is unpaid (payment_status !== 'PAID') and not cancelled:
 *      - If event start time has already passed (now >= starts_at):
 *        - Auto-cancel event with cancel_reason = 'PAYMENT_TIMEOUT'.
 *      - Else (now >= setup_starts_at and now < starts_at):
 *        - Attempt automated atomic payment deduction (Setup Day Payment).
 *        - If wallet balance is sufficient:
 *          - processEventPayment succeeds atomically
 *          - Event payment_status becomes 'PAID'
 *          - Event status becomes 'scheduled' / 'live'
 *        - If wallet balance is insufficient:
 *          - Payment fails, event remains UNPAID / PENDING_PAYMENT
 *          - Event is not cancelled yet (until starts_at)
 * 2. Marks expired paid events as COMPLETED (now >= expires_at).
 */
export async function runEventLifecycleMaintenance(
  env?: Record<string, any>,
  now: Date = new Date()
): Promise<{
  paidCount: number;
  paymentFailedCount: number;
  cancelledCount: number;
  completedCount: number;
  testScoresClearedCount: number;
  paidEvents: string[];
  paymentFailedEvents: string[];
  cancelledEvents: string[];
  completedEvents: string[];
  testScoresClearedEvents: string[];
}> {
  const supabase = getSupabaseServerClient(env);
  const nowIso = now.toISOString();
  const paidEvents: string[] = [];
  const paymentFailedEvents: string[] = [];
  const cancelledEvents: string[] = [];
  const completedEvents: string[] = [];
  const testScoresClearedEvents: string[] = [];

  let allEvents: EventRecord[] = [];
  const { data, error } = await supabase.from('events').select('*');
  if (error || !data) {
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
    const setupStartTime = getSetupDayStartTime(ev);
    const nowTime = now.getTime();

    // Skip already cancelled events
    if (evStatus === 'CANCELLED' || rawStatus === 'cancelled') {
      continue;
    }

    const { startDate } = getNormalizedEventDates(ev);
    const curDate = getNormalizedCurrentDate(now);
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
        console.warn(`[Maintenance] Automatic test score clearing failed for event ${ev.id}:`, clearErr?.message || clearErr);
      }
    }

    // 1. Unpaid events
    if (payStatus !== 'PAID') {
      // 1a. If event start time has arrived/passed without payment -> Auto-cancel with PAYMENT_TIMEOUT
      if (nowTime >= startsAtTime) {
        cancelledEvents.push(ev.id);
        const payload = {
          event_status: 'CANCELLED' as EventLifecycleStatus,
          status: 'cancelled' as EventStatus,
          cancel_reason: 'PAYMENT_TIMEOUT' as EventCancelReason,
          updated_at: nowIso,
        };
        await supabase.from('events').update(payload).eq('id', ev.id);
        const cached = localEventsCache.get(ev.id);
        if (cached) {
          localEventsCache.set(ev.id, { ...cached, ...payload });
        }
      }
      // 1b. If Setup Day has started (now >= setup_starts_at) -> Attempt automated atomic payment deduction
      else if (nowTime >= setupStartTime.getTime()) {
        try {
          const paymentResult = await processEventPayment(
            {
              organizationId: ev.organization_id,
              eventId: ev.id,
              paymentMode: ev.payment_mode || 'FULL_PAID',
              eventPrice: ev.event_price || undefined,
              eventName: ev.name,
              description: `Automated Setup-Day payment for event "${ev.name}"`,
            },
            env
          );

          if (paymentResult && paymentResult.success) {
            paidEvents.push(ev.id);
            const updatePayload = {
              payment_status: 'PAID' as PaymentLifecycleStatus,
              event_status: 'LIVE' as EventLifecycleStatus,
              status: (nowTime >= startsAtTime ? 'live' : 'scheduled') as EventStatus,
              paid_amount: paymentResult.paymentCalculation.paidAmount,
              discount_amount: paymentResult.paymentCalculation.totalDiscount,
              payment_mode: (ev.payment_mode || 'FULL_PAID') as PaymentMode,
              updated_at: nowIso,
            };
            await supabase.from('events').update(updatePayload).eq('id', ev.id);
            const cached = localEventsCache.get(ev.id);
            if (cached) {
              localEventsCache.set(ev.id, { ...cached, ...updatePayload });
            }
          }
        } catch (paymentErr: any) {
          console.warn(`[Maintenance] Setup-day automated payment failed for event ${ev.id} (${ev.name}):`, paymentErr?.message || paymentErr);
          paymentFailedEvents.push(ev.id);
        }
      }
      continue;
    }

    // 2. Paid events whose expiry time has passed -> Mark COMPLETED
    if (payStatus === 'PAID') {
      if (nowTime >= expiresAtTime && evStatus !== 'COMPLETED' && rawStatus !== 'expired') {
        completedEvents.push(ev.id);
        const payload = {
          event_status: 'COMPLETED' as EventLifecycleStatus,
          status: 'expired' as EventStatus,
          updated_at: nowIso,
        };
        await supabase.from('events').update(payload).eq('id', ev.id);
        const cached = localEventsCache.get(ev.id);
        if (cached) {
          localEventsCache.set(ev.id, { ...cached, ...payload });
        }
      }
    }
  }

  return {
    paidCount: paidEvents.length,
    paymentFailedCount: paymentFailedEvents.length,
    cancelledCount: cancelledEvents.length,
    completedCount: completedEvents.length,
    testScoresClearedCount: testScoresClearedEvents.length,
    paidEvents,
    paymentFailedEvents,
    cancelledEvents,
    completedEvents,
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
    if (eventsError.message?.includes('Placeholder') || eventsError.code === 'PGRST000') {
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
    const paymentStatus = event.payment_status || (event.status === 'pending_payment' ? 'PENDING_PAYMENT' : 'PAID');
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
