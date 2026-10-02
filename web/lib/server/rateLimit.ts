import { supabaseEnabled } from './env';
import { supabaseAdmin } from './supabaseAdmin';

const WINDOW_MS = 5 * 60 * 1000;
const MAX_TURNS = 40; // messages per IP per window
const MAX_SPEECH = 150; // sentences of server voice per IP per window (a reply is a few sentences)

// Serverless instances share no memory, so with Supabase the count lives in the rate_events table.
// Without it (local development) a per-process counter is enough.
const local = new Map<string, number[]>();

export const allowTurn = (ip: string) => allow(ip, MAX_TURNS);
// Server voice has its own budget, so speaking a reply never uses up the message limit.
export const allowSpeech = (ip: string) => allow(`tts:${ip}`, MAX_SPEECH);

async function allow(ip: string, max: number): Promise<boolean> {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  if (!supabaseEnabled) {
    const recent = (local.get(ip) || []).filter((t) => t > cutoff);
    if (recent.length >= max) return false;
    local.set(ip, [...recent, now]);
    return true;
  }

  const db = supabaseAdmin();
  const { count, error } = await db
    .from('rate_events')
    .select('*', { count: 'exact', head: true })
    .eq('ip', ip)
    .gt('at', cutoff);
  if (error) throw new Error(`Supabase: ${error.message}`);
  if ((count ?? 0) >= max) return false;
  const inserted = await db.from('rate_events').insert({ ip, at: now });
  if (inserted.error) throw new Error(`Supabase: ${inserted.error.message}`);
  // Clear out old rows now and then.
  if (Math.random() < 0.02) await db.from('rate_events').delete().lt('at', cutoff);
  return true;
}
