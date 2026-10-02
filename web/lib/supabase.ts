import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Written out in full so Next.js inlines them into the browser bundle.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

// Call only in the browser, and only when supabaseConfigured is true.
export function supabase(): SupabaseClient {
  return (client ??= createClient(url, anonKey));
}
