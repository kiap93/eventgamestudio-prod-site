import { getSupabaseServerClient, isLocalFallbackAllowed } from '../supabase.js';

export interface ResilienceOptions {
  operation?: string;
  correlationId?: string;
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  deadlineMs?: number; // Absolute timestamp (Date.now() + budget) when execution budget expires
  timeoutBudgetMs?: number; // Relative timeout budget in milliseconds
  env?: Record<string, any>;
}

export interface StructuredDiagnosticLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  correlationId: string;
  operation: string;
  attempt: number;
  maxRetries: number;
  elapsedMs: number;
  status: number | null;
  postgrestCode: string | null;
  message: string;
  isTransient: boolean;
  metadata?: Record<string, any>;
}

/**
 * Detects whether a database error is transient and eligible for retry.
 * 
 * Transient errors include:
 * - HTTP 503 Service Unavailable (e.g. PostgREST schema cache not yet loaded / upstream unavailable)
 * - HTTP 502 / 504 / 429
 * - PostgREST PGRST003 (Timed out acquiring a connection from the connection pool)
 * - PostgREST PGRST000 (Gateway timeout / placeholder)
 * - PostgREST PGRST106 (Schema cache error during reload)
 * - Postgres SQLSTATE:
 *     57014 (query_canceled / statement timeout)
 *     53300 (too_many_connections)
 *     53400 (configuration_limit_exceeded)
 *     08000, 08001, 08003, 08004, 08006 (connection exceptions)
 * - Fetch/Network failures: fetch failed, ECONNRESET, ETIMEDOUT, etc.
 */
