import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

// Local JSON store for development. Not for production: single process, whole file rewritten on save.
const file = path.resolve(config.dataFile);
let db = { personalities: {}, conversations: {} };

try {
  db = { ...db, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
} catch {
  // first run: file does not exist yet
}

function persist() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}

const byUpdated = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);

export const fileStore = {
  async listPersonalities(ownerId) {
    return Object.values(db.personalities).filter((p) => p.ownerId === ownerId).sort(byUpdated);
  },
  async getPersonality(id) {
    return db.personalities[id] || null;
  },
  async getPersonalityByToken(token) {
    return Object.values(db.personalities).find((p) => p.shareToken === token) || null;
  },
  async savePersonality(p) {
    db.personalities[p.id] = p;
    persist();
    return p;
  },
  async deletePersonality(id) {
    delete db.personalities[id];
    persist();
  },
  async saveConversation(c) {
    db.conversations[c.id] = c;
    persist();
  },
  async listConversations(uid, limit = 50) {
    return Object.values(db.conversations)
      .filter((c) => c.visibleTo === uid)
      .sort(byUpdated)
      .slice(0, limit);
  },
};
