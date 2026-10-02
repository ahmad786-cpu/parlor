import { supabaseAdmin } from '../supabaseAdmin';
import type { StoredConversation, StoredPersonality } from '../types';
import type { Store } from './index';

// Each row keeps the whole record in `data`; the other columns exist only for lookups and sorting.
// Tables are created by supabase.sql.
const table = (name: string) => supabaseAdmin().from(name);

function rows<T>({ data, error }: { data: T | null; error: { message: string } | null }): T | null {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

type Row<T> = { data: T };

export const supabaseStore: Store = {
  async listPersonalities(ownerId) {
    const res = await table('personalities').select('data').eq('owner_id', ownerId).order('updated_at', { ascending: false });
    return (rows(res) as Row<StoredPersonality>[] | null)?.map((r) => r.data) || [];
  },
  async getPersonality(id) {
    const res = await table('personalities').select('data').eq('id', id).maybeSingle();
    return (rows(res) as Row<StoredPersonality> | null)?.data || null;
  },
  async getPersonalityByToken(token) {
    const res = await table('personalities').select('data').eq('share_token', token).maybeSingle();
    return (rows(res) as Row<StoredPersonality> | null)?.data || null;
  },
  async savePersonality(p) {
    rows(await table('personalities').upsert({
      id: p.id,
      owner_id: p.ownerId,
      share_token: p.shareToken,
      updated_at: p.updatedAt,
      data: p,
    }));
    return p;
  },
  async deletePersonality(id) {
    rows(await table('personalities').delete().eq('id', id));
  },
  async getConversation(id) {
    const res = await table('conversations').select('data').eq('id', id).maybeSingle();
    return (rows(res) as Row<StoredConversation> | null)?.data || null;
  },
  async saveConversation(c) {
    rows(await table('conversations').upsert({
      id: c.id,
      visible_to: c.visibleTo,
      updated_at: c.updatedAt,
      data: c,
    }));
  },
  async listConversations(uid, limit = 50) {
    const res = await table('conversations')
      .select('data')
      .eq('visible_to', uid)
      .order('updated_at', { ascending: false })
      .limit(limit);
    return (rows(res) as Row<StoredConversation>[] | null)?.map((r) => r.data) || [];
  },
};
