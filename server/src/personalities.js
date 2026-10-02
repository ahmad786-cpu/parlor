import crypto from 'node:crypto';
import { store } from './store/index.js';
import { FEATURED } from './seed.js';

export const CATEGORIES = ['Companion', 'Education', 'Games', 'Home', 'Role play', 'Work', 'Other'];

const str = (v, max, fallback = '') =>
  typeof v === 'string' ? v.trim().slice(0, max) : fallback;
const num = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Validates and normalises user input. Throws an Error with a user-facing message.
export function sanitize(input = {}) {
  const name = str(input.name, 60);
  const prompt = str(input.prompt, 4000);
  if (!name) throw Object.assign(new Error('Give the personality a name.'), { status: 400 });
  if (!prompt) throw Object.assign(new Error('Describe how the personality should behave.'), { status: 400 });
  const v = input.voice || {};
  return {
    name,
    prompt,
    tagline: str(input.tagline, 120),
    greeting: str(input.greeting, 300),
    category: CATEGORIES.includes(input.category) ? input.category : 'Other',
    emoji: str(input.emoji, 8) || '🙂',
    color: /^#[0-9a-fA-F]{6}$/.test(input.color || '') ? input.color : '#4A3FD6',
    voice: {
      name: str(v.name, 120),
      lang: /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,4})?$/.test(v.lang || '') ? v.lang : 'en-US',
      rate: num(v.rate, 0.5, 2, 1),
      pitch: num(v.pitch, 0, 2, 1),
    },
  };
}

// Share tokens look like "Asif-rnGU6": a readable prefix plus 5 random characters.
export function newShareToken(name) {
  const prefix = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16) || 'Demo';
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let suffix = '';
  for (const byte of crypto.randomBytes(5)) suffix += alphabet[byte % alphabet.length];
  return `${prefix}-${suffix}`;
}

// What visitors with a share link may see. The prompt and owner stay on the server.
export function toPublic(p) {
  const { id, name, tagline, greeting, category, emoji, color, voice, featured } = p;
  return { id, name, tagline, greeting, category, emoji, color, voice, featured: Boolean(featured) };
}

export async function findById(id) {
  return FEATURED.find((p) => p.id === id) || (await store.getPersonality(id));
}

export async function findByToken(token) {
  if (typeof token !== 'string' || !token || token.length > 40) return null;
  return FEATURED.find((p) => p.shareToken === token) || (await store.getPersonalityByToken(token));
}

export async function create(ownerId, input) {
  const data = sanitize(input);
  const now = Date.now();
  return store.savePersonality({
    ...data,
    id: crypto.randomUUID(),
    ownerId,
    shareToken: newShareToken(data.name),
    createdAt: now,
    updatedAt: now,
  });
}
