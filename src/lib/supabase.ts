import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

/**
 * Returns the client-side Supabase client initialized with the Anonymous / Public Key.
 *
 * CRITICAL SECURITY RULE:
 * Only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY may be accessed in the browser.
 * NEVER import or expose the Service Role key here.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  const runtimeEnv = typeof window !== 'undefined' ? (window as any).__ENV__ : undefined;
  const url = runtimeEnv?.VITE_SUPABASE_URL || runtimeEnv?.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const anonKey = runtimeEnv?.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  supabaseClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClient;
}
