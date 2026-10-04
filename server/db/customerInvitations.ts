import {
  getSupabaseServerClient,
  isSupabaseConfigured,
  isLocalFallbackAllowed,
  isProductionEnvironment,
  assertProductionCustomerInvitationsSafe,
} from '../supabase.js';
import { generateCustomerInvitationEmail } from '../email/customerInvitationTemplate.js';
import {
  sendEmailViaResend,
  validateResendSenderConfig,
  validateResendApiKeyConfig,
  isResendConfigured,
  getResendInvitationFrom,
  processResendWebhookPayload,
} from '../email/resend.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface CustomerCompanyRecord {
  id: string;
  company_name: string;
  contact_person: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerCompanyRecipientRecord {
  id: string;
  company_id: string;
  recipient_name: string | null;
  email: string;
  invitation_count: number;
  last_invited_at: string | null;
  last_invitation_status: 'never_invited' | 'sent' | 'failed';
  last_invitation_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerInvitationLogRecord {
  id: string;
  company_id: string;
  recipient_id: string;
  email: string;
  subject: string;
  provider: string;
  provider_message_id: string | null;
  status: 'sent' | 'failed';
  error_message: string | null;
  sent_by_user_id: string | null;
  created_at: string;
}

export interface CustomerCompanyWithRecipients extends CustomerCompanyRecord {
  recipients: CustomerCompanyRecipientRecord[];
  totalRecipients: number;
  neverInvitedCount: number;
  previouslyInvitedCount: number;
  lastInvitedAt: string | null;
  invitationStatus: 'never_invited' | 'partially_invited' | 'all_invited';
}

export interface CustomerInvitationStats {
  totalCompanies: number;
  totalRecipients: number;
  neverInvitedRecipients: number;
  previouslyInvitedRecipients: number;
  totalInvitationsSent: number;
}

// Local fallback storage for development and environments where Supabase is not configured
const uploadsDir = path.join(process.cwd(), 'uploads');
const LOCAL_STORAGE_FILE = path.join(uploadsDir, 'customer_invitations.json');

/**
 * Detects whether a database error is caused by missing tables or missing stored procedures.
 */
export function isMissingTableOrRpcError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const message = String(err.message || '').toLowerCase();
  const details = String(err.details || '').toLowerCase();

  return (
    code === 'PGRST202' || // Function not found in schema cache
    code === '42883' ||    // undefined_function
    code === 'PGRST204' || // Column / table not found in schema cache
    code === '42P01' ||    // undefined_table
    code === 'PGRST200' || // Could not find a relationship
    code === 'PGRST106' || // Schema cache error
    (message.includes('function') && (message.includes('does not exist') || message.includes('could not find'))) ||
    (message.includes('relation') && message.includes('does not exist')) ||
    (message.includes('table') && message.includes('does not exist')) ||
    message.includes('could not find the table') ||
    message.includes('could not find the function') ||
    (message.includes('customer_companies') && message.includes('does not exist')) ||
    (message.includes('customer_company_recipients') && message.includes('does not exist')) ||
    (message.includes('customer_invitation_logs') && message.includes('does not exist')) ||
    message.includes('create_customer_company_atomic') ||
    message.includes('update_customer_company_atomic') ||
    message.includes('record_customer_invitation_dispatch_atomic') ||
    details.includes('does not exist')
  );
}

/**
 * Creates a stable migration-required error (HTTP 503).
 */
export function createMigrationRequiredError(operationName?: string, detail?: string): Error {
  const message = detail
    ? `Customer invitation database migration has not been applied (${operationName || 'operation'}): ${detail}. Please apply migration 20261008000000_create_customer_invitations.sql.`
    : 'Customer invitation database migration has not been applied. Please apply migration 20261008000000_create_customer_invitations.sql to create customer_companies, customer_company_recipients, customer_invitation_logs tables and atomic stored procedures.';
  const err: any = new Error(message);
  err.code = 'CUSTOMER_INVITATIONS_MIGRATION_REQUIRED';
  err.statusCode = 503;
  err.status = 503;
  err.isOperational = true;
  return err;
}

interface LocalStorageSchema {
  companies: CustomerCompanyRecord[];
  recipients: CustomerCompanyRecipientRecord[];
  logs: CustomerInvitationLogRecord[];
}

function ensureUploadsDir() {
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  } catch {
    // ignore
  }
}

function readLocalStorage(env?: Record<string, any>): LocalStorageSchema {
  if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
    return { companies: [], recipients: [], logs: [] };
  }
  try {
    ensureUploadsDir();
    if (!fs.existsSync(LOCAL_STORAGE_FILE)) {
      return { companies: [], recipients: [], logs: [] };
    }
    const raw = fs.readFileSync(LOCAL_STORAGE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      companies: Array.isArray(parsed.companies) ? parsed.companies : [],
      recipients: Array.isArray(parsed.recipients) ? parsed.recipients : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
    };
  } catch (err) {
    console.warn('Notice: Error reading local customer invitations file:', err);
    return { companies: [], recipients: [], logs: [] };
  }
}

function writeLocalStorage(data: LocalStorageSchema, env?: Record<string, any>): void {
  if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
    return;
  }
  try {
    ensureUploadsDir();
    fs.writeFileSync(LOCAL_STORAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Notice: Error writing local customer invitations file:', err);
  }
}

