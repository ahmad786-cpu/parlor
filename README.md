# Parlor

Create AI personalities (name, behaviour, voice), talk to them by voice or text, and share a
link so anyone can try one without an account.

```
web/      Next.js app: dashboard, personality editor, demo/call screen, history
server/   Node.js: REST API + WebSocket conversation server
```

## Run it locally

Needs Node.js 20 or newer. Nothing else is required for a first run: with no keys set, the
server stores data in a local JSON file, skips sign-in, and answers with mock replies.

```bash
# terminal 1
cd server
cp .env.example .env
npm install
npm run dev            # http://localhost:4000

# terminal 2
cd web
cp .env.example .env.local
npm install
npm run dev            # http://localhost:3000
```

Open http://localhost:3000 in Chrome or Edge (voice input uses the browser's speech
recognition, which Firefox does not have; text chat works everywhere).

## Real answers: connect an LLM

The server talks to any OpenAI-compatible `/chat/completions` endpoint with streaming.
In `server/.env`:

```
LLM_BASE_URL=https://api.openai.com/v1     # or another compatible provider's base URL
LLM_API_KEY=your-key
LLM_MODEL=the-model-name
```

Restart the server. The startup log shows which model is in use.

## Accounts and cloud storage: connect Supabase

1. Create a project at supabase.com.
2. SQL Editor > New query: paste `server/supabase.sql` and run it. This creates the tables and
   turns on row level security, so the browser key cannot read anything; all data goes through
   the server.
3. Project Settings > API. Put the project URL and the **service role** key in `server/.env`
   (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), and the project URL and the **anon** key in
   `web/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
4. Google sign-in: Authentication > Sign In / Providers > Google. It needs an OAuth client ID and
   secret from Google Cloud Console (APIs & Services > Credentials > OAuth client ID > Web
   application), with the callback URL that Supabase shows on that page as an authorized
   redirect URI.
5. Authentication > URL Configuration: set Site URL to the web app's address and add
   `<web app address>/dashboard` to the redirect URLs (also `http://localhost:3000/dashboard` for
   local use).

Configure both sides or neither. Once the server has Supabase keys it requires a signed-in user
for everything except share links.

## How it works

```
Browser                                    Server
-------                                    ------
microphone -> speech recognition
            -> text  ──── WebSocket ────>  load personality, build prompt
                                           stream LLM reply
speech synthesis <─ text chunks <────────  save conversation
```

- **Speech** runs in the browser (Web Speech API), so a call needs no speech provider keys.
  Replies are spoken sentence by sentence while they stream. The call is half-duplex: the
  microphone closes while the personality speaks, and **Interrupt** cuts a reply short.
- **Prompts stay on the server.** A share-link visitor receives the name, greeting, colours
  and voice settings, never the instructions.
- **Share links** look like `/dashboard/personality-demo?token=Asif-rnGU6`. Replacing a link
  invalidates the old one.
- **History** stores each conversation; the owner of a personality sees all of them,
  including ones started from a share link.

### WebSocket protocol (`/ws`)

| Direction | Message |
| --- | --- |
| client → server | `{ type: 'start', token }` or `{ type: 'start', personalityId, idToken }` |
| client → server | `{ type: 'user_text', text }` |
| client → server | `{ type: 'cancel' }` |
| server → client | `{ type: 'ready', personality, greeting }` |
| server → client | `{ type: 'delta', text }` |
| server → client | `{ type: 'done', cancelled }` |
| server → client | `{ type: 'error', message, fatal }` |

### REST API (`/api`)

`GET /config` · `GET /demo/:token` (public) · `GET|POST /personalities` ·
`GET|PUT|DELETE /personalities/:id` · `POST /personalities/:id/share` · `GET /conversations`

## Deploying

The web app and the server deploy separately: the server keeps WebSocket connections open, which
serverless hosts such as Vercel do not support.

- **Server on Render**: push this folder to GitHub, then Render > New > Blueprint and pick the
  repo; `render.yaml` sets it up. Fill in the secret values it asks for, with `WEB_ORIGIN` set
  to the web app's URL (only listed origins may call the API or open a socket). Free instances
  sleep when idle, so the first request after a pause takes about 30 seconds.
- **Web on Vercel**: import the same repo with **Root Directory** `web`, and set
  `NEXT_PUBLIC_API_URL` to the server's `https://` URL plus the `NEXT_PUBLIC_SUPABASE_*` values.
  Redeploy after changing them; they are built into the page.
- `TRUST_PROXY` is the number of proxies in front of the server, so the per-IP limit sees real
  client addresses.
- Serve both over HTTPS; browsers only allow the microphone on secure origins.

## Limits to know about

- Share links are public and each message costs LLM tokens. The server caps message length,
  turns per conversation, and messages per IP (see the constants at the top of
  `server/src/session.js`); the per-IP counter is in memory, so it is per server process.
- Voices depend on the listener's browser and device. A chosen voice that is missing falls
  back to another voice in the same language.
- The JSON file store is for development only. Use Supabase for anything shared.
- Featured personalities are defined in `server/src/seed.js`.
