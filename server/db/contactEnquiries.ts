import { getSupabaseServerClient, isSupabaseConfigured, isLocalFallbackAllowed, isProductionEnvironment } from '../supabase.js';
import {
  ContactEnquiryRecord,
  CreateContactEnquiryParams,
  ContactEmailStatus,
  ContactEnquiryStatus,
} from './types.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const uploadsDir = path.join(process.cwd(), 'uploads');
const LOCAL_ENQUIRIES_FILE = path.join(uploadsDir, 'contact_enquiries.json');
const MAX_LOCAL_ENQUIRIES = 1000;

export const DEFAULT_CONTACT_RECIPIENT_EMAIL = 'eventgamestudio@gmail.com';

export const localEnquiriesCache = new Map<string, ContactEnquiryRecord>();

function ensureUploadsDir() {
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  } catch {
    // ignore
  }
}

function readLocalEnquiries(env?: Record<string, any>): ContactEnquiryRecord[] {
  try {
    if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) return [];
    ensureUploadsDir();
    if (!fs.existsSync(LOCAL_ENQUIRIES_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(LOCAL_ENQUIRIES_FILE, 'utf-8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn('Notice: Error reading local enquiries fallback file:', err);
    return [];
  }
}

function writeLocalEnquiries(records: ContactEnquiryRecord[], env?: Record<string, any>): void {
  try {
    if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) return;
    ensureUploadsDir();
    const trimmed = records.slice(0, MAX_LOCAL_ENQUIRIES);
    fs.writeFileSync(LOCAL_ENQUIRIES_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Notice: Error writing local enquiries fallback file:', err);
  }
}

// Populate in-memory cache on startup
try {
  const initial = readLocalEnquiries();
  for (const item of initial) {
    if (item.id) localEnquiriesCache.set(item.id, item);
  }
} catch {
  // ignore
}

/**
 * Returns the authoritative business email address that must receive enquiry notifications.
 * Strictly defaults to eventgamestudio@gmail.com unless explicitly overridden by server environment.
 */
export function getContactNotificationRecipientEmail(env?: Record<string, any>): string {
  const procEnv = typeof process !== 'undefined' ? process.env : {};
  const recipient =
    env?.CONTACT_NOTIFICATION_EMAIL ||
    procEnv.CONTACT_NOTIFICATION_EMAIL ||
    DEFAULT_CONTACT_RECIPIENT_EMAIL;

  return recipient.trim().toLowerCase();
}

/**
 * Generates an authoritative server-side ticket ID (e.g., EGS-784219).
 */
export function generateTicketId(): string {
  const randomDigits = Math.floor(100000 + Math.random() * 900000);
  return `EGS-${randomDigits}`;
}

/**
 * Persists a new contact enquiry before attempting any email notifications.
 * Supports idempotency keys to prevent duplicate records when users retry.
 */
export async function createContactEnquiry(
  params: CreateContactEnquiryParams,
  env?: Record<string, any>
): Promise<ContactEnquiryRecord> {
  const id = params.id || crypto.randomUUID();
  const ticketId = params.ticket_id || generateTicketId();
  const now = new Date().toISOString();
  const recipientEmail = (params.recipient_email || getContactNotificationRecipientEmail(env)).trim().toLowerCase();

  // If idempotency_key is provided, check if record already exists
  if (params.idempotency_key && params.idempotency_key.trim()) {
    const existing = await findEnquiryByIdempotencyKey(params.idempotency_key.trim(), env);
    if (existing) {
      return existing;
    }
  }

  const record: ContactEnquiryRecord = {
    id,
    ticket_id: ticketId,
    full_name: params.full_name.trim(),
    email: params.email.trim().toLowerCase(),
    phone: params.phone ? params.phone.trim() : null,
    company: params.company ? params.company.trim() : null,
    category: params.category ? params.category.trim() : 'General enquiry',
    event_date: params.event_date ? params.event_date.trim() : null,
    expected_attendees: params.expected_attendees ? params.expected_attendees.trim() : null,
    message: params.message.trim(),
    status: params.status || 'new',
    email_status: params.email_status || 'pending',
    email_sent_at: params.email_sent_at || null,
    email_error: params.email_error || null,
    email_message_id: params.email_message_id || null,
    recipient_email: recipientEmail,
    idempotency_key: params.idempotency_key ? params.idempotency_key.trim() : null,
    ip_address: params.ip_address || null,
    user_agent: params.user_agent || null,
    created_at: now,
    updated_at: now,
  };

  if (!isSupabaseConfigured(env)) {
    if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
      throw new Error(`Fatal: Database error creating contact enquiry: Supabase is not configured and local fallback is prohibited in production/Worker environment.`);
    }
    localEnquiriesCache.set(id, record);
    const all = [record, ...readLocalEnquiries(env).filter((x) => x.id !== id)];
    writeLocalEnquiries(all, env);
    return record;
  }

  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('contact_enquiries')
    .insert({
      id: record.id,
      ticket_id: record.ticket_id,
      full_name: record.full_name,
      email: record.email,
      phone: record.phone,
      company: record.company,
      category: record.category,
      event_date: record.event_date,
      expected_attendees: record.expected_attendees,
      message: record.message,
      status: record.status,
      email_status: record.email_status,
      email_sent_at: record.email_sent_at,
      email_error: record.email_error,
      email_message_id: record.email_message_id,
      recipient_email: record.recipient_email,
      idempotency_key: record.idempotency_key,
      ip_address: record.ip_address,
      user_agent: record.user_agent,
      created_at: record.created_at,
      updated_at: record.updated_at,
    })
    .select()
    .single();

  if (error) {
    console.error('Error inserting contact enquiry to Supabase:', error.message);
    if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
      throw new Error(`Database error creating contact enquiry: ${error.message}`);
    }
    const isPlaceholder = error.message?.includes('Placeholder') || error.code === 'PGRST000';
    if (isPlaceholder && isLocalFallbackAllowed(env)) {
      localEnquiriesCache.set(id, record);
      const all = [record, ...readLocalEnquiries(env).filter((x) => x.id !== id)];
      writeLocalEnquiries(all, env);
      return record;
    }
    throw new Error(`Database error creating contact enquiry: ${error.message}`);
  }

  return (data as ContactEnquiryRecord) || record;
}

