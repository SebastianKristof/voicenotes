# VoiceNotes

I built VoiceNotes to see whether I could turn a recording into a useful draft and still find the original thought later. It keeps the source transcript, summary, and generated posts together. A note can produce several drafts from different prompts or style profiles.

The hosted workspace requires an access code. This fictional example shows the recording, transcript, summary, and draft workflow.

![Synthetic VoiceNotes workflow showing capture, transcript, summary, and generated content](docs/images/workflow.svg)

## How it works

~~~mermaid
flowchart TD
    A["Record or upload media"] --> B["Transcribe with bounded retries and fallbacks"]
    B --> C["Save the source transcript"]
    C --> D["Summarize"]
    C --> E["Apply a drafting template and style"]
    E --> F["Save a draft with its generation settings"]
~~~

- [Transcription](app/api/transcribe/route.js) can switch models and request formats after a provider failure. Server errors get bounded retries, and the input has a size limit.
- [Draft generation](app/api/generate/route.js) combines the transcript, prompt template, length, and selected style. Saved drafts retain the style snapshot and generation settings.
- [Supabase migrations](supabase/migrations/) define notes, posts, styles, and access sessions. Sessions can be revoked.

## Run locally

Install dependencies and create a local environment file.

~~~sh
npm ci
cp .env.example .env.local
~~~

In `.env.local`, configure the OpenRouter key, a Supabase project with the [migrations](supabase/migrations/) applied, and an access code. Then run `npm run dev`.

## Checks

~~~sh
npm test
npm run build
npm run test:smoke
~~~

The [unit tests](tests/) cover access handling, templates, export, and caching. The Playwright smoke test uses mock API responses. The app uses Next.js, React, and Supabase/PostgreSQL.
