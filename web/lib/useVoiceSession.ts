'use client';

import { useEffect, useRef, useState } from 'react';
import { WS_URL } from './config';
import { canSpeak, makeUtterance, recognitionCtor, takeSentences } from './speech';
import type { Message, Voice } from './types';

export type SessionStatus =
  | 'idle' // not connected
  | 'connecting'
  | 'ready' // connected, text only, waiting for the person
  | 'listening' // call in progress, microphone open
  | 'thinking' // waiting for the first words of the reply
  | 'speaking' // reply streaming (and being spoken during a call)
  | 'ended';

type Target = { token?: string; personalityId?: string };

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Runs one conversation over the server WebSocket.
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

  const ws = useRef<WebSocket | null>(null);
  const recog = useRef<any>(null);
  const targetRef = useRef(target);
  targetRef.current = target;
  // Mutable session state read from event handlers (which outlive renders).
  const s = useRef({
    status: 'idle' as SessionStatus,
    active: false, // server said ready
    connecting: false,
    closing: false, // closed on purpose
    voice: false, // call mode
    muted: false,
    streamDone: true, // no reply in flight
    dropDeltas: false, // reply was interrupted; ignore the rest
    pending: 0, // utterances still to be spoken
    gen: 0, // bumps when speech is cancelled, so stale callbacks are ignored
    buffer: '', // reply text not yet spoken
    voiceCfg: null as Voice | null,
    queued: [] as string[], // text typed before the connection was ready
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
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('Microphone access is blocked. Allow it in your browser settings, or type your message instead.');
        s.current.voice = false;
        setInCall(false);
        if (s.current.active) go('ready');
      }
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
    const sock = ws.current;
    const st = s.current;
    if (!sock || sock.readyState !== WebSocket.OPEN) return;
    stopRecognition();
    setMessages((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    st.streamDone = false;
    st.dropDeltas = false;
    st.buffer = '';
    sock.send(JSON.stringify({ type: 'user_text', text }));
    go('thinking');
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

  function onServerMessage(msg: any) {
    const st = s.current;
    if (msg.type === 'ready') {
      st.active = true;
      st.connecting = false;
      st.streamDone = true;
      st.voiceCfg = msg.personality.voice;
      setMessages(msg.greeting ? [{ role: 'assistant', content: msg.greeting }] : []);
      if (st.voice && msg.greeting && !st.queued.length) {
        go('speaking');
        speak(msg.greeting);
      }
      if (st.pending === 0) settle();
    } else if (msg.type === 'delta') {
      if (st.dropDeltas) return;
      appendToReply(msg.text);
      if (st.status !== 'speaking') go('speaking');
      if (st.voice) {
        const [sentences, rest] = takeSentences(st.buffer + msg.text);
        st.buffer = rest;
        sentences.forEach(speak);
      }
    } else if (msg.type === 'done') {
      if (st.voice && !st.dropDeltas) speak(st.buffer);
      st.buffer = '';
      st.dropDeltas = false;
      st.streamDone = true;
      dropEmptyReply();
      settle();
    } else if (msg.type === 'error') {
      setError(msg.message || 'Something went wrong.');
    }
  }

  async function connect(voice: boolean) {
    const st = s.current;
    if (ws.current || st.connecting) return;
    st.connecting = true;
    st.closing = false;
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
    const idToken = await getToken().catch(() => null);
    // Ended or left the page while the token was loading.
    if (st.closing) return;
    const sock = new WebSocket(WS_URL);
    ws.current = sock;
    sock.onopen = () => sock.send(JSON.stringify({ type: 'start', ...targetRef.current, idToken }));
    sock.onmessage = (e) => {
      try { onServerMessage(JSON.parse(e.data)); } catch { /* ignore malformed frames */ }
    };
    sock.onclose = () => {
      if (ws.current !== sock) return;
      const wasActive = st.active;
      teardown();
      if (!st.closing) {
        setError((prev) => prev || (wasActive ? 'The connection dropped.' : `Can't reach the server. Check that it is running.`));
      }
      go(wasActive || st.closing ? 'ended' : 'idle');
    };
  }

  function teardown() {
    const st = s.current;
    stopRecognition();
    st.gen++;
    st.pending = 0;
    st.buffer = '';
    st.active = false;
    st.connecting = false;
    st.streamDone = true;
    st.voice = false;
    st.queued = [];
    if (canSpeak()) window.speechSynthesis.cancel();
    const sock = ws.current;
    ws.current = null;
    if (sock && sock.readyState <= WebSocket.OPEN) sock.close();
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

  /** Send typed text. Connects in text mode first if needed. */
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
      ws.current?.send(JSON.stringify({ type: 'cancel' }));
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
    s.current.closing = true;
    const hadSocket = Boolean(ws.current) || s.current.connecting;
    teardown();
    if (hadSocket) go('ended');
  }

  // Close everything when the page is left.
  useEffect(() => () => {
    s.current.closing = true;
    teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, messages, interim, error, muted, inCall, startCall, sendText, interrupt, toggleMute, end };
}
