import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverConfig, supabaseEnabled } from './env';

let client: SupabaseClient | null = null;

// Uses the service role key, which bypasses row level security: server code only, never the browser.
export function supabaseAdmin(): SupabaseClient {
  if (!supabaseEnabled) throw new Error('Supabase is not configured');
  return (client ??= createClient(serverConfig.supabase.url, serverConfig.supabase.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}