export function isTransientDatabaseError(err: any): boolean {
  if (!err) return false;

  const status = Number(err.status || err.statusCode || (err.code && !isNaN(Number(err.code)) ? Number(err.code) : null));
  const code = String(err.code || err.postgresCode || '').toUpperCase();
  const rawMsg = String(err.message || err.details || err.hint || '').toLowerCase();

  // Fail-fast on subrequest limit errors - retries in the same invocation can never succeed
  if (rawMsg.includes('too many subrequests') || rawMsg.includes('subrequest limit')) {
    return false;
  }

  // 1. HTTP Status code checks
  if (status === 503 || status === 502 || status === 504 || status === 429) {
    return true;
  }

  // 2. PostgREST specific error codes (connection errors PGRST0xx, schema cache PGRST106)
  if (
    code.startsWith('PGRST0') || // PGRST000, PGRST001, PGRST002, PGRST003 (pool timeout)
    code === 'PGRST106' ||        // Schema cache reload in progress
    (code === 'PGRST204' && rawMsg.includes('schema cache')) ||
    (code === 'PGRST202' && rawMsg.includes('schema cache'))
  ) {
    return true;
  }

  // 3. PostgreSQL connection / resource limit codes
  if (
    code === '57014' || // statement timeout / query canceled
    code === '53300' || // too_many_connections
    code === '53400' || // configuration_limit_exceeded
    code === '40001' || // serialization_failure
    code === '40P01' || // deadlock_detected
    code.startsWith('08') // connection exceptions (08000, 08001, 08003, 08004, 08006, etc.)
  ) {
    return true;
  }

  // 4. Message patterns indicating transient connection or schema cache state
  if (
    rawMsg.includes('schema cache not yet loaded') ||
    rawMsg.includes('schema cache is loading') ||
    rawMsg.includes('schema cache') ||
    rawMsg.includes('connection pool') ||
    rawMsg.includes('timed out acquiring a connection') ||
    rawMsg.includes('pool timeout') ||
    rawMsg.includes('too many connections') ||
    rawMsg.includes('fetch failed') ||
    rawMsg.includes('econnreset') ||
    rawMsg.includes('etimedout') ||
    rawMsg.includes('econnrefused') ||
    rawMsg.includes('network error') ||
    rawMsg.includes('service unavailable') ||
    rawMsg.includes('gateway timeout') ||
    rawMsg.includes('upstream connect error') ||
    rawMsg.includes('pgrst003')
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts normalized status and PostgREST/Postgres code from an error.
 */
export function extractErrorDiagnostics(err: any): {
  status: number | null;
  postgrestCode: string | null;
  message: string;
} {
  if (!err) {
    return { status: null, postgrestCode: null, message: 'Unknown error' };
  }

  let status: number | null = null;
  const numStatus = Number(err.status || err.statusCode);
  if (!isNaN(numStatus) && numStatus >= 100 && numStatus <= 599) {
    status = numStatus;
  } else if (err.code === '503' || err.code === 503) {
    status = 503;
  }

  const postgrestCode = err.code && typeof err.code === 'string' && err.code.trim() ? err.code.trim() : null;
  const message = typeof err.message === 'string' ? err.message : String(err);

  return { status, postgrestCode, message };
}

/**
 * Logs structured diagnostic information in safe, non-leaking JSON.
 */
export function logDiagnostic(log: StructuredDiagnosticLog): void {
  const line = `[Supabase Resilience][${log.correlationId}][${log.operation}] ${JSON.stringify(log)}`;
  if (log.level === 'error') {
    console.error(line);
  } else if (log.level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * Executes an asynchronous database operation with bounded exponential-backoff retries with full jitter,
 * execution budget awareness, and structured diagnostic logging.
 *
 * Automatically inspects Supabase PostgrestResponse objects ({ data, error, status })
 * and triggers resilience retries if a transient database failure is returned without throwing.
 */
export async function executeWithResilience<T>(
  operation: () => Promise<T>,
  options: ResilienceOptions = {}
): Promise<T> {
  const opName = options.operation || 'database_operation';
  const correlationId = options.correlationId || crypto.randomUUID();
  const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
  const initialDelayMs = options.initialDelayMs !== undefined ? options.initialDelayMs : 200;
  const maxDelayMs = options.maxDelayMs !== undefined ? options.maxDelayMs : 2500;
  const backoffFactor = options.backoffFactor !== undefined ? options.backoffFactor : 2;

  const startTime = Date.now();
  const deadlineMs =
    options.deadlineMs ||
    (options.timeoutBudgetMs ? startTime + options.timeoutBudgetMs : startTime + 20000);

  let attempt = 0;

  while (true) {
    attempt++;
    try {
      const result = await operation();

      // Inspect single Supabase PostgrestResponse object
      if (result && typeof result === 'object' && 'error' in result && (result as any).error) {
        const queryErr = (result as any).error;
        if ((result as any).status && !queryErr.status) {
          queryErr.status = (result as any).status;
        }
        if (isTransientDatabaseError(queryErr) || isTransientDatabaseError(result)) {
          throw queryErr;
        }
      }
      // Inspect array of results (e.g. from Promise.all([q1, q2, q3]))
      else if (Array.isArray(result)) {
        for (const item of result) {
          if (item && typeof item === 'object' && item.error) {
            const queryErr = item.error;
            if (item.status && !queryErr.status) {
              queryErr.status = item.status;
            }
            if (isTransientDatabaseError(queryErr) || isTransientDatabaseError(item)) {
              throw queryErr;
            }
          }
        }
      }

      return result;
    } catch (err: any) {
      const isTransient = isTransientDatabaseError(err);
      const elapsedMs = Date.now() - startTime;
      const { status, postgrestCode, message } = extractErrorDiagnostics(err);

      // If error is not transient, fail fast immediately (e.g. 400, 401, 403, 404, 422, constraint violations)
      if (!isTransient) {
        logDiagnostic({
          timestamp: new Date().toISOString(),
          level: 'error',
          correlationId,
          operation: opName,
          attempt,
          maxRetries,
          elapsedMs,
          status,
          postgrestCode,
          message,
          isTransient: false,
        });
        throw err;
      }

      // Check if retry count exhausted
      if (attempt > maxRetries) {
        logDiagnostic({
          timestamp: new Date().toISOString(),
          level: 'error',
          correlationId,
          operation: opName,
          attempt,
          maxRetries,
          elapsedMs,
          status: status || 503,
          postgrestCode,
          message: `Retries exhausted after ${maxRetries} attempts: ${message}`,
          isTransient: true,
        });
        throw err;
      }

      // Calculate exponential backoff with full jitter
      const exponentialDelay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
      const cappedDelay = Math.min(maxDelayMs, exponentialDelay);
      // Full jitter: random uniformly between 0 and cappedDelay
      const jitteredDelay = Math.floor(Math.random() * cappedDelay);

      // Check execution budget: stop retrying if remaining budget is exhausted
      const now = Date.now();
      if (now + jitteredDelay > deadlineMs) {
        logDiagnostic({
          timestamp: new Date().toISOString(),
          level: 'error',
          correlationId,
          operation: opName,
          attempt,
          maxRetries,
          elapsedMs,
          status: status || 503,
          postgrestCode,
          message: `Execution budget exhausted (${now - startTime}ms elapsed, deadline in ${deadlineMs - now}ms). Aborting retries to prevent retry storm.`,
          isTransient: true,
        });
        throw err;
      }

      logDiagnostic({
        timestamp: new Date().toISOString(),
        level: 'warn',
        correlationId,
        operation: opName,
        attempt,
        maxRetries,
        elapsedMs,
        status: status || 503,
        postgrestCode,
        message: `Transient error encountered: ${message}. Retrying in ${jitteredDelay}ms (attempt ${attempt}/${maxRetries})...`,
        isTransient: true,
      });

      await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
    }
  }
}

// ============================================================================
// Database-Backed Expiring Lease for Scheduled Maintenance Coordination
// ============================================================================

const LEASE_KEY = 'event_lifecycle_maintenance_lease';
const DEFAULT_LEASE_DURATION_MS = 90 * 1000; // 90 seconds lease validity

// Process-local mutex to prevent concurrent runs within the same worker/server instance
let isLocalMaintenanceRunning = false;

export interface MaintenanceLeaseRecord {
  holder: string;
  acquired_at: string;
  expires_at: string;
  last_heartbeat: string;
  status: 'ACTIVE' | 'RELEASED';
}

/**
 * Attempts to acquire the database-backed maintenance lease.
 * 
 * Returns:
 * - { acquired: true, leaseHolder: string }: successfully acquired, safe to proceed.
 * - { acquired: false, reason: string, currentHolder?: string, expiresAt?: string }: active lease held elsewhere, skip.
 */
export async function acquireMaintenanceLease(
  env?: Record<string, any>,
  options?: { leaseDurationMs?: number; correlationId?: string }
): Promise<{
  acquired: boolean;
  leaseHolder: string;
  reason?: string;
  currentHolder?: string;
  expiresAt?: string;
}> {
  const correlationId = options?.correlationId || crypto.randomUUID();
  const leaseHolder = `maint_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const durationMs = options?.leaseDurationMs || DEFAULT_LEASE_DURATION_MS;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMs).toISOString();

  // 1. In-process mutex check
  if (isLocalMaintenanceRunning) {
    return {
      acquired: false,
      leaseHolder,
      reason: 'IN_PROCESS_EXECUTION_RUNNING',
    };
  }

  // 2. In local dev / test mock sandbox without Supabase connection
  if (isLocalFallbackAllowed(env)) {
    isLocalMaintenanceRunning = true;
    return { acquired: true, leaseHolder };
  }

  const supabase = getSupabaseServerClient(env);
  if (!supabase) {
    isLocalMaintenanceRunning = true;
    return { acquired: true, leaseHolder };
  }

  try {
    const res = await executeWithResilience(
      async () => {
        // Read current lease state
        const { data, error } = await supabase
          .from('platform_settings')
          .select('value, updated_at')
          .eq('key', LEASE_KEY)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        let currentLease: MaintenanceLeaseRecord | null = null;
        if (data && data.value) {
          currentLease = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        }

        // Check if an active non-expired lease is already held by another worker
        if (currentLease && currentLease.status === 'ACTIVE') {
          const currentExpiresAt = new Date(currentLease.expires_at).getTime();
          if (currentExpiresAt > now.getTime()) {
            return {
              acquired: false,
              leaseHolder,
              reason: 'ACTIVE_LEASE_HELD',
              currentHolder: currentLease.holder,
              expiresAt: currentLease.expires_at,
            };
          }
        }

        // Lease is either absent, released, or expired -> Acquire it
        const newLeaseValue: MaintenanceLeaseRecord = {
          holder: leaseHolder,
          acquired_at: now.toISOString(),
          expires_at: expiresAt,
          last_heartbeat: now.toISOString(),
          status: 'ACTIVE',
        };

        const { error: upsertErr } = await supabase
          .from('platform_settings')
          .upsert(
            {
              key: LEASE_KEY,
              value: newLeaseValue,
              description: 'Coordination lease for event lifecycle maintenance cron job',
              updated_at: now.toISOString(),
            },
            { onConflict: 'key' }
          );

        if (upsertErr) {
          throw upsertErr;
        }

        // Verify acquisition: re-read to ensure we won the race under concurrency
        const { data: verifyData } = await supabase
          .from('platform_settings')
          .select('value')
          .eq('key', LEASE_KEY)
          .maybeSingle();

        if (verifyData && verifyData.value) {
          const verified = typeof verifyData.value === 'string' ? JSON.parse(verifyData.value) : verifyData.value;
          if (verified?.holder && verified.holder !== leaseHolder && verified.status === 'ACTIVE') {
            return {
              acquired: false,
              leaseHolder,
              reason: 'CONCURRENT_RACE_LOST',
              currentHolder: verified.holder,
              expiresAt: verified.expires_at,
            };
          }
        }

        return { acquired: true, leaseHolder };
      },
      {
        operation: 'acquire_maintenance_lease',
        correlationId,
        maxRetries: 2,
        initialDelayMs: 150,
        env,
      }
    );

    if (res.acquired) {
      isLocalMaintenanceRunning = true;
      logDiagnostic({
        timestamp: new Date().toISOString(),
        level: 'info',
        correlationId,
        operation: 'acquire_maintenance_lease',
        attempt: 1,
        maxRetries: 2,
        elapsedMs: Date.now() - now.getTime(),
        status: 200,
        postgrestCode: null,
        message: `Acquired maintenance lease: holder=${leaseHolder}, expires_at=${expiresAt}`,
        isTransient: false,
      });
    } else {
      logDiagnostic({
        timestamp: new Date().toISOString(),
        level: 'info',
        correlationId,
        operation: 'acquire_maintenance_lease',
        attempt: 1,
        maxRetries: 2,
        elapsedMs: Date.now() - now.getTime(),
        status: 200,
        postgrestCode: null,
        message: `Skipped maintenance: active lease held by ${res.currentHolder} until ${res.expiresAt}`,
        isTransient: false,
      });
    }

    return res;
  } catch (err: any) {
    const isTransient = isTransientDatabaseError(err);
    logDiagnostic({
      timestamp: new Date().toISOString(),
      level: 'warn',
      correlationId,
      operation: 'acquire_maintenance_lease',
      attempt: 1,
      maxRetries: 2,
      elapsedMs: Date.now() - now.getTime(),
      status: err?.status || null,
      postgrestCode: err?.code || null,
      message: `Failed to acquire database lease due to error: ${err?.message || err}. Skipping execution for safety.`,
      isTransient,
    });
    // In production, if database is completely unavailable, fail safely without running uncoordinated maintenance
    return {
      acquired: false,
      leaseHolder,
      reason: 'DATABASE_LEASE_ERROR',
    };
  }
}

/**
 * Releases the database-backed maintenance lease upon completion.
 */
export async function releaseMaintenanceLease(
  leaseHolder: string,
  env?: Record<string, any>,
  correlationId?: string
): Promise<void> {
  isLocalMaintenanceRunning = false;

  if (isLocalFallbackAllowed(env) || !leaseHolder) {
    return;
  }

  const supabase = getSupabaseServerClient(env);
  if (!supabase) return;

  const cid = correlationId || crypto.randomUUID();
  try {
    await executeWithResilience(
      async () => {
        const releasedLease: MaintenanceLeaseRecord = {
          holder: leaseHolder,
          acquired_at: new Date().toISOString(),
          expires_at: new Date().toISOString(),
          last_heartbeat: new Date().toISOString(),
          status: 'RELEASED',
        };

        await supabase
          .from('platform_settings')
          .update({
            value: releasedLease,
            updated_at: new Date().toISOString(),
          })
          .eq('key', LEASE_KEY);
      },
      {
        operation: 'release_maintenance_lease',
        correlationId: cid,
        maxRetries: 1,
        initialDelayMs: 100,
        env,
      }
    );
  } catch (err: any) {
    console.warn(`[Supabase Resilience][${cid}] Non-fatal lease release notice:`, err?.message || err);
  }
}