/**
 * Finds an enquiry by idempotency key to prevent duplicates upon network retry.
 */
export async function findEnquiryByIdempotencyKey(
  idempotencyKey: string,
  env?: Record<string, any>
): Promise<ContactEnquiryRecord | null> {
  if (!idempotencyKey || !idempotencyKey.trim()) return null;

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('contact_enquiries')
        .select('*')
        .eq('idempotency_key', idempotencyKey.trim())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return data as ContactEnquiryRecord;
      }
    } catch (err) {
      console.warn('Notice: Error searching enquiry by idempotency key in database:', err);
    }
  }

  // Check local cache
  for (const item of localEnquiriesCache.values()) {
    if (item.idempotency_key === idempotencyKey.trim()) {
      return item;
    }
  }

  const localList = readLocalEnquiries(env);
  const found = localList.find((x) => x.idempotency_key === idempotencyKey.trim());
  return found || null;
}

/**
 * Updates the email delivery status for a persisted contact enquiry.
 */
export async function updateContactEnquiryEmailStatus(
  id: string,
  emailStatus: ContactEmailStatus,
  options?: {
    emailError?: string | null;
    emailMessageId?: string | null;
    emailSentAt?: string | null;
  },
  env?: Record<string, any>
): Promise<ContactEnquiryRecord | null> {
  const now = new Date().toISOString();
  const updates: Record<string, any> = {
    email_status: emailStatus,
    updated_at: now,
  };

  if (options?.emailError !== undefined) {
    updates.email_error = options.emailError;
  }
  if (options?.emailMessageId !== undefined) {
    updates.email_message_id = options.emailMessageId;
  }
  if (options?.emailSentAt !== undefined) {
    updates.email_sent_at = options.emailSentAt;
  } else if (emailStatus === 'sent') {
    updates.email_sent_at = now;
  }

  // Update in-memory cache
  const cached = localEnquiriesCache.get(id);
  if (cached) {
    const updated = { ...cached, ...updates };
    localEnquiriesCache.set(id, updated);
  }

  if (!isSupabaseConfigured(env)) {
    if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
      throw new Error(`Fatal: Database error updating contact enquiry email status: Supabase is not configured and local fallback is prohibited in production/Worker environment.`);
    }
    const all = readLocalEnquiries(env).map((item) => (item.id === id ? { ...item, ...updates } : item));
    writeLocalEnquiries(all, env);
    return localEnquiriesCache.get(id) || null;
  }

  try {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('contact_enquiries')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error(`Error updating contact enquiry ${id} email status:`, error.message);
      if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
        throw new Error(`Database error updating email status: ${error.message}`);
      }
      const isPlaceholder = error.message?.includes('Placeholder') || error.code === 'PGRST000';
      if (isPlaceholder && isLocalFallbackAllowed(env)) {
        return localEnquiriesCache.get(id) || null;
      }
      throw new Error(`Database error updating email status: ${error.message}`);
    }

    if (data) {
      localEnquiriesCache.set(id, data as ContactEnquiryRecord);
      return data as ContactEnquiryRecord;
    }
  } catch (err: any) {
    console.error(`Exception updating email status for enquiry ${id}:`, err);
    if (!isLocalFallbackAllowed(env) || isProductionEnvironment(env)) {
      throw err;
    }
  }

  return localEnquiriesCache.get(id) || null;
}

