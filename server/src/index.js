import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { config, supabaseEnabled, llmConfigured } from './config.js';
import { router } from './routes.js';
import { handleSession } from './session.js';

const app = express();
app.use(cors({ origin: config.webOrigins }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', router);
app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Server error.' : err.message });
});

const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 16 * 1024,
  // Browsers always send Origin; only listed web origins may open a session.
  verifyClient: ({ origin }) => !origin || config.webOrigins.includes(origin),
});
wss.on('connection', handleSession);

// Drop connections that stop answering pings.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});
wss.on('close', () => clearInterval(heartbeat));

server.listen(config.port, () => {
  console.log(`Parlor server on http://localhost:${config.port}`);
  console.log(`  data:  ${supabaseEnabled ? 'Supabase (database + sign-in)' : `local file ${config.dataFile} (no sign-in)`}`);
  console.log(`  llm:   ${llmConfigured ? `${config.llm.model} via ${config.llm.baseUrl}` : 'mock replies (set LLM_API_KEY and LLM_MODEL)'}`);
});
