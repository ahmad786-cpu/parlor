import type { Voice } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function recognitionCtor(): any | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

// Voice names differ between browsers and devices, so fall back to any voice in the same language.
export function pickVoice(cfg: Voice): SpeechSynthesisVoice | null {
  if (!canSpeak()) return null;
  const voices = window.speechSynthesis.getVoices();
  const base = cfg.lang.split('-')[0].toLowerCase();
  return (
    (cfg.name && voices.find((v) => v.name === cfg.name)) ||
    voices.find((v) => v.lang.replace('_', '-').toLowerCase() === cfg.lang.toLowerCase()) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ||
    null
  );
}

export function makeUtterance(text: string, cfg: Voice | null): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  if (cfg) {
    u.lang = cfg.lang;
    u.rate = cfg.rate;
    u.pitch = cfg.pitch;
    const voice = pickVoice(cfg);
    if (voice) u.voice = voice;
  }
  return u;
}

// Splits streamed text into [complete sentences, remainder] so speech can start before the reply ends.
export function takeSentences(buffer: string): [string[], string] {
  const sentences: string[] = [];
  const re = /[.!?…。؟۔]+["')\]]*\s+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(buffer))) {
    sentences.push(buffer.slice(last, m.index + m[0].length).trim());
    last = m.index + m[0].length;
  }
  return [sentences, buffer.slice(last)];
}
