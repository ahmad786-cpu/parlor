'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { recognitionCtor } from '@/lib/speech';
import { useVoiceSession, type SessionStatus } from '@/lib/useVoiceSession';
import type { Personality } from '@/lib/types';
import { Orb } from '@/components/Orb';
import { CopyButton, shareUrl } from '@/components/CopyButton';

const STATUS_TEXT: Record<SessionStatus, string> = {
  idle: 'Start a call, or type a message',
  connecting: 'Connecting…',
  ready: 'Type a message, or start a call',
  listening: 'Listening',
  thinking: 'Thinking…',
  speaking: 'Speaking',
  ended: 'Conversation ended',
};

export default function PersonalityDemo() {
  const params = useSearchParams();
  const token = params.get('token') || undefined;
  const id = params.get('id') || undefined;
  const { getToken } = useAuth();

  const [personality, setPersonality] = useState<Personality | null>(null);
  const [loadError, setLoadError] = useState('');
  const [voiceInput, setVoiceInput] = useState(true);
  const [draft, setDraft] = useState('');
  const [shareToken, setShareToken] = useState('');
  // Embedded in another site (e.g. a portfolio): browsers often block the microphone in frames,
  // so calls open this page in its own tab while typing stays in place.
  const [embedded, setEmbedded] = useState(false);
  const logEnd = useRef<HTMLDivElement>(null);

  const session = useVoiceSession(token ? { token } : { personalityId: id }, getToken);
  const { status, messages, interim, inCall, muted } = session;

  useEffect(() => {
    setVoiceInput(Boolean(recognitionCtor()));
    try {
      setEmbedded(window.self !== window.top);
    } catch {
      setEmbedded(true); // reading window.top across origins can throw
    }
  }, []);

  function startCall() {
    if (embedded) {
      window.open(window.location.href, '_blank', 'noopener');
      return;
    }
    session.startCall();
  }

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (!token && !id) throw new Error('This link is missing a personality. Open one from the dashboard.');
        const res = token
          ? await api<{ personality: Personality }>(`/demo/${encodeURIComponent(token)}`)
          : await api<{ personality: Personality }>(`/personalities/${id}`, { token: await getToken() });
        if (!live) return;
        setPersonality(res.personality);
        setShareToken(res.personality.shareToken || '');
      } catch (e) {
        if (live) setLoadError((e as Error).message);
      }
    })();
    return () => { live = false; };
  }, [token, id, getToken]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'end' });
  }, [messages, interim]);

  if (loadError) return <p className="alert" role="alert">{loadError}</p>;
  if (!personality) return <p className="center-note">Loading…</p>;

  const live = status !== 'idle' && status !== 'ended' && status !== 'connecting';
  const busy = status === 'thinking' || status === 'speaking';
  const owner = !token && !personality.featured;

  async function replaceLink() {
    if (!window.confirm('Replace the share link? The current link will stop working.')) return;
    try {
      const res = await api<{ personality: Personality }>(`/personalities/${personality!.id}/share`, {
        method: 'POST',
        token: await getToken(),
      });
      setShareToken(res.personality.shareToken || '');
    } catch (e) {
      window.alert((e as Error).message);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    session.sendText(draft);
    setDraft('');
  }

  return (
    <div className="demo" style={{ ['--tone' as string]: personality.color }}>
      <section className="stage" aria-label={`Call with ${personality.name}`}>
        <Orb emoji={personality.emoji} status={muted && status === 'listening' ? 'ready' : status} />
        <h1>{personality.name}</h1>
        {personality.tagline && <p className="stage-tagline">{personality.tagline}</p>}
        <p className="stage-status" role="status">
          {muted && status === 'listening' ? 'Muted' : STATUS_TEXT[status]}
        </p>

        <div className="stage-controls">
          {!inCall && (
            <button
              className="btn call"
              onClick={startCall}
              disabled={!voiceInput || status === 'connecting'}
              title={embedded ? 'Opens the call in a new tab, where the microphone works' : undefined}
            >
              {embedded ? 'Start call ↗' : 'Start call'}
            </button>
          )}
          {inCall && (
            <button className="btn ghost" onClick={session.toggleMute} aria-pressed={muted}>
              {muted ? 'Unmute' : 'Mute'}
            </button>
          )}
          {live && busy && (
            <button className="btn ghost" onClick={session.interrupt}>Interrupt</button>
          )}
          {live && (
            <button className="btn hangup" onClick={session.end}>{inCall ? 'End call' : 'End chat'}</button>
          )}
        </div>
        {!voiceInput && (
          <p className="stage-note">This browser can't take voice input. Open the page in Chrome or Edge to call, or type instead.</p>
        )}
        {voiceInput && embedded && !inCall && (
          <p className="stage-note">Calls open in a new tab so your microphone works. Typing works right here.</p>
        )}
      </section>

      <section className="talk" aria-label="Conversation">
        <div className="log" aria-live="polite">
          {messages.length === 0 && !interim && (
            <p className="log-empty">What you and {personality.name} say will appear here.</p>
          )}
          {messages.map((m, i) => (
            <p key={i} className={`line ${m.role}`}>
              <span className="who">{m.role === 'user' ? 'You' : personality.name}</span>
              {m.content || <span className="dots" aria-label="Thinking"><i /><i /><i /></span>}
            </p>
          ))}
          {interim && (
            <p className="line user interim">
              <span className="who">You</span>
              {interim}
            </p>
          )}
          <div ref={logEnd} />
        </div>

        {session.error && <p className="alert" role="alert">{session.error}</p>}

        <form className="composer" onSubmit={submit}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message ${personality.name}`}
            aria-label={`Message ${personality.name}`}
            maxLength={2000}
          />
          <button className="btn primary" disabled={!draft.trim() || status === 'connecting'}>Send</button>
        </form>

        {owner && shareToken && (
          <div className="share">
            <div>
              <strong>Share link</strong>
              <span>Anyone with this link can talk to {personality.name} without signing in.</span>
              <code>{shareUrl(shareToken)}</code>
            </div>
            <div className="share-actions">
              <CopyButton text={shareUrl(shareToken)} className="btn" />
              <button className="link-btn" onClick={replaceLink}>Replace link</button>
              <Link href={`/dashboard/personalities/${personality.id}/edit`}>Edit personality</Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
