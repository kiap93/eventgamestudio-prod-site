import { getSupabaseServerClient } from '../supabase.js';
import {
  EventRecord,
  EventStatus,
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
import { getThemeById } from './themes.js';
import { getGameById } from './games.js';
import { getShowcaseByEventId, getShowcasesByOrgId } from './showcases.js';
import {
  STANDARD_EVENT_PRICE,
  calculateEventPayment,
  processEventPayment,
  refundEventPayment,
} from './wallet.js';
import crypto from 'node:crypto';

// In-memory cache fallback for mock / test environments
const localEventsCache = new Map<string, EventRecord>();

/**
 * Calculates current real-time status of an event based on time windows.
 */
export function calculateEventStatus(
  event: {
    status: EventStatus | string;
    starts_at: string;
    expires_at: string;
    setup_starts_at?: string | null;
  },
  now: Date = new Date()
): EventStatus {
  const rawStatus = (event.status || '').toLowerCase();
  if (rawStatus === 'cancelled') return 'cancelled';
  if (rawStatus === 'draft') return 'draft';

  const nowTime = now.getTime();
  const startsAt = new Date(event.starts_at).getTime();
  const expiresAt = new Date(event.expires_at).getTime();

  if (nowTime >= expiresAt || rawStatus === 'expired' || rawStatus === 'completed') {
    return 'expired';
  }
  if (nowTime >= startsAt || rawStatus === 'live' || rawStatus === 'active') {
    return 'live';
  }
  return 'scheduled';
}

/**
 * Calculates the exact start time of Setup Day / Preparation window.
 * Default specification: Setup Day starts at 00:00:00 (beginning of the day) 1 calendar day before the event starts (or 24 hours prior).
 */
export function getSetupDayStartTime(event: {
  starts_at: string;
  event_date?: string | null;
  setup_starts_at?: string | null;
}): Date {
  if (event.setup_starts_at) {
    return new Date(event.setup_starts_at);
  }
  const startDate = new Date(event.starts_at);
  // 24 hours prior to event starts_at
  return new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
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
 */
export function determineEventRefund(
  event: EventRecord | EventWithDetails,
  now: Date = new Date()
): EventRefundDetermination {
  const paymentStatus = event.payment_status || 'UNPAID';
  const paidAmount = Number(event.paid_amount || 0);
  const discountAmount = Number(event.discount_amount || 0);
  const paymentMode = event.payment_mode || null;

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

  // Once Setup Day starts, ordinary cancellation/refund is not allowed.
  if (isSetupDayStarted(event, now)) {
    return {
      canRefund: false,
      refundPaidAmount: 0,
      creditReversalAmount: 0,
      creditType: paymentMode,
      paymentStatus,
      reason: 'Once Setup Day / Testing starts, ordinary refund is not allowed.',
    };
  }

  // Prior to Setup Day: 100% full refund of paid balance & credit reversal
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
 * DRAFT        → YES
 * READY        → YES (if before Setup Day)
 * TESTING      → depends on Setup Day (NO once Setup Day started)
 * SCHEDULED    → depends on Setup Day (NO once Setup Day started)
 * ACTIVE / LIVE → NO
 * COMPLETED / EXPIRED → NO
 * CANCELLED    → NO
 */
export function canCancelEvent(
  event: EventRecord | EventWithDetails,
  now: Date = new Date()
): EventCancellationEligibility {
  const rawStatus = (event.status || '').toLowerCase();
  const startsAtTime = new Date(event.starts_at).getTime();
  const expiresAtTime = new Date(event.expires_at).getTime();
  const nowTime = now.getTime();
  const setupStartTime = getSetupDayStartTime(event);
  const setupDayStarted = nowTime >= setupStartTime.getTime();

  const refundInfo = determineEventRefund(event, now);

  // Derive calculated status
  let calculatedStatus = rawStatus;
  if (rawStatus === 'cancelled') {
    calculatedStatus = 'cancelled';
  } else if (rawStatus === 'draft') {
    calculatedStatus = 'draft';
  } else if (nowTime >= expiresAtTime || rawStatus === 'expired' || rawStatus === 'completed') {
    calculatedStatus = 'expired';
  } else if (nowTime >= startsAtTime || rawStatus === 'live' || rawStatus === 'active') {
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
    paymentStatus: event.payment_status || 'UNPAID',
    refundPaidAmount: refundInfo.refundPaidAmount,
    creditReversalAmount: refundInfo.creditReversalAmount,
    creditType: refundInfo.creditType,
    canRefund: refundInfo.canRefund,
  };

  // 1. CANCELLED -> NO
  if (rawStatus === 'cancelled') {
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
  if (calculatedStatus === 'live' || rawStatus === 'live' || rawStatus === 'active' || (nowTime >= startsAtTime && nowTime < expiresAtTime)) {
    return {
      ...baseResult,
      canCancel: false,
      canRefund: false,
      reason: 'Active and live events cannot be cancelled.',
      code: 'EVENT_ACTIVE',
    };
  }

  // 4. DRAFT -> YES
  if (rawStatus === 'draft') {
    return {
      ...baseResult,
      canCancel: true,
      canRefund: refundInfo.canRefund,
      reason: 'Draft events can be cancelled at any time.',
      code: 'ELIGIBLE_FOR_CANCELLATION',
    };
  }

  // 5. READY / TESTING / SCHEDULED -> Depends on Setup Day
  // "Once Setup Day starts, ordinary cancellation/refund is not allowed."
  if (setupDayStarted) {
    return {
      ...baseResult,
      canCancel: false,
      canRefund: false,
      reason: 'Once Setup Day starts, ordinary cancellation/refund is not allowed.',
      code: 'SETUP_DAY_STARTED',
    };
  }

  // Prior to Setup Day:
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
    events = (eventsData || []) as EventRecord[];
  }
  if (events.length === 0) return [];

  // Fetch related game themes and games to enrich event list
  const themeIds = Array.from(new Set(events.map((e) => e.game_theme_id).filter(Boolean)));
  const { data: themesData } = await supabase
    .from('game_themes')
    .select('*, games(id, name, slug, game_type)')
    .in('id', themeIds);

  const themesMap = new Map<string, any>();
  if (themesData) {
    for (const t of themesData) {
      themesMap.set(t.id, t);
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
    const game = theme?.games || null;
    const calculated = calculateEventStatus(event);
    const showcase = showcaseMap.get(event.id) || null;
    const setupStartTime = getSetupDayStartTime(event);
    const cancellationEligibility = canCancelEvent(event);

    return {
      ...event,
      calculated_status: calculated,
      setup_starts_at: setupStartTime.toISOString(),
      cancellation_eligibility: cancellationEligibility,
      game_theme: theme,
      game: game
        ? {
            id: game.id,
            name: game.name,
            slug: game.slug,
            game_type: game.game_type || 'catch-brand',
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
  const supabase = getSupabaseServerClient(env);

  let eventRecord: EventRecord | null = null;
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
    eventRecord = (event as EventRecord) || null;
  }

  if (!eventRecord) return null;
  let theme: GameThemeRecord | null = null;
  let game: GameRecord | null = null;

  if (eventRecord.game_theme_id) {
    theme = await getThemeById(eventRecord.game_theme_id, env);
    if (theme && theme.game_id) {
      game = await getGameById(theme.game_id, env);
    }
  }

  const showcase = await getShowcaseByEventId(eventId, env);
  const setupStartTime = getSetupDayStartTime(eventRecord);
  const cancellationEligibility = canCancelEvent(eventRecord);

  return {
    ...eventRecord,
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
        }
      : null,
    showcase: showcase,
    showcase_status: showcase ? showcase.status : 'NOT_CREATED',
  };
}

/**
 * Public resolution endpoint: Get event by public token (no login required).
 */
export async function getEventByPublicToken(
  publicToken: string,
  env?: Record<string, any>
): Promise<EventWithDetails | null> {
  const supabase = getSupabaseServerClient(env);

  let eventRecord: EventRecord | null = null;
  const { data: event, error } = await supabase
    .from('events')
    .select('*')
    .eq('public_token', publicToken.trim().toUpperCase())
    .maybeSingle();

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000') {
      eventRecord = Array.from(localEventsCache.values()).find((e) => e.public_token === publicToken.trim().toUpperCase()) || null;
    } else {
      console.error('Error in getEventByPublicToken:', error);
      throw new Error(`Failed to get public event: ${error.message}`);
    }
  } else {
    eventRecord = (event as EventRecord) || null;
  }

  if (!eventRecord) return null;
  const theme = await getThemeById(eventRecord.game_theme_id, env);

  let game: GameRecord | null = null;
  if (theme?.game_id) {
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

  return {
    ...eventRecord,
    calculated_status: calculateEventStatus(eventRecord),
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
 * Create a new Event record in the database.
 * Verifies that the referenced Game Theme belongs to the same Organization (or is a system theme).
 */
export async function createEvent(
  params: {
    organization_id: string;
    game_theme_id: string;
    name: string;
    event_date?: string | null;
    starts_at: string;
    expires_at: string;
    status?: EventStatus;
    payment_status?: 'PAID' | 'UNPAID' | 'REFUNDED';
    payment_mode?: PaymentMode;
    paid_amount?: number;
    discount_amount?: number;
    created_by?: string | null;
  },
  env?: Record<string, any>
): Promise<EventRecord> {
  const supabase = getSupabaseServerClient(env);

  // 1. Verify organization isolation: The theme must belong to this organization or be a system theme!
  const theme = await getThemeById(params.game_theme_id, env);
  if (!theme) {
    throw new Error('Selected Game Theme not found');
  }

  if (theme.organization_id && theme.organization_id !== params.organization_id && !theme.is_system) {
    throw new Error('Security Error: Game Theme does not belong to your organization');
  }

  // 2. Validate time boundaries
  const startsAtTime = new Date(params.starts_at).getTime();
  const expiresAtTime = new Date(params.expires_at).getTime();

  if (isNaN(startsAtTime) || isNaN(expiresAtTime)) {
    throw new Error('Invalid start or expiry date/time');
  }

  if (expiresAtTime <= startsAtTime) {
    throw new Error('Expiry time must be later than start time');
  }

  // 3. Generate collision-resistant unique token
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
  const initialStatus = params.status || 'scheduled';

  const insertPayload: any = {
    id,
    organization_id: params.organization_id,
    game_theme_id: params.game_theme_id,
    name: params.name.trim(),
    event_date: params.event_date || params.starts_at.split('T')[0],
    starts_at: new Date(params.starts_at).toISOString(),
    expires_at: new Date(params.expires_at).toISOString(),
    status: initialStatus,
    public_token: token,
    created_by: params.created_by || null,
    payment_status: params.payment_status || 'PAID',
    payment_mode: params.payment_mode || 'FULL_PAID',
    paid_amount: params.paid_amount !== undefined ? params.paid_amount : STANDARD_EVENT_PRICE,
    discount_amount: params.discount_amount !== undefined ? params.discount_amount : 0.00,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('events')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000') {
      localEventsCache.set(insertPayload.id, insertPayload as EventRecord);
      return insertPayload as EventRecord;
    }
    console.error('Error in createEvent:', error);
    throw new Error(`Failed to create event: ${error.message}`);
  }

  localEventsCache.set((data as EventRecord).id, data as EventRecord);
  return data as EventRecord;
}

/**
 * Atomically create an Event and process wallet payment.
 *
 * ACID Transaction Pipeline:
 * 1. Validate Organization, Game Theme, and Date constraints.
 * 2. Calculate Event pricing & credit breakdown server-side.
 * 3. Enforce that the organization wallet has sufficient funds (rejection happens BEFORE event creation).
 * 4. Insert the Event record marked as PAID.
 * 5. Process atomic payment via immutable transaction ledger.
 * 6. If payment processing fails, immediately rollback (delete) the event record.
 */
export async function createEventWithAtomicPayment(
  params: {
    organization_id: string;
    game_theme_id: string;
    name: string;
    event_date?: string | null;
    starts_at: string;
    expires_at: string;
    status?: EventStatus;
    created_by?: string | null;
    payment_mode?: PaymentMode;
    topup_credit_requested?: number;
    event_price?: number;
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
  const {
    organization_id,
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

  const eventPrice = params.event_price && params.event_price > 0 ? params.event_price : STANDARD_EVENT_PRICE;

  // 1. Validate Theme & Organization Isolation
  const theme = await getThemeById(game_theme_id, env);
  if (!theme) {
    throw new Error('Selected Game Theme not found');
  }

  if (theme.organization_id && theme.organization_id !== organization_id && !theme.is_system) {
    throw new Error('Security Error: Game Theme does not belong to your organization');
  }

  // 2. Validate time boundaries
  const startsAtTime = new Date(starts_at).getTime();
  const expiresAtTime = new Date(expires_at).getTime();

  if (isNaN(startsAtTime) || isNaN(expiresAtTime)) {
    throw new Error('Invalid start or expiry date/time');
  }

  if (expiresAtTime <= startsAtTime) {
    throw new Error('Expiry time must be later than start time');
  }

  // 3. Server-side payment calculation and validation
  const calculation = await calculateEventPayment(
    eventPrice,
    payment_mode,
    organization_id,
    { topupCreditRequested: topup_credit_requested },
    env
  );

  if (!calculation.isPayable) {
    throw new Error(`Insufficient wallet balance: ${calculation.reasons.join(' ')}`);
  }

  // 4. Create the Event Record with PAID status & payment details
  const createdEventRecord = await createEvent(
    {
      organization_id,
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
    },
    env
  );

  // 5. Execute Atomic Ledger Payment
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

    // 6. Fetch fully enriched event
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
    // Automatic Rollback: Delete the orphan event record so user is never charged for an uncreated event
    await deleteEvent(createdEventRecord.id, env).catch((rollbackErr) => {
      console.error('CRITICAL: Failed to rollback event creation after payment error:', rollbackErr);
    });
    throw paymentError;
  }
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
    starts_at?: string;
    expires_at?: string;
    status?: EventStatus;
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

  if (updates.event_date !== undefined) {
    payload.event_date = updates.event_date;
  }

  if (updates.starts_at !== undefined) {
    payload.starts_at = new Date(updates.starts_at).toISOString();
  }

  if (updates.expires_at !== undefined) {
    payload.expires_at = new Date(updates.expires_at).toISOString();
  }

  if (updates.status !== undefined) {
    payload.status = updates.status;
  }

  // 2. If changing theme, verify organizational isolation
  if (updates.game_theme_id !== undefined && updates.game_theme_id !== existing.game_theme_id) {
    const newTheme = await getThemeById(updates.game_theme_id, env);
    if (!newTheme) {
      throw new Error('New Game Theme not found');
    }
    if (newTheme.organization_id !== existing.organization_id) {
      throw new Error('Security Error: Game Theme belongs to another organization');
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

  const updatePayload: any = {
    status: 'cancelled',
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
