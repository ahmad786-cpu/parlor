import crypto from 'node:crypto';
import { authenticate } from '@/lib/server/auth';
import { HttpError, json, readJson, route } from '@/lib/server/http';
import { findById, findByToken, toPublic } from '@/lib/server/personalities';
import { store } from '@/lib/server/store';
import { serverVoiceFor } from '@/lib/server/tts';
import type { StoredConversation, StoredPersonality } from '@/lib/server/types';

/*
 * Opens a conversation: POST { token } (share link) or { personalityId } with a sign-in token.
 * Answers { conversationId, personality, greeting }. Messages then go to /api/chat/reply.
 * The conversation id is random and unguessable, so holding it is what allows continuing it.
 */
export const POST = route(async (req: Request) => {
  const body = await readJson(req);
  const user = await authenticate(req);

  let via: StoredConversation['via'] = 'dashboard';
  let found: StoredPersonality | null = null;
  if (typeof body.token === 'string' && body.token) {
    found = await findByToken(body.token);
    via = 'share';
  } else if (typeof body.personalityId === 'string') {
    if (!user) throw new HttpError(401, 'Sign in to continue.', true);
    const p = await findById(body.personalityId);
    if (p && (p.featured || p.ownerId === user.uid)) found = p;
  }
  if (!found) throw new HttpError(404, 'This personality is not available.', true);

  const now = Date.now();
  const conversation: StoredConversation = {
    id: crypto.randomUUID(),
    personalityId: found.id,
    personalityName: found.name,
    // The owner sees every conversation with their personality; for featured ones the talker does.
    visibleTo: found.featured ? user?.uid || null : found.ownerId,
    via,
    messages: found.greeting ? [{ role: 'assistant', content: found.greeting, at: now }] : [],
    createdAt: now,
    updatedAt: now,
  };
  await store.saveConversation(conversation);
  return json({
    conversationId: conversation.id,
    personality: toPublic(found),
    greeting: found.greeting || '',
    // The browser asks /api/tts for audio instead of using its own voices.
    serverVoice: Boolean(serverVoiceFor(found)),
  });
});
