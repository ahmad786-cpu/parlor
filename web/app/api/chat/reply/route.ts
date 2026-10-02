import { HttpError, clientIp, readJson, route } from '@/lib/server/http';
import { buildSystemPrompt, streamChat } from '@/lib/server/llm';
import { findById } from '@/lib/server/personalities';
import { allowTurn } from '@/lib/server/rateLimit';
import { store } from '@/lib/server/store';

const MAX_TEXT = 2000; // characters per message
const MAX_TURNS = 80; // messages from the person per conversation
const CONTEXT_MESSAGES = 30; // most recent messages sent to the LLM

export const maxDuration = 60;

/*
 * POST { conversationId, text } -> the reply as a plain-text stream.
 * Errors before the reply starts come back as JSON { error, fatal }; `fatal` means start a new conversation.
 * The client cancels a reply (barge-in) by aborting the request.
 */
export const POST = route(async (req: Request) => {
  const body = await readJson(req);
  const conversation =
    typeof body.conversationId === 'string' ? await store.getConversation(body.conversationId) : null;
  if (!conversation) throw new HttpError(404, 'This conversation has ended. Start a new one.', true);

  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
  if (!text) throw new HttpError(400, 'Say or type something first.');
  if (conversation.messages.filter((m) => m.role === 'user').length >= MAX_TURNS) {
    throw new HttpError(409, 'This conversation has reached its length limit. Start a new one.', true);
  }
  const personality = await findById(conversation.personalityId);
  if (!personality) throw new HttpError(410, 'This personality is not available any more.', true);
  if (!(await allowTurn(clientIp(req)))) throw new HttpError(429, 'Too many messages. Wait a few minutes and try again.');

  conversation.messages.push({ role: 'user', content: text, at: Date.now() });
  const messages = conversation.messages
    .slice(-CONTEXT_MESSAGES)
    .map(({ role, content }) => ({ role, content }));
  // Chat APIs expect the first turn to come from the user; drop a leading greeting if it would be first.
  while (messages.length && messages[0].role !== 'user') messages.shift();

  const abort = new AbortController();
  req.signal.addEventListener('abort', () => abort.abort());
  const chunks = streamChat({ system: buildSystemPrompt(personality), messages, signal: abort.signal });

  let full = '';
  const save = async () => {
    if (full.trim()) conversation.messages.push({ role: 'assistant', content: full.trim(), at: Date.now() });
    conversation.updatedAt = Date.now();
    await store.saveConversation(conversation).catch((err) => console.error('[chat] save failed:', err.message));
  };

  // Wait for the first words, so a failed LLM call can still be answered with an error status.
  let first: IteratorResult<string>;
  try {
    first = await chunks.next();
  } catch (err) {
    if (!abort.signal.aborted) console.error('[chat] reply failed:', (err as Error).message);
    await save();
    throw new HttpError(502, 'The reply could not be generated. Try again.');
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) {
          full += first.value;
          controller.enqueue(encoder.encode(first.value));
          for await (const chunk of chunks) {
            full += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
        }
      } catch (err) {
        if (!abort.signal.aborted) console.error('[chat] reply failed:', (err as Error).message);
      } finally {
        // Saved before the stream closes so the function is still running when it happens.
        await save();
        try { controller.close(); } catch { /* already cancelled */ }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  });
});
