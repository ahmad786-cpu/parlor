# Parlor

Create AI personalities (name, behaviour, voice), talk to them by voice or text, and share a
link so anyone can try one without an account.

Everything lives in `web/`, a Next.js app: the pages and the API (`web/app/api`) deploy together,
for example as one Vercel project.

## Run it locally

Needs Node.js 20 or newer. Nothing else is required for a first run: with no keys set, the app
stores data in a local JSON file (`web/data/`), skips sign-in, and answers with mock replies.

```bash
cd web
cp .env.example .env.local
npm install
npm run dev            # http://localhost:3000
```

Open http://localhost:3000 in Chrome or Edge (voice input uses the browser's speech
recognition, which Firefox does not have; text chat works everywhere).

## Real answers: connect an LLM

The app talks to any OpenAI-compatible `/chat/completions` endpoint with streaming.
In `web/.env.local`:

```
LLM_BASE_URL=https://api.openai.com/v1     # or another compatible provider's base URL
LLM_API_KEY=your-key
LLM_MODEL=the-model-name
```

Restart `npm run dev` after changing it.

## Accounts and cloud storage: connect Supabase

Required when the app is hosted: serverless hosts cannot keep the local JSON file.

1. Create a project at supabase.com.
2. SQL Editor > New query: paste `web/supabase.sql` and run it. This creates the tables and
   turns on row level security, so the browser key cannot read anything; all data goes through
   the API routes.
3. Project Settings > API Keys. Set `NEXT_PUBLIC_SUPABASE_URL` (the project URL),
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the anon / publishable key) and `SUPABASE_SERVICE_ROLE_KEY`
   (the service role / secret key, server only).
4. Google sign-in: Authentication > Sign In / Providers > Google. It needs an OAuth client ID and
   secret from Google Cloud Console (APIs & Services > Credentials > OAuth client ID > Web
   application), with the callback URL that Supabase shows on that page as an authorized
   redirect URI.
5. Authentication > URL Configuration: set Site URL to the app's address and add
   `<app address>/dashboard` to the redirect URLs (also `http://localhost:3000/dashboard` for
   local use).

Once the Supabase keys are set, everything except share links requires a signed-in user.

## Deploying to Vercel

Import the GitHub repo in Vercel, set **Root Directory** to `web`, and add the environment
variables from `web/.env.example` (LLM and Supabase). Redeploy after changing a
`NEXT_PUBLIC_` value; those are built into the page.

## How it works

```
Browser                                       API routes (web/app/api)
-------                                       ------------------------
microphone -> speech recognition
            -> text ── POST /api/chat/reply ─> load conversation + personality, build prompt
                                               stream LLM reply
speech synthesis <─ streamed text <─────────── save conversation
```

- **Speech** runs in the browser (Web Speech API), so a call needs no speech provider keys.
  Replies are spoken sentence by sentence while they stream. The call is half-duplex: the
  microphone closes while the personality speaks, and **Interrupt** cancels the reply request.
- **Prompts stay on the server.** A share-link visitor receives the name, greeting, colours
  and voice settings, never the instructions.
- **Share links** look like `/dashboard/personality-demo?token=Asif-rnGU6`. Replacing a link
  invalidates the old one.
- **History** stores each conversation; the owner of a personality sees all of them,
  including ones started from a share link.

### API (`/api`)

| Route | Purpose |
| --- | --- |
| `POST /chat/start` | `{ token }` or `{ personalityId }` (signed in) → `{ conversationId, personality, greeting }` |
| `POST /chat/reply` | `{ conversationId, text }` → reply as a plain-text stream; errors as `{ error, fatal }` |
| `GET /demo/:token` | public personality info for a share link |
| `GET\|POST /personalities` · `GET\|PUT\|DELETE /personalities/:id` · `POST /personalities/:id/share` | manage your personalities |
| `GET /conversations` | history |
| `GET /config` · `GET /health` | status |

## Limits to know about

- Share links are public and each message costs LLM tokens. The app caps message length,
  messages per conversation, and messages per IP (constants in `web/app/api/chat/reply/route.ts`
  and `web/lib/server/rateLimit.ts`).
- Voices depend on the listener's browser and device. A chosen voice that is missing falls
  back to another voice in the same language.
- Featured personalities are defined in `web/lib/server/seed.ts`.
