# Voice Notes (Next.js)

Next.js App Router app that:
- records microphone audio or uploads audio/video files,
- transcribes with OpenRouter (`/api/transcribe`),
- generates social posts with OpenRouter (`/api/generate`).

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

- API key entry in UI has been removed.
- Browser calls local Next.js API routes only.
- OpenRouter API key is read server-side from `process.env.OPENROUTER_API_KEY`.
