import type { Voice } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function recognitionCtor(): any | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

// Browsers do not say whether a voice is male or female, so recognise the common voice names on
// Windows/Edge (Microsoft David, Guy, Andrew...), Chrome ("Google UK English Male"), Apple devices
// (Daniel, Alex, Fred...) and Android (en-us-x-iom...). Female names are checked first because
// "Female" contains "male".
const FEMALE =
  /\b(female|woman|google us english|zira|hazel|susan|aria|jenny|samantha|karen|moira|tessa|victoria|kate|serena|martha|fiona|libby|sonia|michelle|emma|ava|allison|catherine|natasha|clara|sara|heera|kalpana|neerja|swara|uzma|veena|isha|nicky|joanna|salli|kimberly|ivy|kendra|amy|olivia|linda|heather|jane|nancy|maisie|hollie|abbi|bella|elsa|aisha|zariyah|gul|ana|anna|monica|paulina|amelie|helena|zuzana|yuna|tingting|meijia|sinji|kyoko)\b|x-(sfg|tpc|tpf|gba|gbb|gbc|gbg)/i;
const MALE =
  /\b(male|man|david|mark|guy|george|ryan|christopher|eric|roger|steffan|brian|andrew|davis|tony|jason|thomas|liam|william|alex|daniel|fred|aaron|arthur|gordon|oliver|rishi|tom|evan|nathan|reed|rocko|eddy|grandpa|ralph|albert|bruce|junior|lee|jamie|malcolm|prabhat|ravi|hemant|madhur|asad|salman|hamed|naayf|james|richard|sean|connor|mitchell|luke|ken|duncan|jorge|diego|maged|tarik|yuri|xander)\b|x-(iom|iol|tpd|rjs|gbd)/i;

export function voiceGender(v: SpeechSynthesisVoice): 'male' | 'female' | 'unknown' {
  if (FEMALE.test(v.name)) return 'female';
  if (MALE.test(v.name)) return 'male';
  return 'unknown';
}

const norm = (lang: string) => lang.replace('_', '-').toLowerCase();

// Picks the configured voice when this device has it; otherwise the closest voice in the same
// language, respecting the male/female preference. Natural/online voices sound best, so they come first.
export function pickVoice(cfg: Voice): SpeechSynthesisVoice | null {
  if (!canSpeak()) return null;
  const voices = [...window.speechSynthesis.getVoices()].sort(
    (a, b) => Number(/natural|online|neural|enhanced|premium/i.test(b.name)) - Number(/natural|online|neural|enhanced|premium/i.test(a.name))
  );
  const want = cfg.gender === 'male' || cfg.gender === 'female' ? cfg.gender : null;
  const opposite = want === 'male' ? 'female' : 'male';
  const base = cfg.lang.split('-')[0].toLowerCase();
  const sameLang = (v: SpeechSynthesisVoice) => norm(v.lang) === cfg.lang.toLowerCase();
  const sameBase = (v: SpeechSynthesisVoice) => norm(v.lang).startsWith(base);
  const isWanted = (v: SpeechSynthesisVoice) => !want || voiceGender(v) === want;
  const notOpposite = (v: SpeechSynthesisVoice) => !want || voiceGender(v) !== opposite;
  return (
    (cfg.name && voices.find((v) => v.name === cfg.name && notOpposite(v))) ||
    voices.find((v) => sameLang(v) && isWanted(v)) ||
    voices.find((v) => sameBase(v) && isWanted(v)) ||
    voices.find((v) => sameLang(v) && notOpposite(v)) ||
    voices.find((v) => sameBase(v) && notOpposite(v)) ||
    voices.find(sameLang) ||
    voices.find(sameBase) ||
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
    // Last resort when the device has no voice of the wanted type: shift the pitch towards it.
    const got = voice ? voiceGender(voice) : 'unknown';
    if (cfg.gender === 'male' && got !== 'male') u.pitch = Math.min(cfg.pitch, 0.75);
    if (cfg.gender === 'female' && got !== 'female') u.pitch = Math.max(cfg.pitch, 1.25);
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
