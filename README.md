# Voice Notes (Next.js)

Next.js App Router app that:
- records microphone audio or uploads audio/video files,
- transcribes with OpenRouter (`/api/transcribe`),
- auto-generates heading + summary after transcription (`/api/summary`),
- generates social posts with OpenRouter (`/api/generate`) using selected writing style,
- stores notes/styles/posts in Supabase MVP Hub.

## Stack

- Next.js 16 (App Router)
- React 19
- Server Route Handlers for OpenRouter proxy

## Environment

Create `.env.local` in the project root (template included):

```bash
cp .env.example .env.local
```

Required variables:
- `OPENROUTER_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ACCESS_CODE` (shared access code required to open app/API)

Access control behavior:
- unauthenticated users are redirected to `/access`,
- successful code entry creates a persistent session,
- sessions are listed in `Settings` and can be terminated manually.

Optional variables:
- `OPENROUTER_TEXT_MODEL` (default: `openai/gpt-4o-mini`)
- `OPENROUTER_API_BASE` (default: `https://openrouter.ai/api/v1`)
- `OPENROUTER_APP_TITLE` (default: `Voice to Post`)
- `OPENROUTER_HTTP_REFERER` (optional app URL, for OpenRouter attribution/routing)
- `OPENROUTER_TRANSCRIBE_MODEL` (single STT model)
- `OPENROUTER_TRANSCRIBE_MODELS` (comma-separated STT model fallback chain, overrides single model when set)
- `OPENROUTER_TRANSCRIBE_TRANSPORTS` (comma-separated request formats: `json`, `multipart`; default: `json,multipart`)
- `OPENROUTER_TRANSCRIBE_RETRY_5XX` (retry count per model for upstream 5xx, default: `1`)
- `OPENROUTER_TRANSCRIBE_RETRY_DELAY_MS` (base backoff for 5xx retries, default: `300`)
- `OPENROUTER_TRANSCRIBE_MAX_BYTES` (max input size in bytes, default: `26214400` = 25MB)
- `MVP_HUB_APP_SLUG` (default: `voicenotes`)

Example:
- `OPENROUTER_TRANSCRIBE_MODELS=openai/whisper-1,openai/gpt-4o-mini-transcribe`
- `OPENROUTER_TRANSCRIBE_TRANSPORTS=json,multipart`
- `OPENROUTER_TRANSCRIBE_RETRY_5XX=1`
- `OPENROUTER_TRANSCRIBE_RETRY_DELAY_MS=300`

Transcription debug mode:
- Open app with `?debug=1` (for example `http://localhost:3000/?debug=1`).
- `/api/transcribe` will return full debug payload (`models`, `attempts`, raw upstream body), and UI will show it in the Whisper error text.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production build

```bash
npm run build
npm run start
```

## Security model

- API key entry in UI is removed.
- Browser calls local Next.js API routes only.
- OpenRouter API key is read server-side from `process.env.OPENROUTER_API_KEY`.

## Prompt templates

- All internal LLM prompts are in `/prompts`:
  - `prompts/generate-post.md`
  - `prompts/summary.md`
- API routes read these files on each request, so prompt edits are picked up without code changes.

## Persistence model (Supabase)

Tables (schema `mvp_hub`):
- `apps`
- `styles`
- `notes`
- `note_posts`
- legacy `artifacts` (kept for backwards compatibility)

Saved per note:
- dictated/input text
- heading + summary
- generated posts (multiple)
- generation settings (`length`, `extraInstructions`, style snapshot)

Saved globally:
- style profiles (`name`, `instructions`)

API routes:
- `GET/POST /api/styles`
- `DELETE /api/styles/:id`
- `GET/POST /api/notes`
- `GET/PATCH /api/notes/:id`
- `POST /api/notes/:id/posts`
- `GET /api/notes/:id/similar`
