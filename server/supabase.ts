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
      : {}),
  });

  clientCache.set(cacheKey, client);
  return client;
}

export const supabase = {
  get client(): SupabaseClient {
    return getSupabaseServerClient();
  },
};