// Email validator helper
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

/**
 * Compute derived status for a company based on its recipients
 */
export function computeCompanyStats(
  company: CustomerCompanyRecord,
  recipients: CustomerCompanyRecipientRecord[]
): CustomerCompanyWithRecipients {
  const compRecipients = recipients.filter((r) => r.company_id === company.id);
  const total = compRecipients.length;
  const previouslyInvited = compRecipients.filter((r) => (r.invitation_count || 0) > 0 || r.last_invited_at != null);
  const neverInvited = compRecipients.filter((r) => (r.invitation_count || 0) === 0 && r.last_invited_at == null);

  let lastInvitedAt: string | null = null;
  for (const r of compRecipients) {
    if (r.last_invited_at) {
      if (!lastInvitedAt || new Date(r.last_invited_at) > new Date(lastInvitedAt)) {
        lastInvitedAt = r.last_invited_at;
      }
    }
  }

  let invitationStatus: 'never_invited' | 'partially_invited' | 'all_invited' = 'never_invited';
  if (total > 0) {
    if (previouslyInvited.length === total) {
      invitationStatus = 'all_invited';
    } else if (previouslyInvited.length > 0) {
      invitationStatus = 'partially_invited';
    } else {
      invitationStatus = 'never_invited';
    }
  }

  return {
    ...company,
    recipients: compRecipients,
    totalRecipients: total,
    neverInvitedCount: neverInvited.length,
    previouslyInvitedCount: previouslyInvited.length,
    lastInvitedAt,
    invitationStatus,
  };
}

/**
 * List customer companies with optional search and invitation status filtering
 */
export async function listCustomerCompanies(params: {
  search?: string;
  statusFilter?: 'all' | 'never_invited' | 'partially_invited' | 'all_invited';
  env?: Record<string, any>;
}): Promise<{ companies: CustomerCompanyWithRecipients[]; stats: CustomerInvitationStats }> {
  const { search, statusFilter = 'all', env } = params;
  assertProductionCustomerInvitationsSafe('listCustomerCompanies', env);

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);

    const { data: companiesData, error: compErr } = await supabase
      .from('customer_companies')
      .select('*')
      .order('created_at', { ascending: false });

    if (compErr) {
      console.error('[listCustomerCompanies] Database error querying customer_companies:', compErr);
      if (isMissingTableOrRpcError(compErr)) {
        throw createMigrationRequiredError('listCustomerCompanies', compErr.message);
      }
      const dbErr: any = new Error(`Database error listing customer companies: ${compErr.message}`);
      dbErr.code = compErr.code;
      dbErr.statusCode = 500;
      throw dbErr;
    }

    const { data: recipientsData, error: recErr } = await supabase
      .from('customer_company_recipients')
      .select('*')
      .order('created_at', { ascending: true });

    if (recErr) {
      console.error('[listCustomerCompanies] Database error querying company recipients:', recErr);
      if (isMissingTableOrRpcError(recErr)) {
        throw createMigrationRequiredError('listCustomerCompanies', recErr.message);
      }
      const dbErr: any = new Error(`Database error listing company recipients: ${recErr.message}`);
      dbErr.code = recErr.code;
      dbErr.statusCode = 500;
      throw dbErr;
    }

    const rawCompanies: CustomerCompanyRecord[] = companiesData || [];
    const rawRecipients: CustomerCompanyRecipientRecord[] = recipientsData || [];

    let enriched = rawCompanies.map((c) => computeCompanyStats(c, rawRecipients));

    // Filter by search
    if (search && search.trim()) {
      const query = search.trim().toLowerCase();
      enriched = enriched.filter((c) => {
        if (c.company_name.toLowerCase().includes(query)) return true;
        if (c.contact_person && c.contact_person.toLowerCase().includes(query)) return true;
        if (c.notes && c.notes.toLowerCase().includes(query)) return true;
        return c.recipients.some((r) =>
          r.email.toLowerCase().includes(query) || (r.recipient_name && r.recipient_name.toLowerCase().includes(query))
        );
      });
    }

    // Filter by status
    if (statusFilter && statusFilter !== 'all') {
      enriched = enriched.filter((c) => c.invitationStatus === statusFilter);
    }

    const stats = await getCustomerInvitationStats(env);
    return { companies: enriched, stats };
  }

  // Local storage fallback ONLY when allowed in non-production
  if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
    throw new Error('Fatal: Customer company listing requires a valid Supabase database in production/Worker environment. Local database fallback is strictly prohibited.');
  }

  const store = readLocalStorage(env);
  let enriched = store.companies.map((c) => computeCompanyStats(c, store.recipients));

  if (search && search.trim()) {
    const query = search.trim().toLowerCase();
    enriched = enriched.filter((c) => {
      if (c.company_name.toLowerCase().includes(query)) return true;
      if (c.contact_person && c.contact_person.toLowerCase().includes(query)) return true;
      if (c.notes && c.notes.toLowerCase().includes(query)) return true;
      return c.recipients.some((r) =>
        r.email.toLowerCase().includes(query) || (r.recipient_name && r.recipient_name.toLowerCase().includes(query))
      );
    });
  }

  if (statusFilter && statusFilter !== 'all') {
    enriched = enriched.filter((c) => c.invitationStatus === statusFilter);
  }

  // Sort descending by created_at
  enriched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const stats = await getCustomerInvitationStats(env);
  return { companies: enriched, stats };
}

