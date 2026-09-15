import { getSupabaseServerClient, isLocalFallbackAllowed, isSupabaseConfigured } from '../supabase.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface ApiErrorLogRecord {
  id: string;
  request_id: string;
  created_at: string;
  user_id: string | null;
  method: string | null;
  endpoint: string | null;
  status_code: number | null;
  error_type: string | null;
  error_code: string | null;
  error_message: string | null;
  stack_trace: string | null;
  service: string | null;
  metadata: Record<string, any> | null;
}

export interface CreateApiErrorLogParams {
  request_id: string;
  user_id?: string | null;
  method?: string | null;
  endpoint?: string | null;
  status_code?: number | null;
  error_type?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  stack_trace?: string | null;
  service?: string | null;
  metadata?: Record<string, any> | null;
}

export interface ListApiErrorLogsParams {
  page?: number;
  pageSize?: number;
  requestId?: string;
  startDate?: string;
  endDate?: string;
  endpoint?: string;
  statusCode?: number;
  service?: string;
  errorType?: string;
  userId?: string;
  search?: string;
}

const uploadsDir = path.join(process.cwd(), 'uploads');
const LOCAL_ERROR_LOGS_FILE = path.join(uploadsDir, 'api_error_logs.json');
const MAX_LOCAL_ERROR_LOGS = 2000;

function ensureUploadsDir() {
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  } catch {
    // ignore
  }
}

