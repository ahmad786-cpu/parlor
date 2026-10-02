'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CATEGORIES, COLORS, LANGUAGES } from '@/lib/config';
import { canSpeak, makeUtterance, voiceGender } from '@/lib/speech';
import type { Personality, PersonalityInput, VoiceGender } from '@/lib/types';
import { Avatar } from './Avatar';

const BLANK: PersonalityInput = {
  name: '',
  tagline: '',
  prompt: '',
  greeting: '',
  category: 'Companion',
  emoji: '🙂',
  color: COLORS[0],
  voice: { name: '', lang: 'en-US', rate: 1, pitch: 1, gender: 'any' },
};

export function PersonalityForm({ existing }: { existing?: Personality }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [form, setForm] = useState<PersonalityInput>(() =>
    existing ? { ...BLANK, ...existing, prompt: existing.prompt || '' } : BLANK
  );
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Browser voices load asynchronously.
  useEffect(() => {
    if (!canSpeak()) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  // Voices in the chosen language, without ones known to be the other gender when a type is chosen.
  const gender: VoiceGender = form.voice.gender || 'any';
  const langVoices = useMemo(() => {
    const base = form.voice.lang.split('-')[0].toLowerCase();
    const opposite = gender === 'male' ? 'female' : gender === 'female' ? 'male' : null;
    return voices.filter((v) => v.lang.toLowerCase().startsWith(base) && voiceGender(v) !== opposite);
  }, [voices, form.voice.lang, gender]);

  const set = <K extends keyof PersonalityInput>(key: K, value: PersonalityInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setVoice = (patch: Partial<PersonalityInput['voice']>) =>
    setForm((f) => ({ ...f, voice: { ...f.voice, ...patch } }));

  function preview() {
    if (!canSpeak()) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(makeUtterance(form.greeting || `Hi, I'm ${form.name || 'your new personality'}.`, form.voice));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      const res = await api<{ personality: Personality }>(
        existing ? `/personalities/${existing.id}` : '/personalities',
        { method: existing ? 'PUT' : 'POST', body: form, token }
      );
      router.push(`/dashboard/personality-demo?id=${res.personality.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing || !window.confirm(`Delete ${existing.name}? Its share link will stop working.`)) return;
    try {
      await api(`/personalities/${existing.id}`, { method: 'DELETE', token: await getToken() });
      router.push('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="form" onSubmit={save}>
      <fieldset>
        <legend>Who is it?</legend>
        <div className="form-identity">
          <Avatar emoji={form.emoji} color={form.color} size={96} />
          <div className="form-grid">
            <label>
              Name
              <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={60} required />
            </label>
            <label>
              Emoji
              <input value={form.emoji} onChange={(e) => set('emoji', e.target.value)} maxLength={8} className="narrow" />
            </label>
          </div>
        </div>
        <div className="swatches" role="radiogroup" aria-label="Colour">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={form.color === c}
              aria-label={c}
              style={{ background: c }}
              onClick={() => set('color', c)}
            />
          ))}
        </div>
        <label>
          One-line description
          <input value={form.tagline} onChange={(e) => set('tagline', e.target.value)} maxLength={120} placeholder="A patient chess coach who never gloats" />
        </label>
        <label>
          Category
          <select value={form.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>How does it behave?</legend>
        <label>
          Instructions
          <textarea
            value={form.prompt}
            onChange={(e) => set('prompt', e.target.value)}
            rows={7}
            maxLength={4000}
            required
            placeholder="You are a patient chess coach. Explain one idea at a time, ask what the player was planning, and never just give the best move."
          />
          <small>Only you can see this. People with the share link never do.</small>
        </label>
        <label>
          First thing it says
          <input value={form.greeting} onChange={(e) => set('greeting', e.target.value)} maxLength={300} placeholder="Hi! Ready for a game?" />
        </label>
      </fieldset>

      <fieldset>
        <legend>How does it sound?</legend>
        <div className="form-grid">
          <label>
            Language
            <select value={form.voice.lang} onChange={(e) => setVoice({ lang: e.target.value, name: '' })}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>
          <label>
            Voice type
            <select value={gender} onChange={(e) => setVoice({ gender: e.target.value as VoiceGender, name: '' })}>
              <option value="any">Any</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <label>
            Voice
            <select value={form.voice.name} onChange={(e) => setVoice({ name: e.target.value })}>
              <option value="">Best available</option>
              {langVoices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
          </label>
        </div>
        <small>
          Voices come from the listener's browser. If theirs doesn't have the one you chose, they hear the closest voice of the same type in the same language. The personality always replies in this language.
        </small>
        <div className="form-grid">
          <label>
            Speed <output>{form.voice.rate.toFixed(2)}×</output>
            <input type="range" min={0.6} max={1.6} step={0.05} value={form.voice.rate} onChange={(e) => setVoice({ rate: Number(e.target.value) })} />
          </label>
          <label>
            Pitch <output>{form.voice.pitch.toFixed(2)}</output>
            <input type="range" min={0.4} max={1.8} step={0.05} value={form.voice.pitch} onChange={(e) => setVoice({ pitch: Number(e.target.value) })} />
          </label>
        </div>
        <button type="button" className="btn" onClick={preview}>Play voice</button>
      </fieldset>

      {error && <p className="alert" role="alert">{error}</p>}

      <div className="form-actions">
        <button className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Create personality'}
        </button>
        {existing && <button type="button" className="btn danger" onClick={remove}>Delete</button>}
      </div>
    </form>
  );
}
