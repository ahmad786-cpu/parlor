import { HttpError, clientIp, readJson, route } from '@/lib/server/http';
import { findById } from '@/lib/server/personalities';
import { allowSpeech } from '@/lib/server/rateLimit';
import { store } from '@/lib/server/store';
import { MAX_SPEECH_CHARS, audioType, serverVoiceFor, synthesize } from '@/lib/server/tts';

export const maxDuration = 30;

/*
 * POST { conversationId, text } -> audio of one sentence in the personality's server voice.
 * Only speaks for an open conversation, so it cannot be used as a general text-to-speech service.
 */
export const POST = route(async (req: Request) => {
  const body = await readJson(req);
  const conversation =
    typeof body.conversationId === 'string' ? await store.getConversation(body.conversationId) : null;
  if (!conversation) throw new HttpError(404, 'This conversation has ended.');
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_SPEECH_CHARS) : '';
  if (!text) throw new HttpError(400, 'Nothing to say.');

  const personality = await findById(conversation.personalityId);
  const voice = personality ? serverVoiceFor(personality) : null;
  if (!personality || !voice) throw new HttpError(409, 'This personality uses the browser voice.');
  if (!(await allowSpeech(clientIp(req)))) throw new HttpError(429, 'Too much speech; using the browser voice for now.');

  const audio = await synthesize(text, voice, personality.voice?.rate || 1);
  return new Response(audio, { headers: { 'Content-Type': audioType(), 'Cache-Control': 'no-store' } });
});
