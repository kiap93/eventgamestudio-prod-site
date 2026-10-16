import crypto from 'node:crypto';
import { getSupabaseServerClient, isLocalFallbackAllowed } from '../supabase.js';
import { executeWithResilience } from './supabaseResilience.js';
import {
  getEventById,
  getNormalizedEventDates,
  getNormalizedCurrentDate,
  PLATFORM_BUSINESS_TIMEZONE,
  isEventExplicitlyCancelled,
  resolveEventTimezone,
} from './events.js';
import { getOrganizationById } from './organizations.js';
import { getUserById } from './users.js';
import { getGameById } from './games.js';
import {
  calculateEventCalendarDays,
  getPlatformInvoiceSettings,
  DEFAULT_SELLER_INVOICE_SETTINGS,
  PlatformInvoiceSettings,
} from './platformSettings.js';
import { toCents, fromCents, getWalletTransactions } from './wallet.js';
import { generateInvoicePdf, InvoicePdfData } from '../invoices/pdfGenerator.js';
import { generateInvoiceEmail } from '../email/invoiceEmailTemplate.js';
import { sendEmailViaResend } from '../email/resend.js';

export interface InvoiceRecord {
  id: string;
  invoice_number: string;
  event_id: string;
  organization_id: string;
  customer_user_id: string | null;
  status: 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'void' | 'cancelled';
  currency: string;
  subtotal: number;
  discount_amount: number;
  welcome_credit_amount: number;
  showcase_credit_amount?: number;
  topup_credit_amount?: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  outstanding_balance: number;
  issue_date: string;
  due_date: string;
  seller_details: Record<string, any>;
  customer_details: Record<string, any>;
  event_details: Record<string, any>;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  pdf_path: string | null;
  pdf_status: 'pending' | 'generated' | 'failed';
  pdf_generated_at: string | null;
  email_status: 'pending' | 'sent' | 'failed' | 'skipped';
  email_sent_at: string | null;
  email_error: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditNoteRecord {
  id: string;
  credit_note_number: string;
  invoice_id: string;
  event_id: string;
  organization_id: string;
  currency: string;
  amount: number;
  reason: string;
  status: 'issued' | 'applied' | 'void';
  issued_by: string | null;
  created_at: string;
}

export interface InvoiceAuditLogRecord {
  id: string;
  invoice_id: string;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  details: Record<string, any>;
  created_at: string;
}

export interface GenerateInvoiceResult {
  invoice: InvoiceRecord;
  created: boolean;
  pdfGenerated: boolean;
  emailSent: boolean;
}

export interface ListInvoicesOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  organizationId?: string;
  startDate?: string;
  endDate?: string;
}

// In-memory fallback caches for development, testing, and offline modes
export const localInvoicesCache = new Map<string, InvoiceRecord>();
export const localInvoicePdfs = new Map<string, Uint8Array>();
export const localCreditNotesCache = new Map<string, CreditNoteRecord>();
export const localInvoiceAuditLogs = new Map<string, InvoiceAuditLogRecord[]>();

let localInvoiceCounter = 1;
let localCreditNoteCounter = 1;

export function resetLocalInvoicesForTesting(): void {
  localInvoicesCache.clear();
  localInvoicePdfs.clear();
  localCreditNotesCache.clear();
  localInvoiceAuditLogs.clear();
  localInvoiceCounter = 1;
  localCreditNoteCounter = 1;
}

/**
 * Standard seller registered business details for Event Game Studio (legacy constant re-exported)
 */
export const DEFAULT_SELLER_DETAILS = DEFAULT_SELLER_INVOICE_SETTINGS;

/**
 * Generates an atomic sequential invoice number in canonical format:
 * INV-YYYY-NNNNN (e.g. INV-2026-00001)
 */
export async function generateInvoiceNumber(
  env?: Record<string, any>,
  year: number = new Date().getFullYear()
): Promise<string> {
  const supabase = getSupabaseServerClient(env);
  const prefix = `INV-${year}-`;

  if (!isLocalFallbackAllowed(env)) {
    try {
      // 1. Preferred: Call atomic database function next_invoice_number(p_year)
      const { data: rpcNumber, error: rpcError } = await supabase.rpc('next_invoice_number', {
        p_year: year,
      });

      if (!rpcError && typeof rpcNumber === 'string' && rpcNumber.startsWith(prefix)) {
        return rpcNumber;
      }
    } catch {
      // Fall through to query approach
    }

    try {
      // 2. Query highest invoice number for this year and increment
      const { data, error } = await supabase
        .from('invoices')
        .select('invoice_number')
        .like('invoice_number', `${prefix}%`)
        .order('invoice_number', { ascending: false })
        .limit(1);

      if (!error && Array.isArray(data) && data.length > 0 && data[0].invoice_number) {
        const lastNum = data[0].invoice_number;
        const match = lastNum.match(/^INV-\d{4}-(\d+)$/);
        if (match) {
          const nextSeq = parseInt(match[1], 10) + 1;
          return `${prefix}${nextSeq.toString().padStart(5, '0')}`;
        }
      } else if (!error) {
        return `${prefix}00001`;
      }
    } catch {
      // Fall through to local monotonic counter
    }
  }

  // Fallback calculation using local cache count for that year
  let maxFound = 0;
  for (const inv of localInvoicesCache.values()) {
    if (inv.invoice_number.startsWith(prefix)) {
      const match = inv.invoice_number.match(/^INV-\d{4}-(\d+)$/);
      if (match) {
        maxFound = Math.max(maxFound, parseInt(match[1], 10));
      }
    }
  }
  const nextNumber = Math.max(localInvoiceCounter, maxFound + 1);
  localInvoiceCounter = nextNumber + 1;
  return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
}

/**
 * Generates an atomic sequential credit note number:
 * CN-YYYY-NNNNN (e.g. CN-2026-00001)
 */
