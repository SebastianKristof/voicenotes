# Voice Notes (Next.js)

Next.js App Router app that:
- records microphone audio or uploads audio/video files,
- transcribes with OpenRouter (`/api/transcribe`),
- auto-generates heading + summary after transcription (`/api/summary`),
- generates social posts with OpenRouter (`/api/generate`) using selected writing style.

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

Optional variables:
- `OPENROUTER_TEXT_MODEL` (default: `openai/gpt-4o-mini`)
- `OPENROUTER_TRANSCRIBE_MODEL` (default: `openai/whisper-large-v3`)

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

## Saving recordings and artifacts

Current implementation:
- last microphone recording can be downloaded from the UI,
- generated artifacts (transcript, summary, heading, post, length, style metadata) are stored in browser localStorage,
- artifacts can be exported as JSON.

Recommended next step (production):
- add authenticated server-side persistence (e.g., Postgres + object storage),
- store audio files in object storage and save metadata rows for transcript/summary/post/style,
- keep localStorage only as short-term cache.
