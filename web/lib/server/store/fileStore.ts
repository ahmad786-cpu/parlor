import fs from 'node:fs';
import path from 'node:path';
import { serverConfig } from '../env';
import type { StoredConversation, StoredPersonality } from '../types';
import type { Store } from './index';

// Local JSON store for development only. Hosted serverless functions cannot write files; use Supabase there.
// The file is re-read on every call because Next.js may load this module more than once in development.
type Db = { personalities: Record<string, StoredPersonality>; conversations: Record<string, StoredConversation> };

const file = () => path.resolve(serverConfig.dataFile);

function load(): Db {
  const empty: Db = { personalities: {}, conversations: {} };
  if (!fs.existsSync(file())) return empty;
  return { ...empty, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
}

function save(db: Db) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file());
}

const byUpdated = (a: { updatedAt?: number }, b: { updatedAt?: number }) => (b.updatedAt || 0) - (a.updatedAt || 0);

export const fileStore: Store = {
  async listPersonalities(ownerId) {
    return Object.values(load().personalities).filter((p) => p.ownerId === ownerId).sort(byUpdated);
  },
  async getPersonality(id) {
    return load().personalities[id] || null;
  },
  async getPersonalityByToken(token) {
    return Object.values(load().personalities).find((p) => p.shareToken === token) || null;
  },
  async savePersonality(p) {
    const db = load();
    db.personalities[p.id] = p;
    save(db);
    return p;
  },
  async deletePersonality(id) {
    const db = load();
    delete db.personalities[id];
    save(db);
  },
  async getConversation(id) {
    return load().conversations[id] || null;
  },
  async saveConversation(c) {
    const db = load();
    db.conversations[c.id] = c;
    save(db);
  },
  async listConversations(uid, limit = 50) {
    return Object.values(load().conversations)
      .filter((c) => c.visibleTo === uid)
      .sort(byUpdated)
      .slice(0, limit);
  },
};