/**
 * Get single company by ID with its recipients and recent logs
 */
export async function getCustomerCompanyById(
  id: string,
  env?: Record<string, any>
): Promise<(CustomerCompanyWithRecipients & { logs: CustomerInvitationLogRecord[] }) | null> {
  assertProductionCustomerInvitationsSafe('getCustomerCompanyById', env);

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);

    const { data: comp, error: compErr } = await supabase
      .from('customer_companies')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (compErr) {
      console.error('[getCustomerCompanyById] Database error fetching customer company:', compErr);
      if (isMissingTableOrRpcError(compErr)) {
        throw createMigrationRequiredError('getCustomerCompanyById', compErr.message);
      }
      const dbErr: any = new Error(`Database error fetching customer company: ${compErr.message}`);
      dbErr.code = compErr.code;
      dbErr.statusCode = 500;
      throw dbErr;
    } else if (comp) {
      const { data: recs, error: recErr } = await supabase
        .from('customer_company_recipients')
        .select('*')
        .eq('company_id', id)
        .order('created_at', { ascending: true });

      if (recErr) {
        if (isMissingTableOrRpcError(recErr)) {
          throw createMigrationRequiredError('getCustomerCompanyById', recErr.message);
        }
        const dbErr: any = new Error(`Database error fetching company recipients: ${recErr.message}`);
        dbErr.code = recErr.code;
        dbErr.statusCode = 500;
        throw dbErr;
      }

      const { data: logs, error: logErr } = await supabase
        .from('customer_invitation_logs')
        .select('*')
        .eq('company_id', id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (logErr) {
        if (isMissingTableOrRpcError(logErr)) {
          throw createMigrationRequiredError('getCustomerCompanyById', logErr.message);
        }
        const dbErr: any = new Error(`Database error fetching company invitation logs: ${logErr.message}`);
        dbErr.code = logErr.code;
        dbErr.statusCode = 500;
        throw dbErr;
      }

      const computed = computeCompanyStats(comp, recs || []);
      return { ...computed, logs: logs || [] };
    } else {
      // Company genuinely does not exist in authoritative database
      return null;
    }
  }

  // Local storage fallback ONLY when allowed in non-production
  if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
    throw new Error('Fatal: Customer company retrieval requires a valid Supabase database in production/Worker environment. Local database fallback is strictly prohibited.');
  }

  const store = readLocalStorage(env);
  const comp = store.companies.find((c) => c.id === id);
  if (!comp) return null;

  const recs = store.recipients.filter((r) => r.company_id === id);
  const logs = store.logs
    .filter((l) => l.company_id === id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50);

  const computed = computeCompanyStats(comp, recs);
  return { ...computed, logs };
}

/**
 * Create a new customer company with recipients
 */
