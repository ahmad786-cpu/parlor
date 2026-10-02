import { createClient } from '@supabase/supabase-js';
import { config, supabaseEnabled } from './config.js';

let client = null;

// Server-side client with the service role key: bypasses row level security, so never send it to browsers.
export function supabase() {
  if (!supabaseEnabled) throw new Error('Supabase is not configured');
  client ||= createClient(config.supabase.url, config.supabase.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
