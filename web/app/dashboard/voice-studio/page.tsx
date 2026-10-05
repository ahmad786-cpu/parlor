'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TARGET_RATE, encodeWav, openRecorder, resample, trimAndCheck, type Recorder } from '@/lib/voiceStudio/audio';
import { SENTENCES } from '@/lib/voiceStudio/sentences';
import { clearTakes, deleteTake, listTakes, loadAudio, saveTake, type TakeMeta } from '@/lib/voiceStudio/storage';
import { createZip } from '@/lib/voiceStudio/zip';

const GOAL_MINUTES = 30;
const SPEAKER = 'ahmad';
const fileId = (i: number) => `${SPEAKER}_${String(i + 1).padStart(4, '0')}`;

type Status = 'idle' | 'starting' | 'recording' | 'processing';

/**
 * Records a personal voice dataset for training a Piper voice: one sentence at a time, saved in
 * this browser as 22,050 Hz mono WAV, then downloaded as wavs/ + metadata.csv (LJSpeech format).
 */
export default function VoiceStudio() {
  const [takes, setTakes] = useState<Map<number, TakeMeta>>(new Map());
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);
  const [autoNext, setAutoNext] = useState(true);
  const [busy, setBusy] = useState('');
  const recorder = useRef<Recorder | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);

  // Load progress, and start at the first sentence not yet recorded.
  useEffect(() => {
    listTakes()
      .then((list) => {
        const map = new Map(list.map((t) => [t.index, t]));
        setTakes(map);
        const next = SENTENCES.findIndex((_, i) => !map.has(i));
        setIndex(next === -1 ? 0 : next);
      })
      .catch(() => setError('This browser cannot store recordings (private mode?). Use a normal Chrome or Edge window.'));
    return () => {
      void recorder.current?.close();
    };
  }, []);

  // Live input meter while the microphone is open.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setLevel(recorder.current?.level() ?? 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const stats = useMemo(() => {
    const list = [...takes.values()];
    const seconds = list.reduce((s, t) => s + t.seconds, 0);
    return { count: list.length, minutes: seconds / 60, flagged: list.filter((t) => !t.ok).length };
  }, [takes]);

  const current = takes.get(index);

  const startRecording = useCallback(async () => {
    setError('');
    try {
      if (!recorder.current) {
        setStatus('starting');
        recorder.current = await openRecorder();
      }
      player.current?.pause();
      recorder.current.start();
      setStatus('recording');
    } catch (err) {
      setStatus('idle');
      setError(
        (err as Error).name === 'NotAllowedError'
          ? 'Microphone access is blocked. Allow it in the address bar, then try again.'
          : `Could not open the microphone: ${(err as Error).message}`
      );
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const rec = recorder.current;
    if (!rec) return;
    setStatus('processing');
    try {
      const raw = rec.stop();
      const audio22k = await resample(raw, rec.sampleRate, TARGET_RATE);
      const { audio, check } = trimAndCheck(audio22k, TARGET_RATE);
      if (!audio.length) {
        setError(check.issues[0]);
        return;
      }
      const meta: TakeMeta = { index, seconds: audio.length / TARGET_RATE, ok: check.ok, issues: check.issues, at: Date.now() };
      await saveTake(meta, encodeWav(audio, TARGET_RATE));
      setTakes((prev) => new Map(prev).set(index, meta));
      if (check.ok && autoNext && index < SENTENCES.length - 1) setIndex(index + 1);
    } catch (err) {
      setError(`That take could not be saved: ${(err as Error).message}`);
    } finally {
      setStatus('idle');
    }
  }, [index, autoNext]);

  const play = useCallback(async (i = index) => {
    const wav = await loadAudio(i);
    if (!wav) return;
    player.current?.pause();
    const url = URL.createObjectURL(new Blob([wav as BlobPart], { type: 'audio/wav' }));
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    player.current = audio;
    void audio.play();
  }, [index]);

  const go = useCallback((i: number) => {
    if (status !== 'idle') return;
    setError('');
    setIndex(Math.max(0, Math.min(SENTENCES.length - 1, i)));
  }, [status]);

  const nextUnrecorded = () => {
    const after = SENTENCES.findIndex((_, i) => i > index && !takes.has(i));
    const any = SENTENCES.findIndex((_, i) => !takes.has(i));
    go(after !== -1 ? after : any !== -1 ? any : index);
  };

  // Keyboard: Space records/stops, arrows move, P plays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (status === 'recording') void stopRecording();
        else if (status === 'idle') void startRecording();
      } else if (e.code === 'ArrowRight') go(index + 1);
      else if (e.code === 'ArrowLeft') go(index - 1);
      else if (e.key.toLowerCase() === 'p' && status === 'idle') void play();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, index, startRecording, stopRecording, go, play]);

  async function download() {
    setBusy('Preparing the dataset…');
    try {
      const list = [...takes.values()].sort((a, b) => a.index - b.index);
      const entries = [];
      const lines: string[] = [];
      for (const t of list) {
        const wav = await loadAudio(t.index);
        if (!wav) continue;
        entries.push({ name: `voice-dataset/wavs/${fileId(t.index)}.wav`, data: wav });
        lines.push(`${fileId(t.index)}|${SENTENCES[t.index]}`);
      }
      const enc = new TextEncoder();
      const flagged = list.filter((t) => !t.ok).map((t) => `${fileId(t.index)}: ${t.issues.join(' ')}`);
      entries.push({ name: 'voice-dataset/metadata.csv', data: enc.encode(lines.join('\n') + '\n') });
      entries.push({
        name: 'voice-dataset/README.txt',
        data: enc.encode(
          [
            'Personal voice dataset recorded in Parlor Voice Studio.',
            `Format: LJSpeech style. wavs/ holds ${TARGET_RATE} Hz mono 16-bit WAV files; metadata.csv lines are "id|text".`,
            `Clips: ${entries.length}. Total: ${stats.minutes.toFixed(1)} minutes.`,
            flagged.length ? `\nClips with a quality warning (consider re-recording):\n${flagged.join('\n')}` : '\nNo quality warnings.',
          ].join('\n')
        ),
      });
      const url = URL.createObjectURL(createZip(entries));
      const a = document.createElement('a');
      a.href = url;
      a.download = `voice-dataset-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(`The download failed: ${(err as Error).message}`);
    } finally {
      setBusy('');
    }
  }

  async function removeCurrent() {
    await deleteTake(index);
    setTakes((prev) => {
      const next = new Map(prev);
      next.delete(index);
      return next;
    });
  }

  async function clearAll() {
    if (!window.confirm('Delete every recording in this browser? Download the dataset first if you want to keep it.')) return;
    await clearTakes();
    setTakes(new Map());
    setIndex(0);
  }

  const goalPct = Math.min(100, (stats.minutes / GOAL_MINUTES) * 100);

  return (
    <>
      <header className="page-head">
        <h1>Voice Studio</h1>
        <p>
          Record your voice one sentence at a time to train a voice model of your own. Recordings stay in this browser
          until you download them.
        </p>
      </header>

      <section className="studio" aria-label="Recording">
        <div className="studio-progress">
          <div className="studio-bar" role="progressbar" aria-valuemin={0} aria-valuemax={GOAL_MINUTES} aria-valuenow={Math.round(stats.minutes)}>
            <span style={{ width: `${goalPct}%` }} />
          </div>
          <p>
            <strong>{stats.minutes.toFixed(1)} of {GOAL_MINUTES}+ minutes</strong> · {stats.count} of {SENTENCES.length} sentences
            {stats.flagged ? ` · ${stats.flagged} with a warning` : ''}
          </p>
        </div>

        <div className={`studio-card${status === 'recording' ? ' is-recording' : ''}`}>
          <p className="studio-count">
            Sentence {index + 1} of {SENTENCES.length}
            {current && <span className={current.ok ? 'take-ok' : 'take-warn'}>{current.ok ? '✓ recorded' : '⚠ recorded, check below'}</span>}
          </p>
          <p className="studio-sentence">{SENTENCES[index]}</p>

          <div className="studio-meter" aria-hidden="true">
            <span style={{ width: `${Math.min(100, level * 140)}%` }} className={level >= 0.98 ? 'clip' : ''} />
          </div>

          <div className="studio-controls">
            <button className="btn" onClick={() => go(index - 1)} disabled={index === 0 || status !== 'idle'} aria-label="Previous sentence">←</button>
            {status === 'recording' ? (
              <button className="btn studio-rec is-on" onClick={() => void stopRecording()}>■ Stop</button>
            ) : (
              <button className="btn studio-rec" onClick={() => void startRecording()} disabled={status !== 'idle'}>
                {status === 'starting' ? 'Opening mic…' : status === 'processing' ? 'Saving…' : current ? '● Record again' : '● Record'}
              </button>
            )}
            <button className="btn" onClick={() => void play()} disabled={!current || status !== 'idle'}>▶ Play</button>
            <button className="btn" onClick={() => go(index + 1)} disabled={index === SENTENCES.length - 1 || status !== 'idle'} aria-label="Next sentence">→</button>
          </div>
          <p className="studio-keys">Space: record / stop · ← →: move · P: play</p>

          {current && !current.ok && (
            <ul className="studio-issues">
              {current.issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          )}
          {error && <p className="alert" role="alert">{error}</p>}
        </div>

        <div className="studio-actions">
          <label className="studio-toggle">
            <input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} /> Move to the next sentence after a good take
          </label>
          <div className="studio-buttons">
            <button className="link-btn" onClick={nextUnrecorded}>Next unrecorded</button>
            {current && <button className="link-btn" onClick={() => void removeCurrent()}>Delete this take</button>}
            <button className="link-btn" onClick={() => void clearAll()} disabled={!stats.count}>Delete all</button>
            <button className="btn primary" onClick={() => void download()} disabled={!stats.count || Boolean(busy)}>
              {busy || 'Download dataset (.zip)'}
            </button>
          </div>
        </div>

        <details className="studio-tips">
          <summary>Tips for a natural voice</summary>
          <ul>
            <li>Use a quiet room with soft furnishings; avoid fans, traffic and echo.</li>
            <li>Keep the same microphone, distance (about a hand's width) and volume in every session.</li>
            <li>Speak the way you talk to a client: relaxed, clear, not reading-voice.</li>
            <li>Read each sentence exactly as written. If you stumble, just record it again.</li>
            <li>Take a break every 15 minutes and drink water; a tired voice sounds different.</li>
            <li>Download the dataset at the end of each session as a backup.</li>
          </ul>
        </details>
      </section>
    </>
  );
}
