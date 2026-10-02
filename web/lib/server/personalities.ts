import crypto from 'node:crypto';
import { CATEGORIES } from '../config';
import { HttpError } from './http';
import { FEATURED } from './seed';
import { store } from './store';
import type { StoredPersonality } from './types';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Validates and normalises user input. Throws an HttpError with a user-facing message.
export function sanitize(input: Record<string, unknown>) {
  const name = str(input.name, 60);
  const prompt = str(input.prompt, 4000);
  if (!name) throw new HttpError(400, 'Give the personality a name.');
  if (!prompt) throw new HttpError(400, 'Describe how the personality should behave.');
  const v = (input.voice && typeof input.voice === 'object' ? input.voice : {}) as Record<string, unknown>;
  const lang = typeof v.lang === 'string' ? v.lang : '';
  const color = typeof input.color === 'string' ? input.color : '';
  const category = typeof input.category === 'string' ? input.category : '';
  return {
    name,
    prompt,
    tagline: str(input.tagline, 120),
    greeting: str(input.greeting, 300),
    category: CATEGORIES.includes(category) ? category : 'Other',
    emoji: str(input.emoji, 8) || '🙂',
    color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#18B5FF',
    voice: {
      name: str(v.name, 120),
      lang: /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,4})?$/.test(lang) ? lang : 'en-US',
      rate: num(v.rate, 0.5, 2, 1),
      pitch: num(v.pitch, 0, 2, 1),
    },
  };
}

// Share tokens look like "Asif-rnGU6": a readable prefix plus 5 random characters.
export function newShareToken(name: string): string {
  const prefix = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16) || 'Demo';
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let suffix = '';
  for (const byte of crypto.randomBytes(5)) suffix += alphabet[byte % alphabet.length];
  return `${prefix}-${suffix}`;
}

// What visitors with a share link may see. The prompt and owner stay on the server.
export function toPublic(p: StoredPersonality) {
  const { id, name, tagline, greeting, category, emoji, color, voice, featured } = p;
  return { id, name, tagline, greeting, category, emoji, color, voice, featured: Boolean(featured) };
}

export async function findById(id: string): Promise<StoredPersonality | null> {
  return FEATURED.find((p) => p.id === id) || (await store.getPersonality(id));
}

export async function findByToken(token: unknown): Promise<StoredPersonality | null> {
  if (typeof token !== 'string' || !token || token.length > 40) return null;
  return FEATURED.find((p) => p.shareToken === token) || (await store.getPersonalityByToken(token));
}

// Loads a personality the user owns, or throws a 404.
export async function findOwned(id: string, uid: string): Promise<StoredPersonality> {
  const p = await store.getPersonality(id);
  if (!p || p.ownerId !== uid) throw new HttpError(404, 'Personality not found.');
  return p;
}

export async function create(ownerId: string, input: Record<string, unknown>) {
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