export async function generateCreditNoteNumber(
  env?: Record<string, any>,
  year: number = new Date().getFullYear()
): Promise<string> {
  const supabase = getSupabaseServerClient(env);
  const prefix = `CN-${year}-`;

  if (!isLocalFallbackAllowed(env)) {
    try {
      const { data: rpcNumber, error: rpcError } = await supabase.rpc('next_credit_note_number', {
        p_year: year,
      });

      if (!rpcError && typeof rpcNumber === 'string' && rpcNumber.startsWith(prefix)) {
        return rpcNumber;
      }
    } catch {
      // Fall through
    }

    try {
      const { data, error } = await supabase
        .from('credit_notes')
        .select('credit_note_number')
        .like('credit_note_number', `${prefix}%`)
        .order('credit_note_number', { ascending: false })
        .limit(1);

      if (!error && Array.isArray(data) && data.length > 0 && data[0].credit_note_number) {
        const lastNum = data[0].credit_note_number;
        const match = lastNum.match(/^CN-\d{4}-(\d+)$/);
        if (match) {
          const nextSeq = parseInt(match[1], 10) + 1;
          return `${prefix}${nextSeq.toString().padStart(5, '0')}`;
        }
      } else if (!error) {
        return `${prefix}00001`;
      }
    } catch {
      // Fall through
    }
  }

  let maxFound = 0;
  for (const cn of localCreditNotesCache.values()) {
    if (cn.credit_note_number.startsWith(prefix)) {
      const match = cn.credit_note_number.match(/^CN-\d{4}-(\d+)$/);
      if (match) {
        maxFound = Math.max(maxFound, parseInt(match[1], 10));
      }
    }
  }
  const nextNumber = Math.max(localCreditNoteCounter, maxFound + 1);
  localCreditNoteCounter = nextNumber + 1;
  return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
}

/**
 * Retrieves an invoice by event ID.
 * Returns null if no invoice exists yet.
 */
export async function getInvoiceByEventId(
  eventId: string,
  env?: Record<string, any>
): Promise<InvoiceRecord | null> {
  const supabase = getSupabaseServerClient(env);

  try {
    const res = await executeWithResilience(
      async () => {
        return await supabase
          .from('invoices')
          .select('*')
          .eq('event_id', eventId)
          .maybeSingle();
      },
      {
        operation: 'getInvoiceByEventId',
        env,
        maxRetries: 2,
        initialDelayMs: 150,
      }
    );

    if (res?.data) {
      return res.data as InvoiceRecord;
    }
  } catch (err: any) {
    if (!isLocalFallbackAllowed(env) && !err.message?.includes('Placeholder') && err.code !== 'PGRST000') {
      console.warn(`[Invoices] Database query failed for event ${eventId}:`, err?.message || err);
    }
  }

  // Check local cache
  for (const inv of localInvoicesCache.values()) {
    if (inv.event_id === eventId) {
      return inv;
    }
  }

  return null;
}

/**
 * Retrieves an invoice by its unique invoice ID.
 */
export async function getInvoiceById(
  invoiceId: string,
  env?: Record<string, any>
): Promise<InvoiceRecord | null> {
  const supabase = getSupabaseServerClient(env);

  try {
    const res = await executeWithResilience(
      async () => {
        return await supabase
          .from('invoices')
          .select('*')
          .eq('id', invoiceId)
          .maybeSingle();
      },
      {
        operation: 'getInvoiceById',
        env,
        maxRetries: 2,
        initialDelayMs: 150,
      }
    );

    if (res?.data) {
      return res.data as InvoiceRecord;
    }
  } catch (err: any) {
    if (!isLocalFallbackAllowed(env) && !err.message?.includes('Placeholder') && err.code !== 'PGRST000') {
      console.warn(`[Invoices] Database query failed for invoice ${invoiceId}:`, err?.message || err);
    }
  }

  return localInvoicesCache.get(invoiceId) || null;
}

/**
 * Retrieves PDF bytes for a given invoice (by invoiceId or eventId).
 */
export async function getInvoicePdfBytes(
  invoiceOrId: string | InvoiceRecord,
  env?: Record<string, any>
): Promise<Uint8Array | null> {
  const isRecord = typeof invoiceOrId === 'object' && invoiceOrId !== null && 'id' in invoiceOrId;
  const invoiceIdOrEventId = isRecord ? (invoiceOrId as InvoiceRecord).id : (invoiceOrId as string);

  // Check in-memory store
  if (localInvoicePdfs.has(invoiceIdOrEventId)) {
    return localInvoicePdfs.get(invoiceIdOrEventId)!;
  }

  // Look up invoice record
  let invoice: InvoiceRecord | null = isRecord ? (invoiceOrId as InvoiceRecord) : null;
  if (!invoice) {
    invoice = await getInvoiceById(invoiceIdOrEventId, env);
    if (!invoice) {
      invoice = await getInvoiceByEventId(invoiceIdOrEventId, env);
    }
  }

  if (!invoice) {
    return null;
  }

  if (localInvoicePdfs.has(invoice.id)) {
    return localInvoicePdfs.get(invoice.id)!;
  }

  // Check Supabase Storage if pdf_path is available
  const supabase = getSupabaseServerClient(env);
  if (invoice.pdf_path && !isLocalFallbackAllowed(env)) {
    try {
      const storageKey = invoice.pdf_path.replace(/^\/+/, '').replace(/^invoices\/+/, '');
      const { data, error } = await supabase.storage.from('invoices').download(storageKey);
      if (!error && data) {
        const arrayBuf = await data.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        localInvoicePdfs.set(invoice.id, bytes);
        localInvoicePdfs.set(invoice.event_id, bytes);
        return bytes;
      }
    } catch {
      // Fall through to on-the-fly generation
    }
  }

  // Generate on-the-fly
  const pdfData = formatInvoicePdfData(invoice);
  const bytes = generateInvoicePdf(pdfData);
  localInvoicePdfs.set(invoice.id, bytes);
  localInvoicePdfs.set(invoice.event_id, bytes);
  return bytes;
}

/**
 * Lists all invoices for a given organization.
 */
