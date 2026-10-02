import crypto from 'node:crypto';
import { config } from './config.js';
import { authenticate } from './auth.js';
import { store } from './store/index.js';
import { findById, findByToken, toPublic } from './personalities.js';
import { buildSystemPrompt, streamChat } from './llm.js';

const MAX_TEXT = 2000; // characters per user turn
const MAX_TURNS = 80; // user turns per session
const CONTEXT_MESSAGES = 30; // most recent messages sent to the LLM
const IDLE_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX_TURNS = 40; // per IP per window

const turnsByIp = new Map();
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [ip, times] of turnsByIp) {
    const recent = times.filter((t) => t > cutoff);
    if (recent.length) turnsByIp.set(ip, recent);
    else turnsByIp.delete(ip);
  }
}, 60_000).unref();

function allowTurn(ip) {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  const recent = (turnsByIp.get(ip) || []).filter((t) => t > cutoff);
  if (recent.length >= RATE_MAX_TURNS) return false;
  recent.push(Date.now());
  turnsByIp.set(ip, recent);
  return true;
}

function clientIp(req) {
  if (config.trustProxy) {
    // Each proxy appends the address it saw; earlier entries come from the client and can be forged,
    // so count back one entry per trusted proxy.
    const hops = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const forwarded = hops[hops.length - config.trustProxy];
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
}

/*
 * One WebSocket = one conversation.
 *
 * Client -> server
 *   { type: 'start', token? , personalityId?, idToken? }
 *   { type: 'user_text', text }
 *   { type: 'cancel' }                 stop the reply in progress (barge-in)
 *
 * Server -> client
 *   { type: 'ready', personality, greeting }
 *   { type: 'delta', text }            streamed reply text
 *   { type: 'done', cancelled }        reply finished
 *   { type: 'error', message, fatal }
 */
export function handleSession(ws, req) {
  const ip = clientIp(req);
  let personality = null;
  let conversation = null;
  let turns = 0;
  let abort = null; // AbortController for the reply in progress
  let idleTimer = null;

  const send = (msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
  const fail = (message, fatal = false) => {
    send({ type: 'error', message, fatal });
    if (fatal) ws.close();
  };
  const touch = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => fail('Closed after 10 minutes without activity.', true), IDLE_MS);
  };
  touch();

  async function start(msg) {
    if (personality) return;
    const user = await authenticate(msg.idToken);
    let via = 'dashboard';
    let found = null;
    if (msg.token) {
      found = await findByToken(msg.token);
      via = 'share';
    } else if (typeof msg.personalityId === 'string') {
      if (!user) return fail('Sign in to continue.', true);
      const p = await findById(msg.personalityId);
      if (p && (p.featured || p.ownerId === user.uid)) found = p;
    }
    if (!found) return fail('This personality is not available.', true);

    personality = found;
    const now = Date.now();
    conversation = {
      id: crypto.randomUUID(),
      personalityId: found.id,
      personalityName: found.name,
      // The owner sees every conversation with their personality; for featured ones the talker does.
      visibleTo: found.featured ? user?.uid || null : found.ownerId,
      via,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    if (found.greeting) conversation.messages.push({ role: 'assistant', content: found.greeting, at: now });
    send({ type: 'ready', personality: toPublic(found), greeting: found.greeting || '' });
  }

  async function reply(text) {
    if (!personality) return fail('Send a start message first.');
    if (abort) return fail('Wait for the current reply to finish.');
    if (typeof text !== 'string' || !text.trim()) return;
    if (++turns > MAX_TURNS) return fail('This conversation has reached its length limit. Start a new one.', true);
    if (!allowTurn(ip)) {
      // The client is waiting for a reply; end the turn so it can try again later.
      fail('Too many messages. Wait a few minutes and try again.');
      return send({ type: 'done', cancelled: true });
    }

    conversation.messages.push({ role: 'user', content: text.trim().slice(0, MAX_TEXT), at: Date.now() });
    abort = new AbortController();
    let full = '';
    let cancelled = false;
    try {
      const messages = conversation.messages
        .slice(-CONTEXT_MESSAGES)
        .map(({ role, content }) => ({ role, content }));
      // Chat APIs expect the first turn to come from the user; drop a leading greeting if it would be first.
      while (messages.length && messages[0].role !== 'user') messages.shift();
      const stream = streamChat({ system: buildSystemPrompt(personality), messages, signal: abort.signal });
      for await (const chunk of stream) {
        full += chunk;
        send({ type: 'delta', text: chunk });
      }
    } catch (err) {
      if (abort.signal.aborted) cancelled = true;
      else {
        console.error('[session] reply failed:', err.message);
        send({ type: 'error', message: 'The reply could not be generated. Try again.', fatal: false });
      }
    }
    cancelled = cancelled || abort.signal.aborted;
    abort = null;
    if (full.trim()) conversation.messages.push({ role: 'assistant', content: full.trim(), at: Date.now() });
    conversation.updatedAt = Date.now();
    send({ type: 'done', cancelled });
    store.saveConversation(conversation).catch((err) => console.error('[session] save failed:', err.message));
  }

  ws.on('message', (raw) => {
    touch();
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return fail('Messages must be JSON.');
    }
    const run = (promise) => promise.catch((err) => {
      console.error('[session]', err);
      fail('Something went wrong on the server.');
    });
    if (msg.type === 'start') run(start(msg));
    else if (msg.type === 'user_text') run(reply(msg.text));
    else if (msg.type === 'cancel') abort?.abort();
  });

  ws.on('close', () => {
    clearTimeout(idleTimer);
    abort?.abort();
  });
  ws.on('error', () => ws.close());
}