function readLocalErrorLogs(env?: Record<string, any>): ApiErrorLogRecord[] {
  try {
    if (!isLocalFallbackAllowed(env)) return [];
    ensureUploadsDir();
    if (!fs.existsSync(LOCAL_ERROR_LOGS_FILE)) {
      return [];
    }
    const data = fs.readFileSync(LOCAL_ERROR_LOGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading local error logs fallback:', err);
    return [];
  }
}

function writeLocalErrorLogs(logs: ApiErrorLogRecord[], env?: Record<string, any>) {
  try {
    if (!isLocalFallbackAllowed(env)) return;
    ensureUploadsDir();
    // Keep only the most recent records
    const trimmed = logs.slice(0, MAX_LOCAL_ERROR_LOGS);
    fs.writeFileSync(LOCAL_ERROR_LOGS_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing local error logs fallback:', err);
  }
}

/**
 * Persists an API error record to Supabase with local fallback.
 * CRITICAL: This function is strictly defensive and will never throw.
 */
export async function logApiError(
  params: CreateApiErrorLogParams,
  env?: Record<string, any>
): Promise<ApiErrorLogRecord | null> {
  try {
    const record: ApiErrorLogRecord = {
      id: crypto.randomUUID(),
      request_id: params.request_id,
      created_at: new Date().toISOString(),
      user_id: params.user_id || null,
      method: params.method ? params.method.toUpperCase() : null,
      endpoint: params.endpoint || null,
      status_code: params.status_code !== undefined && params.status_code !== null ? Number(params.status_code) : 500,
      error_type: params.error_type || 'Error',
      error_code: params.error_code || null,
      error_message: params.error_message || null,
      stack_trace: params.stack_trace || null,
      service: params.service || 'unknown',
      metadata: params.metadata || {},
    };

    if (isSupabaseConfigured(env)) {
      const supabase = getSupabaseServerClient(env);
      const { error } = await supabase
        .from('api_error_logs')
        .insert({
          id: record.id,
          request_id: record.request_id,
          created_at: record.created_at,
          user_id: record.user_id,
          method: record.method,
          endpoint: record.endpoint,
          status_code: record.status_code,
          error_type: record.error_type,
          error_code: record.error_code,
          error_message: record.error_message,
          stack_trace: record.stack_trace,
          service: record.service,
          metadata: record.metadata,
        });

      if (error) {
        // If Supabase insert failed, log to console and local store fallback if allowed
        console.error('[ErrorLogger] Supabase insertion error:', error.message);
        if (isLocalFallbackAllowed(env)) {
          const localLogs = readLocalErrorLogs(env);
          localLogs.unshift(record);
          writeLocalErrorLogs(localLogs, env);
        }
      }
      return record;
    }

    // Local fallback store
    if (isLocalFallbackAllowed(env)) {
      const localLogs = readLocalErrorLogs(env);
      localLogs.unshift(record);
      writeLocalErrorLogs(localLogs, env);
    }
    return record;
  } catch (err) {
    // Defensive guarantee: Never allow error logging failure to propagate or crash API handler
    console.error('[ErrorLogger Fallback] Failed to log API error to storage:', err);
    return null;
  }
}

/**
 * Retrieves paginated, filtered error logs for Developer/Admin inspection.
 */
export async function listApiErrorLogs(
  params: ListApiErrorLogsParams = {},
  env?: Record<string, any>
): Promise<{
  data: ApiErrorLogRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}> {
  const page = Math.max(1, Number(params.page) || 1);
  const requestedPageSize = Number(params.pageSize) || 25;
  // Bounded page size: minimum 1, maximum 100
  const pageSize = Math.min(100, Math.max(1, requestedPageSize));

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      let query = supabase
        .from('api_error_logs')
        .select('*', { count: 'exact' });

      if (params.requestId) {
        query = query.ilike('request_id', `%${params.requestId.trim()}%`);
      }
      if (params.service) {
        query = query.eq('service', params.service.trim().toLowerCase());
      }
      if (params.statusCode) {
        query = query.eq('status_code', Number(params.statusCode));
      }
      if (params.errorType) {
        query = query.ilike('error_type', `%${params.errorType.trim()}%`);
      }
      if (params.endpoint) {
        query = query.ilike('endpoint', `%${params.endpoint.trim()}%`);
      }
      if (params.userId) {
        query = query.eq('user_id', params.userId.trim());
      }
      if (params.startDate) {
        query = query.gte('created_at', params.startDate);
      }
      if (params.endDate) {
        query = query.lte('created_at', params.endDate);
      }
      if (params.search) {
        const s = params.search.trim();
        query = query.or(`request_id.ilike.%${s}%,error_message.ilike.%${s}%,endpoint.ilike.%${s}%,error_code.ilike.%${s}%`);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('[ErrorLogger] Supabase listApiErrorLogs error:', error.message);
        throw error;
      }

      const total = count ?? (data?.length || 0);
      const totalPages = Math.ceil(total / pageSize) || 1;

      return {
        data: (data as ApiErrorLogRecord[]) || [],
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      };
    } catch (err) {
      console.warn('[ErrorLogger] Falling back to local store for listApiErrorLogs:', err);
    }
  }

  // Local fallback handling
  let allLogs = readLocalErrorLogs(env);

  if (params.requestId) {
    const q = params.requestId.trim().toLowerCase();
    allLogs = allLogs.filter(l => l.request_id.toLowerCase().includes(q));
  }
  if (params.service) {
    const s = params.service.trim().toLowerCase();
    allLogs = allLogs.filter(l => (l.service || '').toLowerCase() === s);
  }
  if (params.statusCode) {
    const sc = Number(params.statusCode);
    allLogs = allLogs.filter(l => l.status_code === sc);
  }
  if (params.errorType) {
    const et = params.errorType.trim().toLowerCase();
    allLogs = allLogs.filter(l => (l.error_type || '').toLowerCase().includes(et));
  }
  if (params.endpoint) {
    const ep = params.endpoint.trim().toLowerCase();
    allLogs = allLogs.filter(l => (l.endpoint || '').toLowerCase().includes(ep));
  }
  if (params.userId) {
    allLogs = allLogs.filter(l => l.user_id === params.userId);
  }
  if (params.startDate) {
    const start = new Date(params.startDate).getTime();
    allLogs = allLogs.filter(l => new Date(l.created_at).getTime() >= start);
  }
  if (params.endDate) {
    const end = new Date(params.endDate).getTime();
    allLogs = allLogs.filter(l => new Date(l.created_at).getTime() <= end);
  }
  if (params.search) {
    const s = params.search.trim().toLowerCase();
    allLogs = allLogs.filter(
      l =>
        l.request_id.toLowerCase().includes(s) ||
        (l.error_message || '').toLowerCase().includes(s) ||
        (l.endpoint || '').toLowerCase().includes(s) ||
        (l.error_code || '').toLowerCase().includes(s)
    );
  }

  // Sort descending by created_at
  allLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const total = allLogs.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const paginatedLogs = allLogs.slice(startIndex, startIndex + pageSize);

  return {
    data: paginatedLogs,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  };
}

/**
 * Fetch a single error log by ID for developer admin inspection.
 */
export async function getApiErrorLogById(
  id: string,
  env?: Record<string, any>
): Promise<ApiErrorLogRecord | null> {
  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('api_error_logs')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return null;
      }
      return data as ApiErrorLogRecord;
    } catch {
      // fallback
    }
  }

  const allLogs = readLocalErrorLogs(env);
  return allLogs.find(l => l.id === id) || null;
}