export async function listInvoicesByOrganization(
  organizationId: string,
  env?: Record<string, any>
): Promise<InvoiceRecord[]> {
  const supabase = getSupabaseServerClient(env);

  try {
    const res = await executeWithResilience(
      async () => {
        return await supabase
          .from('invoices')
          .select('*')
          .eq('organization_id', organizationId)
          .order('issue_date', { ascending: false });
      },
      {
        operation: 'listInvoicesByOrganization',
        env,
        maxRetries: 2,
        initialDelayMs: 150,
      }
    );

    if (res?.data) {
      return res.data as InvoiceRecord[];
    }
  } catch (err: any) {
    if (!isLocalFallbackAllowed(env) && !err.message?.includes('Placeholder') && err.code !== 'PGRST000') {
      console.warn(`[Invoices] Query listInvoicesByOrganization failed:`, err?.message || err);
    }
  }

  const result: InvoiceRecord[] = [];
  const seenIds = new Set<string>();
  for (const inv of localInvoicesCache.values()) {
    if (inv.organization_id === organizationId && !seenIds.has(inv.id)) {
      seenIds.add(inv.id);
      result.push(inv);
    }
  }
  return result.sort((a, b) => new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime());
}

/**
 * Lists all platform invoices for Developer Admin with search, pagination, and filter parameters.
 */
export async function listAllInvoicesForDeveloper(
  options: ListInvoicesOptions = {},
  env?: Record<string, any>
): Promise<{
  data: InvoiceRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}> {
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize || 25));
  const offset = (page - 1) * pageSize;

  const supabase = getSupabaseServerClient(env);

  try {
    let query = supabase.from('invoices').select('*', { count: 'exact' });

    if (options.status) {
      query = query.eq('status', options.status);
    }
    if (options.organizationId) {
      query = query.eq('organization_id', options.organizationId);
    }
    if (options.startDate) {
      query = query.gte('issue_date', options.startDate);
    }
    if (options.endDate) {
      query = query.lte('issue_date', options.endDate);
    }
    if (options.search) {
      query = query.ilike('invoice_number', `%${options.search.trim()}%`);
    }

    query = query.order('issue_date', { ascending: false }).range(offset, offset + pageSize - 1);

    const res = await executeWithResilience(
      async () => await query,
      {
        operation: 'listAllInvoicesForDeveloper',
        env,
        maxRetries: 2,
        initialDelayMs: 150,
      }
    );

    if (res?.data && res.count !== null) {
      const total = res.count || 0;
      return {
        data: res.data as InvoiceRecord[],
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize) || 1,
        },
      };
    }
  } catch (err: any) {
    if (!isLocalFallbackAllowed(env) && !err.message?.includes('Placeholder') && err.code !== 'PGRST000') {
      console.warn(`[Invoices] listAllInvoicesForDeveloper database query failed:`, err?.message || err);
    }
  }

  // Local fallback
  let items: InvoiceRecord[] = [];
  const seenIds = new Set<string>();
  for (const inv of localInvoicesCache.values()) {
    if (!seenIds.has(inv.id)) {
      seenIds.add(inv.id);
      items.push(inv);
    }
  }

  if (options.status) {
    items = items.filter((inv) => inv.status === options.status);
  }
  if (options.organizationId) {
    items = items.filter((inv) => inv.organization_id === options.organizationId);
  }
  if (options.startDate) {
    items = items.filter((inv) => inv.issue_date >= options.startDate!);
  }
  if (options.endDate) {
    items = items.filter((inv) => inv.issue_date <= options.endDate!);
  }
  if (options.search) {
    const q = options.search.toLowerCase();
    items = items.filter(
      (inv) =>
        inv.invoice_number.toLowerCase().includes(q) ||
        (inv.customer_details?.organization_name || '').toLowerCase().includes(q)
    );
  }

  items.sort((a, b) => new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime());
  const total = items.length;
  const paged = items.slice(offset, offset + pageSize);

  return {
    data: paged,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
  };
}

/**
 * Converts an InvoiceRecord into InvoicePdfData for vector rendering.
 */
function formatInvoicePdfData(invoice: InvoiceRecord): InvoicePdfData {
  return {
    invoice_number: invoice.invoice_number,
    issue_date: invoice.issue_date ? invoice.issue_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    due_date: invoice.due_date ? invoice.due_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    status: invoice.status,
    currency: invoice.currency,
    subtotal: Number(invoice.subtotal),
    discount_amount: Number(invoice.discount_amount),
    welcome_credit_amount: Number(invoice.welcome_credit_amount || 0),
    tax_rate: Number(invoice.tax_rate || 0),
    tax_amount: Number(invoice.tax_amount || 0),
    total_amount: Number(invoice.total_amount),
    amount_paid: Number(invoice.amount_paid),
    outstanding_balance: Number(invoice.outstanding_balance),
    seller_details: invoice.seller_details || DEFAULT_SELLER_INVOICE_SETTINGS,
    customer_details: invoice.customer_details || {},
    event_details: invoice.event_details || {},
    line_items: invoice.line_items || [],
    notes: invoice.notes,
  };
}

/**
 * Checks whether an event is eligible for invoice generation.
 *
 * Rules:
 * - Event must exist.
 * - Event must NOT be cancelled (cancelled events cannot be invoiced).
 * - Event MUST have concluded according to its business timezone (curDate > endDate),
 *   OR already marked COMPLETED/EXPIRED.
 */
export function isEventEligibleForInvoicing(
  event: any,
  now: Date = new Date()
): { eligible: boolean; reason?: string } {
  if (!event) {
    return { eligible: false, reason: 'Event not found' };
  }

  const rawStatus = (event.status || '').toLowerCase();
  const eventStatus = (event.event_status || '').toUpperCase();
  const payStatus = (event.payment_status || '').toUpperCase();
  const isCancelled =
    isEventExplicitlyCancelled(event) ||
    rawStatus === 'cancelled' ||
    eventStatus === 'CANCELLED' ||
    payStatus === 'REFUNDED' ||
    Boolean(event.cancel_reason && event.cancel_reason !== 'PAYMENT_TIMEOUT');

  if (isCancelled) {
    return { eligible: false, reason: 'Event is cancelled. Invoices cannot be issued for cancelled events.' };
  }

  if (payStatus !== 'PAID') {
    return { eligible: false, reason: 'Event is unpaid. Invoices can only be issued for paid events.' };
  }


  const { endDate } = getNormalizedEventDates(event);
  const evTimezone = resolveEventTimezone(event);
  const curDate = getNormalizedCurrentDate(now, evTimezone);

  const isAfterEndDate = Boolean(endDate && curDate > endDate);
  const isCompletedOrExpired =
    event.event_status === 'COMPLETED' ||
    event.status === 'completed' ||
    event.event_status === 'EXPIRED' ||
    event.status === 'expired';

  if (!isAfterEndDate && !isCompletedOrExpired) {
    return {
      eligible: false,
      reason: `Event has not ended yet. Scheduled end date is ${endDate} (${evTimezone}). Invoices are automatically generated once the event concludes.`,
    };
  }

  return { eligible: true };
}

