'use client';

import { useEffect, useRef, useState } from 'react';
import { canSpeak, makeUtterance, recognitionCtor, takeSentences } from './speech';
import type { Message, Voice } from './types';

export type SessionStatus =
  | 'idle' // no conversation open
  | 'connecting'
  | 'ready' // conversation open, text only, waiting for the person
  | 'listening' // call in progress, microphone open
  | 'thinking' // waiting for the first words of the reply
  | 'speaking' // reply streaming (and being spoken during a call)
  | 'ended';

type Target = { token?: string; personalityId?: string };

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Runs one conversation against /api/chat: `start` opens it, each message streams its reply back.
 * Speech-to-text and text-to-speech use the browser's Web Speech API; the call is half-duplex:
 * the microphone is closed while the personality speaks, so it never hears itself.
 */
export function useVoiceSession(target: Target, getToken: () => Promise<string | null>) {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [inCall, setInCall] = useState(false);

  const recog = useRef<any>(null);
  const targetRef = useRef(target);
  targetRef.current = target;
  // Mutable session state read from event handlers (which outlive renders).
  const s = useRef({
    status: 'idle' as SessionStatus,
    active: false, // conversation open
    connecting: false,
    voice: false, // call mode
    muted: false,
    streamDone: true, // no reply in flight
    dropDeltas: false, // reply was interrupted; ignore the rest
    pending: 0, // utterances still to be spoken
    gen: 0, // bumps when speech is cancelled, so stale callbacks are ignored
    session: 0, // bumps when the conversation closes, so late network results are ignored
    buffer: '', // reply text not yet spoken
    voiceCfg: null as Voice | null,
    queued: [] as string[], // text typed before the conversation was open
    conversationId: '',
    reply: null as AbortController | null, // the reply request in flight
  });

  function go(next: SessionStatus) {
    s.current.status = next;
    setStatus(next);
  }

  function stopRecognition() {
    const r = recog.current;
    recog.current = null;
    if (r) {
      r.onend = null;
      r.onresult = null;
      try { r.abort(); } catch { /* already stopped */ }
    }
    setInterim('');
  }

  function startRecognition() {
    const SR = recognitionCtor();
    if (!SR) return;
    stopRecognition();
    const r = new SR();
    r.lang = s.current.voiceCfg?.lang || 'en-US';
    r.interimResults = true;
    r.continuous = false;
    let finalText = '';
    r.onresult = (e: any) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else live += e.results[i][0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e: any) => {
      // Silence and our own aborts are normal; onend restarts listening.
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      const reasons: Record<string, string> = {
        'not-allowed': 'Microphone access is blocked. Allow it in your browser settings, or type your message instead.',
        'service-not-allowed': 'This browser does not allow speech recognition here. Open the page in Chrome or Edge, or type instead.',
        'audio-capture': 'No microphone was found. Connect one, or type your message instead.',
        network: "Voice input needs the browser's online speech service, which could not be reached. Check your connection, or type instead.",
        'language-not-supported': "This browser can't understand this personality's language by voice. Type your message instead.",
      };
      setError(reasons[e.error] || `Voice input stopped (${e.error}). Type your message instead.`);
      // Leave call mode so it does not keep retrying in silence.
      r.onend = null;
      if (recog.current === r) recog.current = null;
      setInterim('');
      s.current.voice = false;
      setInCall(false);
      if (s.current.active && s.current.status === 'listening') go('ready');
    };
    r.onend = () => {
      if (recog.current !== r) return;
      recog.current = null;
      setInterim('');
      const text = finalText.trim();
      if (text) return sendUser(text);
      // Silence or a dropped recognition: keep the microphone open while the call is listening.
      setTimeout(() => {
        const st = s.current;
        if (st.active && st.voice && !st.muted && st.status === 'listening' && !recog.current) startRecognition();
      }, 250);
    };
    recog.current = r;
    try { r.start(); } catch { /* start() throws if called twice; onend will retry */ }
  }

  function speak(text: string) {
    const clean = text.trim();
    if (!clean || !canSpeak()) return;
    const st = s.current;
    const u = makeUtterance(clean, st.voiceCfg);
    const gen = st.gen;
    st.pending++;
    const finish = () => {
      if (gen !== s.current.gen) return;
      s.current.pending--;
      settle();
    };
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.speak(u);
  }

  // Called whenever a reply or an utterance finishes: hand the turn back to the person when both are done.
  function settle() {
    const st = s.current;
    if (!st.active || !st.streamDone || st.pending > 0) return;
    if (st.queued.length) return sendUser(st.queued.shift() as string);
    if (!st.voice) return go('ready');
    go('listening');
    if (!st.muted) startRecognition();
  }

  function sendUser(text: string) {
    const st = s.current;
    if (!st.active || !st.conversationId) return;
    stopRecognition();
    setMessages((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    st.streamDone = false;
    st.dropDeltas = false;
    st.buffer = '';
    go('thinking');
    void streamReply(text);
  }

  const appendToReply = (text: string) =>
    setMessages((m) => {
      const last = m[m.length - 1];
      if (!last || last.role !== 'assistant') return m;
      return [...m.slice(0, -1), { ...last, content: last.content + text }];
    });
  const dropEmptyReply = () =>
    setMessages((m) => {
      const last = m[m.length - 1];
      return last && last.role === 'assistant' && !last.content ? m.slice(0, -1) : m;
    });

  function onReady(conversationId: string, voiceCfg: Voice, greeting: string) {
    const st = s.current;
    st.active = true;
    st.connecting = false;
    st.streamDone = true;
    st.conversationId = conversationId;
    st.voiceCfg = voiceCfg;
    setMessages(greeting ? [{ role: 'assistant', content: greeting }] : []);
    if (st.voice && greeting && !st.queued.length) {
      go('speaking');
      speak(greeting);
    }
    if (st.pending === 0) settle();
  }

  function onDelta(text: string) {
    const st = s.current;
    if (st.dropDeltas || !text) return;
    appendToReply(text);
    if (st.status !== 'speaking') go('speaking');
    if (st.voice) {
      const [sentences, rest] = takeSentences(st.buffer + text);
      st.buffer = rest;
      sentences.forEach(speak);
    }
  }

  function onDone() {
    const st = s.current;
    if (st.voice && !st.dropDeltas) speak(st.buffer);
    st.buffer = '';
    st.dropDeltas = false;
    st.streamDone = true;
    dropEmptyReply();
    settle();
  }

  async function streamReply(text: string) {
    const st = s.current;
    const session = st.session;
    const stale = () => session !== s.current.session;
    const ac = new AbortController();
    st.reply = ac;
    let fatal = false;
    try {
      const res = await fetch('/api/chat/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: st.conversationId, text }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        if (stale()) return;
        setError(data.error || `The reply failed (${res.status}).`);
        fatal = Boolean(data.fatal);
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (stale()) return;
          if (done) break;
          onDelta(decoder.decode(value, { stream: true }));
        }
      }
    } catch {
      if (stale()) return;
      // An abort means the person interrupted; anything else is a network failure.
      if (!ac.signal.aborted) setError(`Can't reach the server. Check your connection and try again.`);
    }
    if (stale()) return;
    st.reply = null;
    if (fatal) {
      teardown();
      go('ended');
      return;
    }
    onDone();
  }

  async function connect(voice: boolean) {
    const st = s.current;
    if (st.active || st.connecting) return;
    st.connecting = true;
    st.voice = voice;
    st.muted = false;
    setMuted(false);
    setInCall(voice);
    setError('');
    go('connecting');
    // Speech must be unlocked from the click itself, before any await.
    if (voice && canSpeak()) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    }
    const session = st.session;
    const stale = () => session !== s.current.session;
    try {
      const idToken = await getToken().catch(() => null);
      if (stale()) return;
      const res = await fetch('/api/chat/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify(targetRef.current),
      });
      const data = await res.json().catch(() => ({}));
      if (stale()) return;
      if (!res.ok) throw new Error(data.error || `Could not start the conversation (${res.status}).`);
      onReady(data.conversationId, data.personality.voice, data.greeting || '');
    } catch (err) {
      if (stale()) return;
      teardown();
      setError(err instanceof TypeError ? `Can't reach the server. Check your connection and try again.` : (err as Error).message);
      go('idle');
    }
  }

  function teardown() {
    const st = s.current;
    stopRecognition();
    st.session++;
    st.gen++;
    st.pending = 0;
    st.buffer = '';
    st.active = false;
    st.connecting = false;
    st.streamDone = true;
    st.voice = false;
    st.queued = [];
    st.conversationId = '';
    st.reply?.abort();
    st.reply = null;
    if (canSpeak()) window.speechSynthesis.cancel();
    setInCall(false);
    dropEmptyReply();
  }

  /** Start a voice call, or switch an open text chat to voice. Call from a click handler. */
  function startCall() {
    const st = s.current;
    if (!st.active) return void connect(true);
    st.voice = true;
    setInCall(true);
    settle();
  }

  /** Send typed text. Opens a text conversation first if needed. */
  function sendText(text: string) {
    const clean = text.trim();
    if (!clean) return;
    const st = s.current;
    if (st.active && st.streamDone && st.pending === 0) return sendUser(clean);
    st.queued.push(clean);
    if (!st.active) void connect(false);
  }

  /** Stop the personality mid-reply and hand the turn back. */
  function interrupt() {
    const st = s.current;
    st.gen++;
    st.pending = 0;
    st.buffer = '';
    if (canSpeak()) window.speechSynthesis.cancel();
    if (!st.streamDone) {
      st.dropDeltas = true;
      st.reply?.abort(); // streamReply then finishes the turn
    } else {
      settle();
    }
  }

  function toggleMute() {
    const st = s.current;
    st.muted = !st.muted;
    setMuted(st.muted);
    if (st.muted) stopRecognition();
    else if (st.status === 'listening') startRecognition();
  }

  function end() {
    const wasOpen = s.current.active || s.current.connecting;
    teardown();
    if (wasOpen) go('ended');
  }

  // Close everything when the page is left.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => teardown(), []);

  return { status, messages, interim, error, muted, inCall, startCall, sendText, interrupt, toggleMute, end };
}
