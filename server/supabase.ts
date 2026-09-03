import { createClient, SupabaseClient } from '@supabase/supabase-js';

const clientCache = new Map<string, SupabaseClient>();

/**
 * Returns the server-side Supabase client initialized with the Service Role Key.
 *
 * CRITICAL SECURITY RULE:
 * This client runs exclusively server-side with elevated privileges (service_role),
 * allowing trusted backend operations while enforcing authorization checks in the API layer.
 * This must NEVER be imported or exposed to browser code.
 */
export function getSupabaseServerClient(env?: Record<string, any>): SupabaseClient {
  const procEnv = typeof process !== 'undefined' ? process.env : {};
  const supabaseUrl =
    env?.SUPABASE_URL ||
    env?.VITE_SUPABASE_URL ||
    procEnv.SUPABASE_URL ||
    procEnv.VITE_SUPABASE_URL ||
    'https://placeholder-project.supabase.co';

  const serviceRoleKey =
    env?.SUPABASE_SERVICE_ROLE_KEY ||
    env?.SUPABASE_KEY ||
    procEnv.SUPABASE_SERVICE_ROLE_KEY ||
    procEnv.SUPABASE_KEY ||
    'placeholder-service-key';

  const cacheKey = `${supabaseUrl}:${serviceRoleKey}`;
  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey)!;
  }

  const isPlaceholder = supabaseUrl.includes('placeholder') || serviceRoleKey.includes('placeholder');

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    ...(isPlaceholder
      ? {
          global: {
            fetch: async () => {
              return new Response(
                JSON.stringify({
                  code: 'PGRST000',
                  message: 'Placeholder Supabase credentials - fast fallback to local store',
                }),
                {
                  status: 400,
                  headers: { 'Content-Type': 'application/json' },
                }
              );
            },
          },
        }
      : supabaseUrl.includes('test-error')
      ? {
          global: {
            fetch: async () => {
              return new Response(
                JSON.stringify({
                  code: 'PGRST500',
                  message: 'Database connection failed during test',
                }),
                {
                  status: 500,
                  headers: { 'Content-Type': 'application/json' },
                }
              );
            },
          },
        }
      : {}),
  });

  clientCache.set(cacheKey, client);
  return client;
}

export function isSupabaseConfigured(env?: Record<string, any>): boolean {
  const procEnv = typeof process !== 'undefined' ? process.env : {};
  const supabaseUrl =
    env?.SUPABASE_URL ||
    env?.VITE_SUPABASE_URL ||
    procEnv.SUPABASE_URL ||
    procEnv.VITE_SUPABASE_URL ||
    '';
  const serviceRoleKey =
    env?.SUPABASE_SERVICE_ROLE_KEY ||
    env?.SUPABASE_KEY ||
    procEnv.SUPABASE_SERVICE_ROLE_KEY ||
    procEnv.SUPABASE_KEY ||
    '';

  if (!supabaseUrl || !serviceRoleKey) return false;
  if (supabaseUrl.includes('placeholder') || serviceRoleKey.includes('placeholder')) return false;
  return true;
}

/**
 * Detects if the current execution runtime is Cloudflare Workers / Serverless Edge.
 */
export function isCloudflareWorkerRuntime(): boolean {
  return (
    typeof (globalThis as any).WebSocketPair !== 'undefined' ||
    (typeof navigator !== 'undefined' && (navigator as any)?.userAgent === 'Cloudflare-Workers') ||
    (typeof (globalThis as any).caches !== 'undefined' && typeof (globalThis as any).caches?.default !== 'undefined')
  );
}

/**
 * Checks if the current execution context is in production mode or running in Cloudflare Workers.
 */
export function isProductionEnvironment(env?: Record<string, any>): boolean {
  const procEnv = typeof process !== 'undefined' ? process.env : {};
  const nodeEnv = env?.NODE_ENV || procEnv.NODE_ENV || '';
  const appEnv = env?.ENVIRONMENT || env?.APP_ENV || procEnv.ENVIRONMENT || procEnv.APP_ENV || '';
  return nodeEnv === 'production' || appEnv === 'production' || isCloudflareWorkerRuntime();
}

/**
 * PRODUCTION SAFETY RULE:
 * Local in-memory or JSON-file fallback is strictly prohibited in production mode and Cloudflare Workers.
 * Production configuration CANNOT accidentally enable local storage via flags or environment variables.
 * Fallback is only enabled in development/test when NODE_ENV !== 'production' and not running on Cloudflare Workers.
 */
export function isLocalFallbackAllowed(env?: Record<string, any>): boolean {
  // CRITICAL: In production or Cloudflare Workers, local fallback is strictly prohibited.
  // Production configuration cannot accidentally enable local storage under any circumstances.
  if (isProductionEnvironment(env)) {
    return false;
  }

  const procEnv = typeof process !== 'undefined' ? process.env : {};
  const explicitAllow =
    env?.ALLOW_LOCAL_FALLBACK === 'true' ||
    procEnv.ALLOW_LOCAL_FALLBACK === 'true' ||
    env?.ALLOW_LOCAL_FALLBACK === true ||
    env?.ENABLE_LOCAL_FALLBACK === 'true' ||
    procEnv.ENABLE_LOCAL_FALLBACK === 'true' ||
    env?.ENABLE_LOCAL_FALLBACK === true;

  if (explicitAllow) return true;

  // Allowed in local dev / test mock sandbox without production flags
  return true;
}

/**
 * Guard assertion for critical mutation operations (wallet, payment, topup, organization creation).
 * Throws a fatal error if execution is in production mode or Cloudflare Workers without a configured Supabase database.
 */
export function assertProductionSafe(operationName: string, env?: Record<string, any>): void {
  if (!isLocalFallbackAllowed(env) && !isSupabaseConfigured(env)) {
    throw new Error(
      `Fatal: Financial database operation "${operationName}" cannot proceed without a valid Supabase database connection in production/Worker environment. Local database fallback is strictly disabled for financial integrity.`
    );
  }
}

/**
 * Guard assertion for production leaderboard operations.
 * Throws a fatal error if execution is in production mode or Cloudflare Workers without a configured Supabase database.
 * Ensures local JSON/file fallback is never silently used in production.
 */
export function assertProductionLeaderboardSafe(operationName: string, env?: Record<string, any>): void {
  if (isProductionEnvironment(env) || !isLocalFallbackAllowed(env)) {
    if (!isSupabaseConfigured(env)) {
      throw new Error(
        `Fatal: Production leaderboard operation "${operationName}" requires a valid Supabase/PostgreSQL database connection. Local JSON/file fallback is strictly prohibited in production.`
      );
    }
  }
}

export const supabase = {
  get client(): SupabaseClient {
    return getSupabaseServerClient();
  },
};