export async function createCustomerCompany(
  params: {
    company_name: string;
    contact_person?: string | null;
    notes?: string | null;
    recipients: Array<{ email: string; recipient_name?: string | null }>;
    created_by?: string | null;
  },
  env?: Record<string, any>
): Promise<CustomerCompanyWithRecipients> {
  assertProductionCustomerInvitationsSafe('createCustomerCompany', env);

  const companyName = (params.company_name || '').trim();
  if (!companyName) {
    const err: any = new Error('Company name is required');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (!params.recipients || !Array.isArray(params.recipients) || params.recipients.length === 0) {
    const err: any = new Error('At least one recipient email address is required');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // Validate and deduplicate emails
  const seenEmails = new Set<string>();
  const sanitizedRecipients: Array<{ email: string; recipient_name: string | null }> = [];

  for (const r of params.recipients) {
    const cleanEmail = (r.email || '').trim().toLowerCase();
    if (!cleanEmail) continue;
    if (!isValidEmail(cleanEmail)) {
      const err: any = new Error(`Invalid email address: "${r.email}"`);
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    if (seenEmails.has(cleanEmail)) {
      continue; // Duplicate within company deduplicated
    }
    seenEmails.add(cleanEmail);
    sanitizedRecipients.push({
      email: cleanEmail,
      recipient_name: r.recipient_name?.trim() || null,
    });
  }

  if (sanitizedRecipients.length === 0) {
    const err: any = new Error('At least one valid recipient email address is required');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const now = new Date().toISOString();
  const companyId = crypto.randomUUID();

  const newCompany: CustomerCompanyRecord = {
    id: companyId,
    company_name: companyName,
    contact_person: params.contact_person?.trim() || null,
    notes: params.notes?.trim() || null,
    created_by: params.created_by || null,
    created_at: now,
    updated_at: now,
  };

  const newRecipients: CustomerCompanyRecipientRecord[] = sanitizedRecipients.map((r) => ({
    id: crypto.randomUUID(),
    company_id: companyId,
    recipient_name: r.recipient_name,
    email: r.email,
    invitation_count: 0,
    last_invited_at: null,
    last_invitation_status: 'never_invited',
    last_invitation_error: null,
    created_at: now,
    updated_at: now,
  }));

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);

    // 1. Attempt atomic creation RPC first
    const { data: rpcData, error: rpcErr } = await supabase.rpc('create_customer_company_atomic', {
      p_company_name: newCompany.company_name,
      p_contact_person: newCompany.contact_person,
      p_notes: newCompany.notes,
      p_created_by: newCompany.created_by,
      p_recipients: sanitizedRecipients.map((r, idx) => ({
        id: newRecipients[idx].id,
        email: r.email,
        recipient_name: r.recipient_name,
      })),
      p_company_id: newCompany.id,
    });

    if (rpcErr) {
      if (isMissingTableOrRpcError(rpcErr)) {
        throw createMigrationRequiredError('createCustomerCompany', rpcErr.message);
      }
      console.error('[createCustomerCompany] Database error in create_customer_company_atomic RPC:', rpcErr);
      const dbErr: any = new Error(`Database error creating customer company: ${rpcErr.message}`);
      dbErr.code = rpcErr.code || 'DATABASE_ERROR';
      dbErr.statusCode = 500;
      throw dbErr;
    }

    if (!rpcData || !rpcData.success || !rpcData.company) {
      const ambigErr: any = new Error(
        'Ambiguous or incomplete database response from create_customer_company_atomic: company was not confirmed persisted.'
      );
      ambigErr.code = 'DATABASE_PERSISTENCE_UNCERTAIN';
      ambigErr.statusCode = 500;
      throw ambigErr;
    }

    return computeCompanyStats(rpcData.company, rpcData.recipients || newRecipients);
  }

  // 3. Local fallback ONLY for non-production environments where fallback is explicitly allowed
  if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
    throw new Error('Fatal: Customer company creation requires a valid Supabase database in production/Worker environment. Local database fallback is strictly prohibited.');
  }

  const store = readLocalStorage(env);
  store.companies.unshift(newCompany);
  store.recipients.push(...newRecipients);
  writeLocalStorage(store, env);

  return computeCompanyStats(newCompany, newRecipients);
}

/**
 * Update an existing customer company and reconcile recipients
 */
export async function updateCustomerCompany(
  id: string,
  params: {
    company_name?: string;
    contact_person?: string | null;
    notes?: string | null;
    recipients?: Array<{ id?: string; email: string; recipient_name?: string | null }>;
  },
  env?: Record<string, any>
): Promise<CustomerCompanyWithRecipients> {
  assertProductionCustomerInvitationsSafe('updateCustomerCompany', env);
  const now = new Date().toISOString();

  if (params.recipients) {
    if (!Array.isArray(params.recipients) || params.recipients.length === 0) {
      const err: any = new Error('At least one recipient email address is required');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    for (const r of params.recipients) {
      const email = (r.email || '').trim().toLowerCase();
      if (!email || !isValidEmail(email)) {
        const err: any = new Error(`Invalid recipient email address: "${r.email}"`);
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }
    }
  }

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);

    // Call atomic update RPC
    const { data: rpcData, error: rpcErr } = await supabase.rpc('update_customer_company_atomic', {
      p_company_id: id,
      p_company_name: params.company_name !== undefined ? params.company_name.trim() : null,
      p_contact_person: params.contact_person !== undefined ? (params.contact_person?.trim() || null) : null,
      p_notes: params.notes !== undefined ? (params.notes?.trim() || null) : null,
      p_recipients: params.recipients
        ? params.recipients.map((r) => ({
            id: r.id || null,
            email: r.email.trim().toLowerCase(),
            recipient_name: r.recipient_name?.trim() || null,
          }))
        : null,
    });

    if (rpcErr) {
      if (isMissingTableOrRpcError(rpcErr)) {
        throw createMigrationRequiredError('updateCustomerCompany', rpcErr.message);
      }
      if (rpcErr.message && rpcErr.message.includes('Customer company not found')) {
        const notFoundErr: any = new Error('Customer company not found');
        notFoundErr.statusCode = 404;
        notFoundErr.code = 'NOT_FOUND';
        throw notFoundErr;
      }
      console.error('[updateCustomerCompany] Database error in update_customer_company_atomic RPC:', rpcErr);
      const dbErr: any = new Error(`Database error updating customer company: ${rpcErr.message}`);
      dbErr.code = rpcErr.code || 'DATABASE_ERROR';
      dbErr.statusCode = 500;
      throw dbErr;
    }

    if (!rpcData || !rpcData.success || !rpcData.company) {
      const ambigErr: any = new Error(
        'Ambiguous or incomplete database response from update_customer_company_atomic: company was not confirmed updated.'
      );
      ambigErr.code = 'DATABASE_PERSISTENCE_UNCERTAIN';
      ambigErr.statusCode = 500;
      throw ambigErr;
    }

    return computeCompanyStats(rpcData.company, rpcData.recipients || []);
  }

  // Local fallback ONLY when allowed in non-production
  if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
    throw new Error('Fatal: Customer company update requires a valid Supabase database in production/Worker environment. Local database fallback is strictly prohibited.');
  }

  const store = readLocalStorage(env);
  const compIndex = store.companies.findIndex((c) => c.id === id);
  if (compIndex === -1) {
    const err: any = new Error('Customer company not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const comp = store.companies[compIndex];
  if (params.company_name !== undefined) comp.company_name = params.company_name.trim();
  if (params.contact_person !== undefined) comp.contact_person = params.contact_person?.trim() || null;
  if (params.notes !== undefined) comp.notes = params.notes?.trim() || null;
  comp.updated_at = now;

  if (params.recipients) {
    const existingRecs = store.recipients.filter((r) => r.company_id === id);
    const existingMap = new Map(existingRecs.map((r) => [r.id, r]));
    const nextRecs: CustomerCompanyRecipientRecord[] = [];
    const seenEmails = new Set<string>();

    for (const inputRec of params.recipients) {
      const cleanEmail = inputRec.email.trim().toLowerCase();
      if (seenEmails.has(cleanEmail)) continue;
      seenEmails.add(cleanEmail);

      if (inputRec.id && existingMap.has(inputRec.id)) {
        const current = existingMap.get(inputRec.id)!;
        current.email = cleanEmail;
        current.recipient_name = inputRec.recipient_name?.trim() || null;
        current.updated_at = now;
        nextRecs.push(current);
      } else {
        nextRecs.push({
          id: crypto.randomUUID(),
          company_id: id,
          email: cleanEmail,
          recipient_name: inputRec.recipient_name?.trim() || null,
          invitation_count: 0,
          last_invited_at: null,
          last_invitation_status: 'never_invited',
          last_invitation_error: null,
          created_at: now,
          updated_at: now,
        });
      }
    }

    store.recipients = store.recipients.filter((r) => r.company_id !== id).concat(nextRecs);
  }

  writeLocalStorage(store, env);
  const updatedRecs = store.recipients.filter((r) => r.company_id === id);
  return computeCompanyStats(comp, updatedRecs);
}

/**
 * Delete a customer company
 */
export async function deleteCustomerCompany(id: string, env?: Record<string, any>): Promise<boolean> {
  assertProductionCustomerInvitationsSafe('deleteCustomerCompany', env);

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);

    const { data: existing, error: existErr } = await supabase
      .from('customer_companies')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (existErr) {
      console.error('[deleteCustomerCompany] Database error verifying customer company for deletion:', existErr);
      if (isMissingTableOrRpcError(existErr)) {
        throw createMigrationRequiredError('deleteCustomerCompany', existErr.message);
      }
      throw new Error(`Database error verifying customer company for deletion: ${existErr.message}`);
    } else if (!existing) {
      const err: any = new Error('Customer company not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    } else {
      const { error: delErr } = await supabase.from('customer_companies').delete().eq('id', id);
      if (delErr) {
        if (isMissingTableOrRpcError(delErr)) {
          throw createMigrationRequiredError('deleteCustomerCompany', delErr.message);
        }
        throw new Error(`Database error deleting customer company: ${delErr.message}`);
      }
      return true;
    }
  }

  // Local fallback ONLY when allowed in non-production
  if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
    throw new Error('Fatal: Customer company deletion requires a valid Supabase database in production/Worker environment. Local database fallback is strictly prohibited.');
  }

  const store = readLocalStorage(env);
  const found = store.companies.some((c) => c.id === id);
  if (!found) {
    const err: any = new Error('Customer company not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }
  store.companies = store.companies.filter((c) => c.id !== id);
  store.recipients = store.recipients.filter((r) => r.company_id !== id);
  store.logs = store.logs.filter((l) => l.company_id !== id);
  writeLocalStorage(store, env);
  return true;
}

/**
 * Check if any selected recipient has been previously invited
 */
export async function checkCompanyRecipientsPreviouslyInvited(
  companyId: string,
  recipientIds?: string[],
  env?: Record<string, any>
): Promise<{
  hasPreviouslyInvited: boolean;
  previouslyInvited: CustomerCompanyRecipientRecord[];
  allTargetRecipients: CustomerCompanyRecipientRecord[];
}> {
  assertProductionCustomerInvitationsSafe('checkCompanyRecipientsPreviouslyInvited', env);
  let allRecipients: CustomerCompanyRecipientRecord[] = [];

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('customer_company_recipients')
      .select('*')
      .eq('company_id', companyId);

    if (error) {
      console.error('[checkCompanyRecipientsPreviouslyInvited] Database error querying company recipients:', error);
      if (isMissingTableOrRpcError(error)) {
        throw createMigrationRequiredError('checkCompanyRecipientsPreviouslyInvited', error.message);
      }
      throw new Error(`Database error querying company recipients: ${error.message}`);
    } else {
      allRecipients = data || [];
    }
  } else {
    if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
      throw new Error('Fatal: Checking recipients requires a valid Supabase database in production/Worker environment.');
    }
    const store = readLocalStorage(env);
    allRecipients = store.recipients.filter((r) => r.company_id === companyId);
  }

  // Security: Validate company and recipient associations
  if (recipientIds && recipientIds.length > 0) {
    const validRecipientMap = new Map(allRecipients.map((r) => [r.id, r]));
    for (const rid of recipientIds) {
      if (!validRecipientMap.has(rid)) {
        const err: any = new Error(`Recipient ID "${rid}" does not belong to company "${companyId}"`);
        err.code = 'INVALID_COMPANY_RECIPIENT';
        err.statusCode = 400;
        throw err;
      }
    }
  }

  let targets = allRecipients;
  if (recipientIds && recipientIds.length > 0) {
    const idSet = new Set(recipientIds);
    targets = allRecipients.filter((r) => idSet.has(r.id));
  }

  const previouslyInvited = targets.filter(
    (r) => r.last_invitation_status === 'sent' || ((r.invitation_count || 0) > 0 && r.last_invitation_status !== 'failed')
  );

  return {
    hasPreviouslyInvited: previouslyInvited.length > 0,
    previouslyInvited,
    allTargetRecipients: targets,
  };
}