/**
 * Generates an official event invoice automatically and idempotently.
 *
 * Requirements:
 * 1. Checks if event exists and belongs to organization.
 * 2. Idempotent check: If already invoiced, returns existing invoice record immediately without duplicate creation.
 * 3. Enforces eligibility: rejects cancelled events or events that have not concluded.
 * 4. Authoritative price & currency: requires confirmed price and currency; never silently falls back.
 * 5. Reconciles actual wallet ledger transactions for Welcome Credit, Showcase Credit, Topup Credit, and Paid Balance.
 * 6. Strict decimal-safe monetary arithmetic: Subtotal - Discounts + Taxes = Total; Total - PaymentsReceived = OutstandingBalance.
 * 7. Generates high-fidelity PDF and persists record.
 * 8. Dispatches notification email to organization owner.
 * 9. Records audit log.
 */
export async function generateEventInvoice(
  eventId: string,
  env?: Record<string, any>,
  options?: {
    force?: boolean;
    dryRun?: boolean;
    bypassEmail?: boolean;
    now?: Date;
    actorId?: string;
    actorEmail?: string;
  }
): Promise<GenerateInvoiceResult> {
  const now = options?.now || new Date();
  const nowIso = now.toISOString();

  // 1. Fetch Event
  const event = await getEventById(eventId, env);
  if (!event) {
    throw new Error(`Event ${eventId} not found.`);
  }

  // 2. Idempotency Check: if invoice already exists, retrieve and return it
  const existingInvoice = await getInvoiceByEventId(eventId, env);
  if (existingInvoice && !options?.force) {
    return {
      invoice: existingInvoice,
      created: false,
      pdfGenerated: existingInvoice.pdf_status === 'generated',
      emailSent: existingInvoice.email_status === 'sent',
    };
  }

  // 3. Strict Authoritative Price & Currency Validation (Do not silently invent charge or currency)
  const rawPrice = event.event_price;
  const eventPrice = Number(rawPrice);
  const eventCurrency = typeof event.event_currency === 'string' ? event.event_currency.trim().toUpperCase() : '';

  if (rawPrice === undefined || rawPrice === null || isNaN(eventPrice) || eventPrice <= 0 || !eventCurrency) {
    throw new Error(
      `Pricing configuration error: Event ${eventId} is missing a confirmed authoritative price or currency. Cannot generate invoice.`
    );
  }

  // 4. Eligibility Check
  const eligibility = isEventEligibleForInvoicing(event, now);
  if (!eligibility.eligible && !options?.force) {
    throw new Error(`Event ${eventId} is not eligible for invoicing: ${eligibility.reason}`);
  }

  // 5. Fetch Organization, Customer Details & Seller Settings
  const organization = await getOrganizationById(event.organization_id, env);
  const creatorUser = event.created_by ? await getUserById(event.created_by, env) : null;
  const ownerUser = organization?.owner_id ? await getUserById(organization.owner_id, env) : null;
  const customerUser = creatorUser || ownerUser;
  const sellerSettings = await getPlatformInvoiceSettings(env);

  // 6. Fetch Game Info & Duration
  let gameTitle = 'Interactive Mini-Game';
  if (event.game_id) {
    try {
      const g = await getGameById(event.game_id, env);
      if (g) gameTitle = g.name || g.slug;
    } catch {
      // Keep default
    }
  }

  const { startDate, endDate } = getNormalizedEventDates(event);
  const durationDays = calculateEventCalendarDays(startDate, endDate) || 1;
  const evTimezone = resolveEventTimezone(event) || PLATFORM_BUSINESS_TIMEZONE;

  // 7. Reconcile Actual Payments and Credits from Wallet Transactions
  let welcomeCreditUsed = 0.00;
  let showcaseCreditUsed = 0.00;
  let topupCreditUsed = 0.00;
  let paidBalanceUsed = 0.00;
  let refundsIssued = 0.00;
  let otherDiscount = 0.00;

  try {
    const { transactions: orgTxns } = await getWalletTransactions(event.organization_id, undefined, env);
    const eventTxns = orgTxns.filter((t) => {
      const matchesEvent =
        t.event_id === event.id ||
        t.reference_id === event.id ||
        t.metadata?.event_id === event.id;
      const statusStr = String(t.status || '').toUpperCase();
      const isSuccessful =
        !t.status ||
        statusStr === 'COMPLETED' ||
        statusStr === 'SUCCESS' ||
        statusStr === 'SUCCEEDED';
      return matchesEvent && isSuccessful;
    });

    if (eventTxns.length > 0) {
      for (const t of eventTxns) {
        const rawAny = t as any;
        const amt = Math.abs(Number(t.amount || 0));
        const subType = rawAny.sub_type ? String(rawAny.sub_type).toUpperCase() : '';
        const balanceType =
          t.balance_type ||
          (subType.includes('WELCOME')
            ? 'WELCOME_CREDIT'
            : subType.includes('SHOWCASE')
            ? 'SHOWCASE_CREDIT'
            : subType.includes('TOPUP')
            ? 'TOPUP_CREDIT'
            : undefined);
        const txnType = String(t.transaction_type || '').toUpperCase();
        const isCredit =
          txnType === 'CREDIT_USAGE' ||
          Boolean(balanceType && balanceType.includes('CREDIT')) ||
          subType.includes('CREDIT');

        if (isCredit) {
          if (balanceType === 'WELCOME_CREDIT') {
            welcomeCreditUsed = fromCents(toCents(welcomeCreditUsed) + toCents(amt));
          } else if (balanceType === 'SHOWCASE_CREDIT') {
            showcaseCreditUsed = fromCents(toCents(showcaseCreditUsed) + toCents(amt));
          } else if (balanceType === 'TOPUP_CREDIT') {
            topupCreditUsed = fromCents(toCents(topupCreditUsed) + toCents(amt));
          } else {
            otherDiscount = fromCents(toCents(otherDiscount) + toCents(amt));
          }
        } else if (
          (txnType === 'EVENT_PAYMENT' || txnType === 'EVENT_CREATION') &&
          (balanceType === 'PAID_BALANCE' || !balanceType)
        ) {
          paidBalanceUsed = fromCents(toCents(paidBalanceUsed) + toCents(amt));
        } else if (t.transaction_type === 'REFUND' || t.transaction_type === 'CREDIT_REVERSAL') {
          refundsIssued = fromCents(toCents(refundsIssued) + toCents(amt));
        }
      }
    }
  } catch (txnErr) {
    console.warn(`[Invoices] Notice: Could not query wallet transactions for event ${eventId}:`, txnErr);
  }

  // Fallback to event record snapshot if no transactions were logged
  if (welcomeCreditUsed === 0 && showcaseCreditUsed === 0 && topupCreditUsed === 0 && otherDiscount === 0) {
    const rawDiscount = Math.max(0, Number(event.discount_amount || 0));
    if (rawDiscount > 0) {
      if (event.payment_mode === 'WELCOME_CREDIT') {
        welcomeCreditUsed = Math.min(rawDiscount, 800.00);
      } else if (event.payment_mode === 'SHOWCASE_CREDIT') {
        showcaseCreditUsed = Math.min(rawDiscount, 300.00);
      } else if (event.payment_mode === 'TOPUP_CREDIT') {
        topupCreditUsed = rawDiscount;
      } else {
        otherDiscount = rawDiscount;
      }
    }
  }

  // 8. Decimal-safe monetary calculation
  const currency = eventCurrency;
  const subtotal = fromCents(toCents(eventPrice));
  const discountAmount = fromCents(
    toCents(welcomeCreditUsed) +
    toCents(showcaseCreditUsed) +
    toCents(topupCreditUsed) +
    toCents(otherDiscount)
  );

  const taxRate = sellerSettings.default_tax_rate || 0.00;
  const taxableAmount = Math.max(0, fromCents(toCents(subtotal) - toCents(discountAmount)));
  const taxAmount = fromCents(Math.round(toCents(taxableAmount) * taxRate));
  const totalAmount = fromCents(Math.max(0, toCents(subtotal) - toCents(discountAmount) + toCents(taxAmount)));

  const isPaid = (event.payment_status || '').toUpperCase() === 'PAID';
  let amountPaid = 0.00;
  if (paidBalanceUsed > 0) {
    amountPaid = paidBalanceUsed;
  } else if (isPaid) {
    amountPaid = event.paid_amount !== undefined && event.paid_amount !== null
      ? fromCents(toCents(Number(event.paid_amount)))
      : totalAmount;
  }

  if (refundsIssued > 0) {
    amountPaid = Math.max(0, fromCents(toCents(amountPaid) - toCents(refundsIssued)));
  }

  const outstandingBalance = Math.max(0, fromCents(toCents(totalAmount) - toCents(amountPaid)));

  // Status resolution derived from reconciled balances
  let invoiceStatus: InvoiceRecord['status'] = 'unpaid';
  if (outstandingBalance <= 0) {
    invoiceStatus = 'paid';
  } else if (amountPaid > 0) {
    invoiceStatus = 'partially_paid';
  } else {
    invoiceStatus = 'unpaid';
  }

  const paymentTermsDays = sellerSettings.payment_terms_days || 14;
  const issueDate = nowIso;
  const dueDate = new Date(now.getTime() + paymentTermsDays * 24 * 60 * 60 * 1000).toISOString();

  // 9. Format Immutable Snapshots
  const customerDetails = {
    organization_id: event.organization_id,
    organization_name: organization?.name || 'Customer Organization',
    contact_name: customerUser?.name || organization?.name || 'Authorized Representative',
    contact_email: customerUser?.email || null,
    country_code: organization?.country_code || 'MY',
    billing_address: null,
  };

  const eventDetails = {
    event_id: event.id,
    event_name: event.name,
    game_id: event.game_id,
    game_name: gameTitle,
    duration_days: durationDays,
    start_date: startDate,
    end_date: endDate,
    timezone: evTimezone,
  };

  const lineItems: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }> = [
    {
      description: `${gameTitle} — Interactive Event Activation License (${durationDays} Calendar Day${durationDays > 1 ? 's' : ''})`,
      quantity: 1,
      unit_price: subtotal,
      total_price: subtotal,
    },
  ];

  if (welcomeCreditUsed > 0) {
    lineItems.push({
      description: 'Applied Promotional Welcome Credit (One-time Owner Bonus)',
      quantity: 1,
      unit_price: -welcomeCreditUsed,
      total_price: -welcomeCreditUsed,
    });
  }

  if (showcaseCreditUsed > 0) {
    lineItems.push({
      description: 'Applied Showcase Reward Credit',
      quantity: 1,
      unit_price: -showcaseCreditUsed,
      total_price: -showcaseCreditUsed,
    });
  }

  if (topupCreditUsed > 0) {
    lineItems.push({
      description: 'Applied Top-Up Reward Credit',
      quantity: 1,
      unit_price: -topupCreditUsed,
      total_price: -topupCreditUsed,
    });
  }

  if (otherDiscount > 0) {
    lineItems.push({
      description: 'Approved Event Discount / Promotional Credit',
      quantity: 1,
      unit_price: -otherDiscount,
      total_price: -otherDiscount,
    });
  }

  if (taxAmount > 0) {
    lineItems.push({
      description: `Service / Sales Tax (${(taxRate * 100).toFixed(1)}%)`,
      quantity: 1,
      unit_price: taxAmount,
      total_price: taxAmount,
    });
  }

  const invoiceNumber = await generateInvoiceNumber(env, now.getFullYear());
  const invoiceId = crypto.randomUUID();

  const invoiceRecord: InvoiceRecord = {
    id: invoiceId,
    invoice_number: invoiceNumber,
    event_id: event.id,
    organization_id: event.organization_id,
    customer_user_id: customerUser?.id || null,
    status: invoiceStatus,
    currency,
    subtotal,
    discount_amount: discountAmount,
    welcome_credit_amount: welcomeCreditUsed,
    showcase_credit_amount: showcaseCreditUsed,
    topup_credit_amount: topupCreditUsed,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    amount_paid: amountPaid,
    outstanding_balance: outstandingBalance,
    issue_date: issueDate,
    due_date: dueDate,
    seller_details: sellerSettings,
    customer_details: customerDetails,
    event_details: eventDetails,
    line_items: lineItems,
    pdf_path: `/invoices/${invoiceNumber}.pdf`,
    pdf_status: 'pending',
    pdf_generated_at: null,
    email_status: 'pending',
    email_sent_at: null,
    email_error: null,
    payment_reference: event.payment_mode || null,
    notes: sellerSettings.notes_template || `Official tax invoice generated upon completion of event: ${event.name}.`,
    created_at: nowIso,
    updated_at: nowIso,
  };

  if (options?.dryRun) {
    return {
      invoice: invoiceRecord,
      created: false,
      pdfGenerated: false,
      emailSent: false,
    };
  }

  // 10. Generate PDF & Upload to Durable Storage
  let pdfGenerated = false;
  try {
    const pdfData = formatInvoicePdfData(invoiceRecord);
    const pdfBytes = generateInvoicePdf(pdfData);
    localInvoicePdfs.set(invoiceRecord.id, pdfBytes);
    localInvoicePdfs.set(invoiceRecord.event_id, pdfBytes);
    invoiceRecord.pdf_status = 'generated';
    invoiceRecord.pdf_generated_at = nowIso;
    pdfGenerated = true;

    // Persist to private Supabase Storage bucket 'invoices' if Supabase is configured
    if (!isLocalFallbackAllowed(env)) {
      try {
        const storageKey = `${invoiceNumber}.pdf`;
        const { error: uploadError } = await getSupabaseServerClient(env).storage
          .from('invoices')
          .upload(storageKey, pdfBytes, {
            contentType: 'application/pdf',
            upsert: true,
          });
        if (!uploadError) {
          invoiceRecord.pdf_path = `invoices/${storageKey}`;
        } else {
          console.warn(`[Invoices] Storage upload notice for ${invoiceNumber}:`, uploadError.message);
        }
      } catch (storeErr: any) {
        console.warn(`[Invoices] Storage upload exception for ${invoiceNumber}:`, storeErr?.message || storeErr);
      }
    }
  } catch (pdfErr: any) {
    console.error(`[Invoices] Failed to render PDF for invoice ${invoiceNumber}:`, pdfErr?.message || pdfErr);
    invoiceRecord.pdf_status = 'failed';
  }

  // 11. Persist to Database (Supabase)
  const supabase = getSupabaseServerClient(env);
  let dbPersisted = false;

  try {
    const insertRes = await executeWithResilience(
      async () => {
        return await supabase.from('invoices').insert({
          id: invoiceRecord.id,
          invoice_number: invoiceRecord.invoice_number,
          event_id: invoiceRecord.event_id,
          organization_id: invoiceRecord.organization_id,
          customer_user_id: invoiceRecord.customer_user_id,
          status: invoiceRecord.status,
          currency: invoiceRecord.currency,
          subtotal: invoiceRecord.subtotal,
          discount_amount: invoiceRecord.discount_amount,
          welcome_credit_amount: invoiceRecord.welcome_credit_amount,
          tax_rate: invoiceRecord.tax_rate,
          tax_amount: invoiceRecord.tax_amount,
          total_amount: invoiceRecord.total_amount,
          amount_paid: invoiceRecord.amount_paid,
          outstanding_balance: invoiceRecord.outstanding_balance,
          issue_date: invoiceRecord.issue_date,
          due_date: invoiceRecord.due_date,
          seller_details: invoiceRecord.seller_details,
          customer_details: invoiceRecord.customer_details,
          event_details: invoiceRecord.event_details,
          line_items: invoiceRecord.line_items,
          pdf_path: invoiceRecord.pdf_path,
          pdf_status: invoiceRecord.pdf_status,
          pdf_generated_at: invoiceRecord.pdf_generated_at,
          email_status: invoiceRecord.email_status,
          payment_reference: invoiceRecord.payment_reference,
          notes: invoiceRecord.notes,
          created_at: invoiceRecord.created_at,
          updated_at: invoiceRecord.updated_at,
        });
      },
      {
        operation: 'create_event_invoice',
        env,
        maxRetries: 3,
        initialDelayMs: 200,
      }
    );

    if (insertRes?.error) {
      throw insertRes.error;
    }
    dbPersisted = true;
  } catch (err: any) {
    if (!isLocalFallbackAllowed(env) && !err.message?.includes('Placeholder') && err.code !== 'PGRST000') {
      console.error(`[Invoices] Fatal: Failed to persist invoice ${invoiceNumber} in database:`, err);
      throw new Error(`Database error creating invoice: ${err.message || err}`);
    }
  }

  // Save to local cache
  localInvoicesCache.set(invoiceRecord.id, invoiceRecord);
  localInvoicesCache.set(invoiceRecord.event_id, invoiceRecord);

  // 12. Email Notification
  let emailSent = false;
  if (!options?.bypassEmail && customerUser?.email) {
    try {
      const emailPayload = generateInvoiceEmail({
        invoiceNumber: invoiceRecord.invoice_number,
        customerName: customerUser.name || organization?.name,
        organizationName: organization?.name || 'Customer Organization',
        eventName: event.name,
        currency: invoiceRecord.currency,
        totalAmount: invoiceRecord.total_amount,
        amountPaid: invoiceRecord.amount_paid,
        outstandingBalance: invoiceRecord.outstanding_balance,
        status: invoiceRecord.status,
        issueDate: invoiceRecord.issue_date.slice(0, 10),
        dueDate: invoiceRecord.due_date.slice(0, 10),
        viewUrl: `https://eventgamestudio.com/events?invoice=${invoiceRecord.invoice_number}`,
      });

      const sendResult = await sendEmailViaResend({
        to: customerUser.email,
        subject: emailPayload.subject,
        html: emailPayload.html,
        text: emailPayload.text,
        env,
      });

      if (sendResult.success) {
        invoiceRecord.email_status = 'sent';
        invoiceRecord.email_sent_at = new Date().toISOString();
        emailSent = true;
      } else {
        invoiceRecord.email_status = 'failed';
        invoiceRecord.email_error = sendResult.error || 'Failed to dispatch email';
      }
    } catch (mailErr: any) {
      console.warn(`[Invoices] Email dispatch exception for invoice ${invoiceNumber}:`, mailErr?.message || mailErr);
      invoiceRecord.email_status = 'failed';
      invoiceRecord.email_error = mailErr?.message || 'Email service error';
    }
  } else {
    invoiceRecord.email_status = 'skipped';
  }

  // 13. Audit Logging
  try {
    const auditEntry: InvoiceAuditLogRecord = {
      id: crypto.randomUUID(),
      invoice_id: invoiceRecord.id,
      action: 'INVOICE_GENERATED',
      actor_id: options?.actorId || customerUser?.id || null,
      actor_email: options?.actorEmail || customerUser?.email || null,
      details: {
        invoice_number: invoiceRecord.invoice_number,
        event_id: event.id,
        total_amount: invoiceRecord.total_amount,
        status: invoiceRecord.status,
        pdf_generated: pdfGenerated,
        email_sent: emailSent,
      },
      created_at: nowIso,
    };

    if (!localInvoiceAuditLogs.has(invoiceRecord.id)) {
      localInvoiceAuditLogs.set(invoiceRecord.id, []);
    }
    localInvoiceAuditLogs.get(invoiceRecord.id)!.push(auditEntry);

    if (dbPersisted) {
      await supabase.from('invoice_audit_logs').insert(auditEntry);
    }
  } catch (auditErr) {
    console.warn(`[Invoices] Failed to write audit log for invoice ${invoiceNumber}:`, auditErr);
  }

  return {
    invoice: invoiceRecord,
    created: true,
    pdfGenerated,
    emailSent,
  };
}

