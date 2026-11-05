# Architecture

One container serves a React app and an Express API. Sign-in and all stored data live in Supabase. The language models run on Groq (open-weights models, reached through LangChain).

```
Browser (React + Vite)
  ├─ /api/*  ─────────────►  Express server (server/)
  │                            extract · summarize · translate · questions · export
  │                            └─ LangChain ─► Groq (open-weights models)
  └─ Supabase client  ────►  Supabase: Auth · Postgres (RLS) · private Storage
```

## Two trust zones

- The **server** holds the Groq key and does the work that needs it or that is CPU-heavy (extraction, summarizing, translating, building files). It **has no database access**: it never sees stored documents, only what a request carries, and keeps nothing.
- The **browser** talks to Supabase directly for everything the student owns. The database enforces who may see what (Row Level Security), so the browser code is not what keeps students apart.

The server checks the Supabase access token on every `/api` route except `/health`, so only signed-in users can spend model tokens.

## The pipeline (`POST /api/extract`, then `/api/summarize`)

| Stage | Where | What happens |
|---|---|---|
| 1 Input | `server/routes/extract.ts`, `server/middleware/upload.ts` | file, URL or pasted text; extension and content must agree |
| 2 Preparation | `server/pipeline/` | `pdf.ts` (pdf.js), `docx.ts` (mammoth, after `zipGuard.ts`), `html.ts` (Readability), `ocr.ts` + `rasterize.ts` (scans), `clean.ts`, `language.ts`, `segment.ts`, all orchestrated by `ingest.ts`. URLs go through `safeFetch.ts` (SSRF guard) |
| 3 Summarizing | `server/ai/summarize.ts` | abstractive: one pass, or map-reduce over sections for long text, with structured (zod-validated) output and one repair retry; extractive: `textrank.ts` picks sentences, the model only labels them. `grounding.ts` flags figures and names that are not in the source. `gateway.ts` is the only door to the model (token budgeting, error mapping) |
| 4 Output | `server/export/`, `server/ai/translate.ts`, `server/ai/questions.ts`; client `src/components/` | structured summary, translation, new questions, PDF/DOCX/TXT/MD |

Prompt-injection stance: document text and example summaries are untrusted. They are fenced in delimiters (with any look-alike delimiter inside them removed), the system prompt says to ignore instructions inside them, the model has no tools, and its output is validated against a schema and shown as text.

## Data (`supabase/migrations/`)

`profiles` (role), `documents`, `document_sources` (the large extracted text, loaded on demand), `summaries` (one row per document and language, so translations are rows), `comments`, `review_progress`, `feedback`, `user_preferences`, and a private `uploads` bucket with one folder per user. Every table has Row Level Security: a user reads and changes only rows whose `user_id` is theirs. `profiles.role` can be changed only by an administrator, so nobody can promote themselves; sign-up can request `researcher` but not `faculty`.

`feedback_aggregates()` is the one place a query crosses users. It is `SECURITY DEFINER`, refuses everyone who is not faculty, and returns only averages per group (model, mode, length, language, role, with/without examples), hiding groups of fewer than 3 responses.

`npm run test:rls` proves the isolation and the function against a real Postgres and PostgREST in containers.

## Feedback loop

1. **Collect**: a 1-5 rating and comment on any summary (`SummaryFeedback`), stored with the model, mode, length, language, subject and role it applied to.
2. **Analyse**: the Metrics tab computes the student's own averages by model, mode, length and language, and the with/without-examples comparison. Faculty additionally see the grouped averages across all users.
3. **Improve**: a summary the student rated 4 or 5 *and* marked "use as an example" is offered as a style reference the next time **that student** summarizes something in the same subject and language (`feedbackRepository.examples`, sent as `examples` to `/api/summarize`). Only that student's own summaries are ever used, and only their summary text (not the source).
4. **Measure quality**: `npm run eval` runs the summarizer over human-written reference summaries in `scripts/eval/gold/` and writes ROUGE-1/2/L to `src/data/benchmark.json`, shown in the Metrics tab as "benchmark on N reference documents". ROUGE is never reported for an individual summary.

There is no retraining. Exporting consented pairs for a fine-tuning dataset was left out on purpose (see `docs/PRIVACY.md`).

## Performance choices

The app is split into per-screen chunks loaded on demand (landing page, editor, dashboard, ...) and vendor libraries are separate files. The history list re-renders only the card that changed. Large source text is fetched only when a document is opened.

## Deployment

`Dockerfile` builds both halves and runs `node server.js` as a non-root user with a health check. See `docs/RUNBOOK.md`.
