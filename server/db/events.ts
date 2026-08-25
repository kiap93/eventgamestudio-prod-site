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
import { getThemeById, isUUID } from './themes.js';
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
import { getPlatformPricingSettings } from './platformSettings.js';
import crypto from 'node:crypto';

// In-memory cache fallback for mock / test environments
export const localEventsCache = new Map<string, EventRecord>();

/**
 * Calculates current real-time status of an event based on time windows and payment status.
 */
export function calculateEventStatus(
  event: {
    status: EventStatus | string;
    starts_at: string;
    expires_at: string;
    setup_starts_at?: string | null;
    payment_status?: string | null;
  },
  now: Date = new Date()
): EventStatus {
  const rawStatus = (event.status || '').toLowerCase();
  if (rawStatus === 'cancelled') return 'cancelled';

  // PENDING_PAYMENT events NEVER automatically expire
  const payStatus = (event.payment_status || '').toUpperCase();
  if (rawStatus === 'pending_payment' || payStatus === 'PENDING_PAYMENT' || payStatus === 'UNPAID') {
    return 'pending_payment';
  }

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
    events = ((eventsData || []) as EventRecord[]).map((ev) => {
      const cached = localEventsCache.get(ev.id);
      if (cached) {
        return {
          ...cached,
          ...ev,
          game_id: cached.game_id || ev.game_id,
          status: cached.status || ev.status,
          payment_status: cached.payment_status || ev.payment_status,
          payment_mode: cached.payment_mode || ev.payment_mode,
          paid_amount: cached.paid_amount !== undefined ? cached.paid_amount : ev.paid_amount,
          event_price: cached.event_price || ev.event_price,
          event_currency: cached.event_currency || ev.event_currency,
        };
      }
      return ev;
    });
  }
  if (events.length === 0) return [];

  // Fetch related game themes to enrich event list
  const themeIds = Array.from(new Set(events.map((e) => e.game_theme_id).filter(Boolean)));
  const { data: themesData } = await supabase
    .from('game_themes')
    .select('*, games(id, name, slug, game_type, status, description, icon_name)')
    .in('id', themeIds);

  const themesMap = new Map<string, any>();
  if (themesData) {
    for (const t of themesData) {
      themesMap.set(t.id, t);
    }
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

    return {
      ...event,
      game_id: event.game_id || theme?.game_id || resolvedGame?.id || null,
      event_price: storedPrice,
      event_currency: event.event_currency || 'MYR',
      payment_status: paymentStatus,
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

  // If not a valid UUID string, check local cache directly without querying Supabase to avoid 22P02 Postgres syntax error
  if (!isUUID(eventId)) {
    const localEvent = localEventsCache.get(eventId) || null;
    if (!localEvent) return null;
  }

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
    const cached = localEventsCache.get(eventId);
    if (cached) {
      eventRecord = {
        ...cached,
        ...(event as EventRecord),
        game_id: cached.game_id || (event as EventRecord).game_id,
        status: cached.status || (event as EventRecord).status,
        payment_status: cached.payment_status || (event as EventRecord).payment_status,
        payment_mode: cached.payment_mode || (event as EventRecord).payment_mode,
        paid_amount: cached.paid_amount !== undefined ? cached.paid_amount : (event as EventRecord).paid_amount,
        event_price: cached.event_price || (event as EventRecord).event_price,
        event_currency: cached.event_currency || (event as EventRecord).event_currency,
      };
    } else {
      eventRecord = (event as EventRecord) || null;
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

  return {
    ...eventRecord,
    game_id: eventRecord.game_id || theme?.game_id || game?.id || null,
    event_price: storedPrice,
    event_currency: eventRecord.event_currency || 'MYR',
    payment_status: paymentStatus,
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
 * By default, enforces strict public safety: ONLY returns PAID, non-cancelled events.
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
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000') {
      eventRecord = Array.from(localEventsCache.values()).find((e) => e.public_token === publicToken.trim().toUpperCase()) || null;
    } else {
      console.error('Error in getEventByPublicToken:', error);
      throw new Error(`Failed to get public event: ${error.message}`);
    }
  } else {
    const raw = (event as EventRecord) || null;
    if (raw) {
      const cached = localEventsCache.get(raw.id) || Array.from(localEventsCache.values()).find((e) => e.public_token === publicToken.trim().toUpperCase());
      if (cached) {
        eventRecord = {
          ...cached,
          ...raw,
          status: cached.status || raw.status,
          payment_status: cached.payment_status || raw.payment_status,
          payment_mode: cached.payment_mode || raw.payment_mode,
          paid_amount: cached.paid_amount !== undefined ? cached.paid_amount : raw.paid_amount,
          event_price: cached.event_price || raw.event_price,
          event_currency: cached.event_currency || raw.event_currency,
        };
      } else {
        eventRecord = raw;
      }
    }
  }

  if (!eventRecord) return null;

  const paymentStatus = eventRecord.payment_status || (eventRecord.status === 'pending_payment' ? 'PENDING_PAYMENT' : 'PAID');
  const isPaid = paymentStatus === 'PAID';

  // Strict Public Guard: Do NOT resolve unpaid or pending-payment events on public routes unless explicitly permitted
  if (!options?.allowUnpaid) {
    if (!isPaid || eventRecord.status === 'pending_payment' || eventRecord.status === 'cancelled') {
      return null;
    }
  }

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

  const storedPrice = eventRecord.event_price !== undefined && eventRecord.event_price !== null
    ? Number(eventRecord.event_price)
    : (eventRecord.paid_amount !== undefined && eventRecord.paid_amount !== null ? Number(eventRecord.paid_amount) : 1400.00);

  return {
    ...eventRecord,
    event_price: storedPrice,
    event_currency: eventRecord.event_currency || 'MYR',
    payment_status: paymentStatus,
    payment_mode: eventRecord.payment_mode || (isPaid ? 'FULL_PAID' : undefined),
    paid_amount: eventRecord.paid_amount !== undefined ? eventRecord.paid_amount : (isPaid ? storedPrice : 0),
    discount_amount: eventRecord.discount_amount || 0,
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
    starts_at: string;
    expires_at: string;
    status?: EventStatus;
    payment_status?: 'PAID' | 'UNPAID' | 'REFUNDED' | 'PENDING_PAYMENT';
    payment_mode?: PaymentMode;
    paid_amount?: number;
    discount_amount?: number;
    event_price?: number;
    event_currency?: string;
    created_by?: string | null;
    skipPendingLimitCheck?: boolean;
  },
  env?: Record<string, any>
): Promise<EventRecord> {
  const supabase = getSupabaseServerClient(env);

  // 1. Verify organization isolation: The theme must exist and belong to this organization or be a system theme!
  const theme = await getThemeById(params.game_theme_id, env);
  if (!theme) {
    const err: any = new Error('Selected Game Theme not found');
    err.status = 404;
    throw err;
  }

  if (theme.organization_id && theme.organization_id !== params.organization_id && !theme.is_system) {
    const err: any = new Error('Security Error: Game Theme does not belong to your organization');
    err.status = 403;
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

  // 3. Validate time boundaries
  const startsAtTime = new Date(params.starts_at).getTime();
  const expiresAtTime = new Date(params.expires_at).getTime();

  if (isNaN(startsAtTime) || isNaN(expiresAtTime)) {
    throw new Error('Invalid start or expiry date/time');
  }

  if (expiresAtTime <= startsAtTime) {
    throw new Error('Expiry time must be later than start time');
  }

  // 4. Enforce maximum 2 PENDING_PAYMENT events limit per organization
  const isPending = (params.payment_status || 'PENDING_PAYMENT') === 'PENDING_PAYMENT' ||
    params.payment_status === 'UNPAID' ||
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

  // 5. Resolve server-authoritative event pricing if not supplied
  let price = params.event_price;
  let currency = params.event_currency || 'MYR';
  if (!price || price <= 0) {
    const defaultPricing = await getPlatformPricingSettings(env);
    price = defaultPricing.default_price;
    currency = defaultPricing.default_currency;
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
  const initialStatus: EventStatus = params.status || (isPending ? 'pending_payment' : 'scheduled');
  const initialPaymentStatus = params.payment_status || (isPending ? 'PENDING_PAYMENT' : 'PAID');
  const safePaidAmount = params.paid_amount !== undefined ? params.paid_amount : (initialPaymentStatus === 'PAID' ? price : 0);

  const dbPayload: any = {
    id,
    organization_id: params.organization_id,
    game_id: targetGameId,
    game_theme_id: params.game_theme_id,
    name: params.name.trim(),
    event_date: params.event_date || params.starts_at.split('T')[0],
    starts_at: new Date(params.starts_at).toISOString(),
    expires_at: new Date(params.expires_at).toISOString(),
    status: initialStatus,
    payment_status: initialPaymentStatus,
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
        event_date: params.event_date || params.starts_at.split('T')[0],
        starts_at: new Date(params.starts_at).toISOString(),
        expires_at: new Date(params.expires_at).toISOString(),
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
      }
    }

    if (error) {
      if (error.message?.includes('Placeholder') || error.code === 'PGRST000') {
        const fullRecord: EventRecord = {
          ...dbPayload,
          payment_status: initialPaymentStatus,
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
    payment_status: initialPaymentStatus,
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
    starts_at: string;
    expires_at: string;
    status?: EventStatus;
    created_by?: string | null;
    payment_mode?: PaymentMode;
    topup_credit_requested?: number;
    event_price?: number;
    event_currency?: string;
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

    // Resolve server-authoritative event pricing
    let eventPrice = params.event_price;
    let eventCurrency = params.event_currency || 'MYR';
    if (!eventPrice || eventPrice <= 0) {
      const platformPricing = await getPlatformPricingSettings(env);
      eventPrice = platformPricing.default_price;
      eventCurrency = platformPricing.default_currency;
    }

    // 1. Validate Theme & Organization Isolation
    const theme = await getThemeById(game_theme_id, env);
    if (!theme) {
      throw new Error('Selected Game Theme not found');
    }

    if (theme.organization_id && theme.organization_id !== organization_id && !theme.is_system) {
      throw new Error('Security Error: Game Theme does not belong to your organization');
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

  const themesMap = new Map<string, any>();
  if (themesData) {
    for (const t of themesData) {
      themesMap.set(t.id, t);
    }
  }

  return events.map((event) => {
    const org = orgsMap.get(event.organization_id);
    const theme = themesMap.get(event.game_theme_id) || null;
    const game = theme?.games || null;
    const calculated = calculateEventStatus(event);
    const storedPrice = event.event_price !== undefined && event.event_price !== null
      ? Number(event.event_price)
      : (event.paid_amount !== undefined && event.paid_amount !== null ? Number(event.paid_amount) : 1400.00);

    return {
      ...event,
      event_price: storedPrice,
      event_currency: event.event_currency || 'MYR',
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