/**
 * Retrieves an enquiry by its UUID primary key.
 */
export async function getContactEnquiryById(
  id: string,
  env?: Record<string, any>
): Promise<ContactEnquiryRecord | null> {
  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('contact_enquiries')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        return data as ContactEnquiryRecord;
      }
    } catch (err) {
      console.warn('Notice: Error fetching enquiry by ID from database:', err);
    }
  }

  if (localEnquiriesCache.has(id)) {
    return localEnquiriesCache.get(id)!;
  }
  const localList = readLocalEnquiries(env);
  return localList.find((x) => x.id === id) || null;
}

/**
 * Retrieves an enquiry by its public ticket ID (e.g. EGS-123456).
 */
export async function getContactEnquiryByTicketId(
  ticketId: string,
  env?: Record<string, any>
): Promise<ContactEnquiryRecord | null> {
  const cleanTicket = ticketId.trim().toUpperCase();

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('contact_enquiries')
        .select('*')
        .eq('ticket_id', cleanTicket)
        .maybeSingle();

      if (!error && data) {
        return data as ContactEnquiryRecord;
      }
    } catch (err) {
      console.warn('Notice: Error fetching enquiry by ticketId from database:', err);
    }
  }

  for (const item of localEnquiriesCache.values()) {
    if (item.ticket_id.toUpperCase() === cleanTicket) {
      return item;
    }
  }
  const localList = readLocalEnquiries(env);
  return localList.find((x) => x.ticket_id.toUpperCase() === cleanTicket) || null;
}

/**
 * Lists contact enquiries with pagination and filters (Developer Admin).
 */
export async function listContactEnquiries(
  params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: ContactEnquiryStatus;
    emailStatus?: ContactEmailStatus;
  },
  env?: Record<string, any>
): Promise<{ enquiries: ContactEnquiryRecord[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, params?.page || 1);
  const pageSize = Math.min(100, Math.max(1, params?.pageSize || 20));
  const offset = (page - 1) * pageSize;

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      let query = supabase
        .from('contact_enquiries')
        .select('*', { count: 'exact' });

      if (params?.status) {
        query = query.eq('status', params.status);
      }
      if (params?.emailStatus) {
        query = query.eq('email_status', params.emailStatus);
      }
      if (params?.search && params.search.trim()) {
        const term = params.search.trim();
        query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,ticket_id.ilike.%${term}%,company.ilike.%${term}%`);
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('Error querying contact enquiries in database:', error.message);
        if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
          throw new Error(`Database error querying contact enquiries: ${error.message}`);
        }
        const isPlaceholder = error.message?.includes('Placeholder') || error.code === 'PGRST000';
        if (!isPlaceholder) {
          throw new Error(`Database error querying contact enquiries: ${error.message}`);
        }
      } else if (data) {
        return {
          enquiries: data as ContactEnquiryRecord[],
          total: count || 0,
          page,
          pageSize,
        };
      }
    } catch (err) {
      console.warn('Notice: Error querying contact enquiries in database:', err);
      if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
        throw err;
      }
    }
  }

  // Fallback to local memory / file ONLY when allowed in non-production
  if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
    throw new Error('Fatal: Contact enquiries listing requires a valid Supabase database in production/Worker environment. Local cache fallback is strictly prohibited.');
  }

  let all = Array.from(localEnquiriesCache.values());
  if (all.length === 0) {
    all = readLocalEnquiries(env);
  }

  // Apply filters
  let filtered = all;
  if (params?.status) {
    filtered = filtered.filter((x) => x.status === params.status);
  }
  if (params?.emailStatus) {
    filtered = filtered.filter((x) => x.email_status === params.emailStatus);
  }
  if (params?.search && params.search.trim()) {
    const term = params.search.trim().toLowerCase();
    filtered = filtered.filter(
      (x) =>
        x.full_name.toLowerCase().includes(term) ||
        x.email.toLowerCase().includes(term) ||
        x.ticket_id.toLowerCase().includes(term) ||
        (x.company && x.company.toLowerCase().includes(term))
    );
  }

  filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const paginated = filtered.slice(offset, offset + pageSize);

  return {
    enquiries: paginated,
    total: filtered.length,
    page,
    pageSize,
  };
}
