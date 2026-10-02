import { serverConfig, ttsConfigured } from './env';
import { HttpError } from './http';
import type { StoredPersonality } from './types';

// A whole reply after its first sentence goes in one request; replies are short, so this rarely trims.
export const MAX_SPEECH_CHARS = 1500;

// The server voice for a personality, or null to use the visitor's browser voice.
export function serverVoiceFor(p: StoredPersonality): string | null {
  if (!ttsConfigured) return null;
  if (p.voice?.gender === 'male') return serverConfig.tts.maleVoice;
  if (p.voice?.gender === 'female') return serverConfig.tts.femaleVoice;
  return null;
}

export const audioType = () => (serverConfig.tts.format === 'mp3' ? 'audio/mpeg' : `audio/${serverConfig.tts.format}`);

// Speaks one sentence with an OpenAI-compatible /audio/speech endpoint (Groq by default).
export async function synthesize(text: string, voice: string, speed = 1): Promise<ArrayBuffer> {
  const res = await fetch(`${serverConfig.tts.baseUrl}/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serverConfig.tts.apiKey}` },
    body: JSON.stringify({
      model: serverConfig.tts.model,
      voice,
      input: text,
      response_format: serverConfig.tts.format,
      speed,
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    console.error(`[tts] ${res.status} ${detail}`);
    // 429: the provider's rate limit; anything else means the voice is unavailable. Either way the
    // browser falls back to its own voice for this sentence.
    throw new HttpError(res.status === 429 ? 429 : 503, 'The server voice is unavailable right now.');
  }
  return res.arrayBuffer();
}