/**
 * Send invitation emails to recipients of a company
 * Enforces explicit confirmation if any recipient was previously invited!
 */
export async function sendCompanyInvitations(
  companyId: string,
  options: {
    recipientIds?: string[];
    confirmReinvite?: boolean;
    sentByUserId?: string | null;
    env?: Record<string, any>;
    fetchFn?: typeof fetch;
  }
): Promise<{
  success: boolean;
  total: number;
  sent: number;
  failed: number;
  results: Array<{
    recipientId: string;
    email: string;
    status: 'sent' | 'failed';
    messageId?: string;
    error?: string;
  }>;
}> {
  const { recipientIds, confirmReinvite = false, sentByUserId = null, env, fetchFn } = options;

  // 1. Verify company exists
  const company = await getCustomerCompanyById(companyId, env);
  if (!company) {
    throw new Error('Customer company not found');
  }

  // 2. Check previously invited recipients & validate recipient-company association
  const check = await checkCompanyRecipientsPreviouslyInvited(companyId, recipientIds, env);
  if (check.allTargetRecipients.length === 0) {
    throw new Error('No valid recipients selected for invitation');
  }

  // 2B. Prevent unauthorized bulk invitations: maximum 50 recipients per batch
  if (check.allTargetRecipients.length > 50) {
    const batchErr: any = new Error('Batch limit exceeded: Maximum 50 recipients per invitation batch allowed.');
    batchErr.code = 'BATCH_LIMIT_EXCEEDED';
    throw batchErr;
  }

  // 2C. CRITICAL REQUIREMENT: Explicit confirmation required if any recipient was previously successfully invited!
  if (check.hasPreviouslyInvited && !confirmReinvite) {
    const err: any = new Error(
      'One or more selected recipients have already received an invitation. Explicit confirmation is required to re-send.'
    );
    err.code = 'REINVITATION_CONFIRMATION_REQUIRED';
    err.previouslyInvited = check.previouslyInvited.map((r) => ({
      id: r.id,
      email: r.email,
      recipient_name: r.recipient_name,
      invitation_count: r.invitation_count,
      last_invited_at: r.last_invited_at,
    }));
    throw err;
  }

  // 2D. Per-recipient rate limit / cooldown check (prevent rapid automated hammering of same recipient)
  const nowMs = Date.now();
  for (const r of check.allTargetRecipients) {
    if (r.last_invitation_status === 'sent' && r.last_invited_at) {
      const diffMs = nowMs - new Date(r.last_invited_at).getTime();
      // If invited within the last 60 seconds and not retrying after a failure, enforce cooldown
      if (diffMs < 60 * 1000 && !confirmReinvite) {
        const rateErr: any = new Error(
          `Recipient "${r.email}" was sent an invitation less than 1 minute ago. Please wait before re-sending.`
        );
        rateErr.code = 'RECIPIENT_RATE_LIMITED';
        throw rateErr;
      }
    }
  }

  // 2E. Validate Resend sender configuration upfront and fail fast with actionable error
  const senderCheck = validateResendSenderConfig(env);
  if (!senderCheck.valid) {
    console.error(`[Admin Invitations] Sender configuration invalid: ${senderCheck.error}`);
    const configErr: any = new Error(senderCheck.error);
    configErr.code = 'RESEND_CONFIG_MISSING';
    throw configErr;
  }

  // 2F. Validate Resend API key configuration upfront and fail fast with actionable error
  const apiKeyCheck = validateResendApiKeyConfig(env);
  if (!apiKeyCheck.valid) {
    console.error('[Admin Invitations] Server configuration error: RESEND_API_KEY secret is missing or not configured.');
    const configErr: any = new Error(apiKeyCheck.error);
    configErr.code = 'RESEND_CONFIG_MISSING';
    throw configErr;
  }

  // 3. Generate email content reusing existing template
  const emailContent = generateCustomerInvitationEmail({
    companyName: company.company_name,
  });

  const now = new Date().toISOString();
  const results: Array<{
    recipientId: string;
    email: string;
    status: 'sent' | 'failed';
    messageId?: string;
    error?: string;
  }> = [];

  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of check.allTargetRecipients) {
    try {
      // 4. Send each invitation through dedicated Resend service
      const sendResult = await sendEmailViaResend({
        to: recipient.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        fromEmail: senderCheck.fromAddress,
        replyTo: 'eventgamestudio@gmail.com',
        env,
        fetchFn,
      });

      const logId = crypto.randomUUID();
      const status: 'sent' | 'failed' = sendResult.success ? 'sent' : 'failed';

      if (status === 'sent') {
        sentCount++;
      } else {
        failedCount++;
      }

      // 5. Record delivery-provider status and message ID in audit log
      const logRecord: CustomerInvitationLogRecord = {
        id: logId,
        company_id: companyId,
        recipient_id: recipient.id,
        email: recipient.email,
        subject: emailContent.subject,
        provider: 'resend',
        provider_message_id: sendResult.messageId || null,
        status,
        error_message: sendResult.error || null,
        sent_by_user_id: sentByUserId,
        created_at: now,
      };

      // Update recipient record
      const newCount = (recipient.invitation_count || 0) + (status === 'sent' ? 1 : 0);
      const updatedRecipientData = {
        invitation_count: newCount,
        last_invited_at: status === 'sent' ? now : recipient.last_invited_at,
        last_invitation_status: status,
        last_invitation_error: status === 'failed' ? (sendResult.error || 'Delivery failed') : null,
        updated_at: now,
      };

      if (isSupabaseConfigured(env)) {
        const supabase = getSupabaseServerClient(env);
        const { error: dispatchErr } = await supabase.rpc('record_customer_invitation_dispatch_atomic', {
          p_log_id: logId,
          p_company_id: companyId,
          p_recipient_id: recipient.id,
          p_email: recipient.email,
          p_subject: emailContent.subject,
          p_provider: 'resend',
          p_provider_message_id: sendResult.messageId || null,
          p_status: status,
          p_error_message: sendResult.error || null,
          p_sent_by_user_id: sentByUserId,
        });

        if (dispatchErr) {
          if (isMissingTableOrRpcError(dispatchErr)) {
            throw createMigrationRequiredError('record_customer_invitation_dispatch_atomic', dispatchErr.message);
          }
          console.error('[sendCompanyInvitations] Failed recording invitation dispatch atomically in database:', dispatchErr);
          const dbErr: any = new Error(`Database error recording customer invitation dispatch: ${dispatchErr.message}`);
          dbErr.code = dispatchErr.code || 'DATABASE_ERROR';
          dbErr.statusCode = 500;
          throw dbErr;
        }
      } else if (isLocalFallbackAllowed(env)) {
        // Local storage update ONLY in development/test when allowed
        const store = readLocalStorage(env);
        store.logs.unshift(logRecord);
        const recInStore = store.recipients.find((r) => r.id === recipient.id);
        if (recInStore) {
          recInStore.invitation_count = updatedRecipientData.invitation_count;
          if (updatedRecipientData.last_invited_at) {
            recInStore.last_invited_at = updatedRecipientData.last_invited_at;
          }
          recInStore.last_invitation_status = updatedRecipientData.last_invitation_status;
          recInStore.last_invitation_error = updatedRecipientData.last_invitation_error;
          recInStore.updated_at = now;
        }
        writeLocalStorage(store, env);
      }

      results.push({
        recipientId: recipient.id,
        email: recipient.email,
        status,
        messageId: sendResult.messageId,
        error: sendResult.error,
      });
    } catch (sendErr: any) {
      failedCount++;
      const errorMsg = sendErr?.message || 'Failed sending email';
      results.push({
        recipientId: recipient.id,
        email: recipient.email,
        status: 'failed',
        error: errorMsg,
      });
    }
  }

  return {
    success: sentCount > 0,
    total: check.allTargetRecipients.length,
    sent: sentCount,
    failed: failedCount,
    results,
  };
}