/**
 * Creates an official credit note linked to an invoice (e.g. for event refunds or adjustments).
 */
export async function createCreditNote(
  invoiceId: string,
  amount: number,
  reason: string,
  env?: Record<string, any>,
  issuedBy?: string
): Promise<CreditNoteRecord> {
  const invoice = await getInvoiceById(invoiceId, env);
  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found.`);
  }

  const numAmount = fromCents(toCents(amount));
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Credit note amount must be a positive number.');
  }

  const existingNotes = await listCreditNotesByInvoice(invoiceId, env);
  const existingCents = existingNotes.reduce((sum, n) => sum + toCents(n.amount), 0);
  if (toCents(numAmount) + existingCents > toCents(invoice.total_amount)) {
    throw new Error(
      `Credit note amount (${numAmount}) plus existing credit notes (${fromCents(existingCents)}) cannot exceed invoice total (${invoice.total_amount}).`
    );
  }

  const num = await generateCreditNoteNumber(env, new Date().getFullYear());
  const creditNote: CreditNoteRecord = {
    id: crypto.randomUUID(),
    credit_note_number: num,
    invoice_id: invoice.id,
    event_id: invoice.event_id,
    organization_id: invoice.organization_id,
    currency: invoice.currency,
    amount: numAmount,
    reason: reason.trim() || 'Invoice adjustment or refund credit',
    status: 'issued',
    issued_by: issuedBy || null,
    created_at: new Date().toISOString(),
  };

  localCreditNotesCache.set(creditNote.id, creditNote);

  const supabase = getSupabaseServerClient(env);
  try {
    await supabase.from('credit_notes').insert(creditNote);
  } catch {
    // Local fallback
  }

  // Record audit log on invoice
  try {
    const auditEntry: InvoiceAuditLogRecord = {
      id: crypto.randomUUID(),
      invoice_id: invoice.id,
      action: 'CREDIT_NOTE_ISSUED',
      actor_id: issuedBy || null,
      actor_email: null,
      details: {
        credit_note_number: creditNote.credit_note_number,
        amount: creditNote.amount,
        reason: creditNote.reason,
      },
      created_at: new Date().toISOString(),
    };
    if (!localInvoiceAuditLogs.has(invoice.id)) {
      localInvoiceAuditLogs.set(invoice.id, []);
    }
    localInvoiceAuditLogs.get(invoice.id)!.push(auditEntry);
    await supabase.from('invoice_audit_logs').insert(auditEntry);
  } catch {}

  return creditNote;
}

/**
 * Lists credit notes for a given invoice.
 */
export async function listCreditNotesByInvoice(
  invoiceId: string,
  env?: Record<string, any>
): Promise<CreditNoteRecord[]> {
  const supabase = getSupabaseServerClient(env);

  try {
    const { data, error } = await supabase
      .from('credit_notes')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      return data as CreditNoteRecord[];
    }
  } catch {}

  const notes: CreditNoteRecord[] = [];
  for (const cn of localCreditNotesCache.values()) {
    if (cn.invoice_id === invoiceId) {
      notes.push(cn);
    }
  }
  return notes;
}

/**
 * Lists audit logs for a given invoice.
 */
export async function listInvoiceAuditLogs(
  invoiceId: string,
  env?: Record<string, any>
): Promise<InvoiceAuditLogRecord[]> {
  const supabase = getSupabaseServerClient(env);

  try {
    const { data, error } = await supabase
      .from('invoice_audit_logs')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: true });

    if (!error && Array.isArray(data)) {
      return data as InvoiceAuditLogRecord[];
    }
  } catch {}

  return localInvoiceAuditLogs.get(invoiceId) || [];
}

/**
 * Retries PDF generation and storage persistence for an invoice.
 */
export async function retryInvoicePdf(
  invoiceId: string,
  env?: Record<string, any>,
  actorId?: string,
  actorEmail?: string
): Promise<InvoiceRecord> {
  const invoice = await getInvoiceById(invoiceId, env);
  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  const nowIso = new Date().toISOString();
  const pdfData = formatInvoicePdfData(invoice);
  const pdfBytes = generateInvoicePdf(pdfData);

  localInvoicePdfs.set(invoice.id, pdfBytes);
  localInvoicePdfs.set(invoice.event_id, pdfBytes);

  let pdfPath = invoice.pdf_path || `invoices/${invoice.invoice_number}.pdf`;
  const supabase = getSupabaseServerClient(env);

  if (!isLocalFallbackAllowed(env)) {
    try {
      const storageKey = `${invoice.invoice_number}.pdf`;
      const { error: uploadError } = await supabase.storage.from('invoices').upload(storageKey, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (!uploadError) {
        pdfPath = `invoices/${storageKey}`;
      }
    } catch (storeErr: any) {
      console.warn(`[Invoices] Retry PDF storage upload warning for ${invoice.invoice_number}:`, storeErr);
    }
  }

  invoice.pdf_status = 'generated';
  invoice.pdf_generated_at = nowIso;
  invoice.pdf_path = pdfPath;
  invoice.updated_at = nowIso;

  if (localInvoicesCache.has(invoice.id)) {
    localInvoicesCache.set(invoice.id, { ...invoice });
  }

  try {
    await supabase.from('invoices').update({
      pdf_status: 'generated',
      pdf_generated_at: nowIso,
      pdf_path: pdfPath,
      updated_at: nowIso,
    }).eq('id', invoice.id);
  } catch {}

  try {
    const auditEntry: InvoiceAuditLogRecord = {
      id: crypto.randomUUID(),
      invoice_id: invoice.id,
      action: 'INVOICE_PDF_RETRIED',
      actor_id: actorId || null,
      actor_email: actorEmail || null,
      details: {
        invoice_number: invoice.invoice_number,
        pdf_status: 'generated',
      },
      created_at: nowIso,
    };
    if (!localInvoiceAuditLogs.has(invoice.id)) {
      localInvoiceAuditLogs.set(invoice.id, []);
    }
    localInvoiceAuditLogs.get(invoice.id)!.push(auditEntry);
    await supabase.from('invoice_audit_logs').insert(auditEntry);
  } catch {}

  return invoice;
}

/**
 * Retries sending an invoice email to the customer.
 */
export async function retryInvoiceEmail(
  invoiceId: string,
  env?: Record<string, any>,
  actorId?: string,
  actorEmail?: string
): Promise<{ success: boolean; email_status: string; error?: string }> {
  const invoice = await getInvoiceById(invoiceId, env);
  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  let recipientEmail = invoice.customer_details?.contact_email;
  if (!recipientEmail && invoice.customer_user_id) {
    const user = await getUserById(invoice.customer_user_id, env);
    recipientEmail = user?.email || null;
  }
  if (!recipientEmail) {
    const org = await getOrganizationById(invoice.organization_id, env);
    if (org?.owner_id) {
      const owner = await getUserById(org.owner_id, env);
      recipientEmail = owner?.email || null;
    }
  }

  if (!recipientEmail) {
    throw new Error(`No recipient email address found for invoice ${invoice.invoice_number}`);
  }

  const nowIso = new Date().toISOString();
  let emailSent = false;
  let emailError: string | null = null;

  try {
    const emailPayload = generateInvoiceEmail({
      invoiceNumber: invoice.invoice_number,
      customerName: invoice.customer_details?.contact_name || invoice.customer_details?.organization_name,
      organizationName: invoice.customer_details?.organization_name || 'Customer Organization',
      eventName: invoice.event_details?.event_name || 'Event',
      currency: invoice.currency,
      totalAmount: invoice.total_amount,
      amountPaid: invoice.amount_paid,
      outstandingBalance: invoice.outstanding_balance,
      status: invoice.status,
      issueDate: (invoice.issue_date || '').slice(0, 10),
      dueDate: (invoice.due_date || '').slice(0, 10),
      viewUrl: `https://eventgamestudio.com/events?invoice=${invoice.invoice_number}`,
    });

    const sendResult = await sendEmailViaResend({
      to: recipientEmail,
      subject: emailPayload.subject,
      html: emailPayload.html,
      text: emailPayload.text,
      env,
    });

    if (sendResult.success) {
      invoice.email_status = 'sent';
      invoice.email_sent_at = nowIso;
      invoice.email_error = null;
      emailSent = true;
    } else {
      invoice.email_status = 'failed';
      invoice.email_error = sendResult.error || 'Failed to dispatch email';
      emailError = invoice.email_error;
    }
  } catch (err: any) {
    invoice.email_status = 'failed';
    invoice.email_error = err?.message || 'Email dispatch exception';
    emailError = invoice.email_error;
  }

  invoice.updated_at = nowIso;
  if (localInvoicesCache.has(invoice.id)) {
    localInvoicesCache.set(invoice.id, { ...invoice });
  }

  const supabase = getSupabaseServerClient(env);
  try {
    await supabase.from('invoices').update({
      email_status: invoice.email_status,
      email_sent_at: invoice.email_sent_at,
      email_error: invoice.email_error,
      updated_at: nowIso,
    }).eq('id', invoice.id);
  } catch {}

  try {
    const auditEntry: InvoiceAuditLogRecord = {
      id: crypto.randomUUID(),
      invoice_id: invoice.id,
      action: 'INVOICE_EMAIL_RETRIED',
      actor_id: actorId || null,
      actor_email: actorEmail || null,
      details: {
        recipient_email: recipientEmail,
        email_status: invoice.email_status,
        email_error: invoice.email_error,
      },
      created_at: nowIso,
    };
    if (!localInvoiceAuditLogs.has(invoice.id)) {
      localInvoiceAuditLogs.set(invoice.id, []);
    }
    localInvoiceAuditLogs.get(invoice.id)!.push(auditEntry);
    await supabase.from('invoice_audit_logs').insert(auditEntry);
  } catch {}

  return {
    success: emailSent,
    email_status: invoice.email_status,
    error: emailError || undefined,
  };
}
