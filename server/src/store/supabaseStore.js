import { supabase } from '../supabase.js';

// Each row keeps the whole record in `data`; the other columns exist only for lookups and sorting.
// Tables are created by server/supabase.sql.
const table = (name) => supabase().from(name);

function rows({ data, error }) {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

export const supabaseStore = {
  async listPersonalities(ownerId) {
    const res = await table('personalities').select('data').eq('owner_id', ownerId).order('updated_at', { ascending: false });
    return rows(res).map((r) => r.data);
  },
  async getPersonality(id) {
    return rows(await table('personalities').select('data').eq('id', id).maybeSingle())?.data || null;
  },
  async getPersonalityByToken(token) {
    return rows(await table('personalities').select('data').eq('share_token', token).maybeSingle())?.data || null;
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
  async saveConversation(c) {
    rows(await table('conversations').upsert({
      id: c.id,
      visible_to: c.visibleTo,
      updated_at: c.updatedAt,
      data: c,
    }));
  },
  async listConversations(uid, limit = 50) {
    const res = await table('conversations').select('data').eq('visible_to', uid).order('updated_at', { ascending: false }).limit(limit);
    return rows(res).map((r) => r.data);
  },
};