/**
 * Handle Resend Webhook Events for delivery status updates and bounce recording
 */
export async function handleCustomerInvitationWebhook(
  payload: any,
  env?: Record<string, any>
): Promise<{
  handled: boolean;
  logId?: string;
  recipientId?: string;
  deliveryStatus?: string;
  message?: string;
}> {
  const processed = processResendWebhookPayload(payload);
  if (!processed.emailId) {
    return { handled: false, message: 'No email ID in webhook payload' };
  }

  const now = new Date().toISOString();

  // Try Supabase first
  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data: logs, error } = await supabase
        .from('customer_invitation_logs')
        .select('*')
        .eq('provider_message_id', processed.emailId)
        .limit(1);

      if (!error && logs && logs.length > 0) {
        const log = logs[0];
        if (processed.deliveryStatus === 'bounced' || processed.deliveryStatus === 'complained') {
          await supabase
            .from('customer_invitation_logs')
            .update({
              status: 'failed',
              error_message: processed.reason,
            })
            .eq('id', log.id);

          await supabase
            .from('customer_company_recipients')
            .update({
              last_invitation_status: 'failed',
              last_invitation_error: processed.reason,
              updated_at: now,
            })
            .eq('id', log.recipient_id);
        } else if (processed.deliveryStatus === 'delivered') {
          await supabase
            .from('customer_invitation_logs')
            .update({
              error_message: processed.reason,
            })
            .eq('id', log.id);
        }

        return {
          handled: true,
          logId: log.id,
          recipientId: log.recipient_id,
          deliveryStatus: processed.deliveryStatus,
        };
      }
    } catch (dbErr) {
      console.warn('Notice: Error handling webhook via Supabase:', dbErr);
      if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
        return {
          handled: false,
          message: `Database error processing webhook: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
        };
      }
    }
  }

  // Local storage fallback ONLY when allowed in non-production
  if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
    return {
      handled: false,
      message: `No customer invitation log found for provider message ID: ${processed.emailId}`,
    };
  }

  const store = readLocalStorage(env);
  const log = store.logs.find((l) => l.provider_message_id === processed.emailId);
  if (log) {
    if (processed.deliveryStatus === 'bounced' || processed.deliveryStatus === 'complained') {
      log.status = 'failed';
      log.error_message = processed.reason;
      const rec = store.recipients.find((r) => r.id === log.recipient_id);
      if (rec) {
        rec.last_invitation_status = 'failed';
        rec.last_invitation_error = processed.reason;
        rec.updated_at = now;
      }
    } else if (processed.deliveryStatus === 'delivered') {
      log.error_message = processed.reason;
    }
    writeLocalStorage(store, env);
    return {
      handled: true,
      logId: log.id,
      recipientId: log.recipient_id,
      deliveryStatus: processed.deliveryStatus,
    };
  }

  return {
    handled: false,
    message: `No customer invitation log found for provider message ID: ${processed.emailId}`,
  };
}

/**
 * List recent invitation logs
 */
export async function listCustomerInvitationLogs(
  limit = 100,
  env?: Record<string, any>
): Promise<CustomerInvitationLogRecord[]> {
  assertProductionCustomerInvitationsSafe('listCustomerInvitationLogs', env);

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('customer_invitation_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[listCustomerInvitationLogs] Database error listing customer invitation logs:', error);
      if (isMissingTableOrRpcError(error)) {
        throw createMigrationRequiredError('listCustomerInvitationLogs', error.message);
      }
      throw new Error(`Database error listing customer invitation logs: ${error.message}`);
    } else if (data) {
      return data;
    }
  }

  // Local storage fallback ONLY when allowed in non-production
  if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
    throw new Error('Fatal: Customer invitation logs require a valid Supabase database in production/Worker environment. Local database fallback is strictly prohibited.');
  }

  const store = readLocalStorage(env);
  return store.logs
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

/**
 * Get overall summary stats for customer invitations
 */
export async function getCustomerInvitationStats(env?: Record<string, any>): Promise<CustomerInvitationStats> {
  assertProductionCustomerInvitationsSafe('getCustomerInvitationStats', env);

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);

    const { count: totalCompanies, error: compErr } = await supabase
      .from('customer_companies')
      .select('*', { count: 'exact', head: true });

    if (compErr) {
      console.error('[getCustomerInvitationStats] Database error calculating customer invitation stats:', compErr);
      if (isMissingTableOrRpcError(compErr)) {
        throw createMigrationRequiredError('getCustomerInvitationStats', compErr.message);
      }
      throw new Error(`Database error calculating customer invitation stats: ${compErr.message}`);
    }

    const { data: recs, error: recErr } = await supabase
      .from('customer_company_recipients')
      .select('invitation_count, last_invited_at');

    if (recErr) {
      console.error('[getCustomerInvitationStats] Database error calculating recipient stats:', recErr);
      if (isMissingTableOrRpcError(recErr)) {
        throw createMigrationRequiredError('getCustomerInvitationStats', recErr.message);
      }
      throw new Error(`Database error calculating recipient stats: ${recErr.message}`);
    }

    const { count: totalLogs, error: logErr } = await supabase
      .from('customer_invitation_logs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent');

    if (logErr) {
      console.error('[getCustomerInvitationStats] Database error calculating invitation logs count:', logErr);
      if (isMissingTableOrRpcError(logErr)) {
        throw createMigrationRequiredError('getCustomerInvitationStats', logErr.message);
      }
      throw new Error(`Database error calculating invitation logs count: ${logErr.message}`);
    }

    const allRecs = recs || [];
    const totalRecipients = allRecs.length;
    const previouslyInvited = allRecs.filter((r) => (r.invitation_count || 0) > 0 || r.last_invited_at != null).length;
    const neverInvited = totalRecipients - previouslyInvited;

    return {
      totalCompanies: totalCompanies || 0,
      totalRecipients,
      neverInvitedRecipients: neverInvited,
      previouslyInvitedRecipients: previouslyInvited,
      totalInvitationsSent: totalLogs || 0,
    };
  }

  // Local storage fallback ONLY when allowed in non-production
  if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
    throw new Error('Fatal: Customer invitation stats require a valid Supabase database in production/Worker environment. Local database fallback is strictly prohibited.');
  }

  const store = readLocalStorage(env);
  const totalCompanies = store.companies.length;
  const totalRecipients = store.recipients.length;
  const previouslyInvited = store.recipients.filter(
    (r) => (r.invitation_count || 0) > 0 || r.last_invited_at != null
  ).length;
  const neverInvited = totalRecipients - previouslyInvited;
  const totalInvitationsSent = store.logs.filter((l) => l.status === 'sent').length;

  return {
    totalCompanies,
    totalRecipients,
    neverInvitedRecipients: neverInvited,
    previouslyInvitedRecipients: previouslyInvited,
    totalInvitationsSent,
  };
}
