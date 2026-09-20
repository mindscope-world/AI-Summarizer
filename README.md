# LeaderForge Academic Summarizer

AI-assisted summarization of university academic materials (lecture notes, papers, e-books, web articles) for The East Africa University. Students upload a file, paste a link or text, and get a structured study summary (in English or Kiswahili) with key points and discussion questions, plus translation, export and a review schedule. React + Vite frontend, Express + TypeScript backend, Supabase for sign-in and storage, open-weights models on Groq through LangChain.

| | |
|---|---|
| **Summaries** | abstractive (a model writes it) or extractive (key sentences quoted from the source); concise, balanced or detailed; long documents read in sections; figures not found in the source are flagged |
| **Inputs** | PDF, DOCX, TXT, Markdown, web article links, pasted text; scanned PDFs are read with a vision model |
| **Study tools** | discussion questions (and a new one on request), English-Kiswahili translation, 1-3-7-30 day review schedule, notes and comments |
| **Export** | PDF, Word, plain text, Markdown |
| **Accounts** | Supabase Auth; every student's data is private to them (Row Level Security); faculty see averaged ratings only |
| **Feedback** | 1-5 ratings per summary, personal Metrics tab, faculty aggregates, own well-rated summaries reused as style examples, offline ROUGE benchmark |

Documentation: [`docs/API.md`](docs/API.md) (endpoints), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (how it fits together), [`docs/RUNBOOK.md`](docs/RUNBOOK.md) (deploy and operate), [`docs/PRIVACY.md`](docs/PRIVACY.md) (what happens to data), [`docs/DEMO.md`](docs/DEMO.md) (presentation script; sample texts in `docs/samples/`), [`plan.md`](plan.md) (roadmap and what is still open).

## Requirements

- Node.js >= 20 (developed on 22)
- A Groq API key (server-side only; free tier available at https://console.groq.com/keys). Groq serves open-weights models through LangChain.
- A Supabase project (free tier is fine) for sign-in and storage. Run `supabase/migrations/*.sql` in its SQL editor, enable the Email and Google providers, then set `SUPABASE_URL`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`. Without them the app still starts, but nobody can sign in.
- Docker, only for `npm run test:rls` (see Scripts).

## Setup

```bash
npm ci
cp .env.example .env      # then set GROQ_API_KEY and the Supabase values (see below)
npm run dev               # API on :3001 + web app on :3000
```

Open http://localhost:3000. Vite proxies `/api` to the Express server.

If port 3000 is taken, the client fails with a clear error instead of drifting onto the API's port. Pick another one with `CLIENT_PORT`:

```bash
CLIENT_PORT=3100 npm run dev
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | API (`tsx watch`) and Vite together |
| `npm run dev:server` / `dev:client` | Either half on its own |
| `npm run lint` | Type-check the whole project (`tsc --noEmit`) |
| `npm test` | Vitest: server (env, middleware, routes, pipeline, SSRF and zip guards, export, evaluation) and client (api, repositories, hooks, components in jsdom). Database tests are skipped here |
| `npm run test:rls` | Schema, Row Level Security and the data layer against disposable Postgres + PostgREST containers (needs Docker) |
| `npm run build` | `vite build` to `dist/`, and bundle the server to `server.js` |
| `npm start` | Production: `node server.js`, serving the API and `dist/` on one port |
| `npm run smoke` | Checks a running server (`SMOKE_URL`, optional `SMOKE_TOKEN`, `SMOKE_SUMMARIZE=1`); see `docs/RUNBOOK.md` |
| `npm run eval` | Offline ROUGE benchmark on the human-written references in `scripts/eval/gold/`; writes `src/data/benchmark.json` |
| `npm run verify:bundle` | Fails if `dist/` contains secret values, server-only setting names or a `gsk_...` key |
| `npm run clean` | Remove `dist/` and `server.js` |

## Configuration

All variables except the two public `VITE_SUPABASE_*` ones are read by the server only (`server/lib/env.ts`) and validated at start-up. The server exits with a readable message if `GROQ_API_KEY` is missing or still the placeholder. Never prefix a secret with `VITE_`: that would ship it to the browser.

| Variable | Default | Purpose |
|---|---|---|
| `GROQ_API_KEY` | required | Groq API key |
| `LLM_MODEL` | `openai/gpt-oss-120b` | Open-weights chat model for summarization (Qwen's 1,000 output-tokens/min free limit is too small for it) |
| `OCR_MODEL` | `qwen/qwen3.8-27b` | Vision-capable open-weights model that reads scanned PDFs |
| `OCR_MAX_PAGES` | `20` | Refuse scanned PDFs with more pages (one API call per page) |
| `LLM_TIMEOUT_MS` | `60000` | Per-request timeout to the model |
| `LLM_MAX_RETRIES` | `3` | Automatic retries on 429/5xx |
| `GROQ_BASE_URL` | Groq's API | Optional proxy / compatible server |
| `SUPABASE_URL` | required in production | Supabase project URL; the server fetches its public keys from it to verify sign-in tokens |
| `SUPABASE_JWT_SECRET` | unset | Only for projects still on the legacy HS256 secret |
| `AUTH_MODE` | `required` | `off` skips the token check (local experiments only; refused in production) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | required for sign-in | The browser's Supabase client. Public by design; Row Level Security protects the data |
| `PORT` | `3001` | API port (Cloud Run injects this) |
| `NODE_ENV` | `development` | `development`, `production` or `test` |
| `APP_URL` | unset | Public URL of the deployment |
| `LLM_TPM`, `LLM_MAX_CONCURRENT`, `SUMMARY_CHUNK_TOKENS`, `SUMMARY_MAX_CHUNKS`, `SUMMARIZE_RATE_LIMIT_PER_MINUTE` | see `.env.example` | Token budget, concurrency, section size and per-user limit for model calls |
| `MAX_UPLOAD_MB` | `50` | Max uploaded document size |
| `JSON_BODY_LIMIT` | `2mb` | Max JSON body |
| `RATE_LIMIT_PER_MINUTE` | `60` | Per user (per IP while signed out); `/health` is exempt |
| `CORS_ORIGINS` | empty | Comma-separated allowed cross-origin callers; empty means same-origin only |
| `TRUST_PROXY` | `0` | Reverse-proxy hops (Cloud Run = `1`) so rate limiting sees client IPs |
| `EXTRACT_RATE_LIMIT_PER_MINUTE` | `20` | Stricter limit for `POST /api/extract` and `POST /api/export` |
| `MAX_PDF_PAGES` | `500` | Refuse PDFs with more pages |
| `MAX_EXTRACTED_CHARS` | `3000000` | Refuse documents with more text than this |
| `URL_FETCH_TIMEOUT_MS` | `15000` | Total time allowed to fetch a URL |
| `URL_FETCH_MAX_MB` | `10` | Max size of a fetched page (measured after decompression) |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

## Architecture

```
src/                    React app (Vite, Tailwind 4); each screen is its own lazily loaded chunk
  lib/                  api client, auth, repositories (documents, feedback), hooks, metrics
  components/           screens and dialogs
  data/benchmark.json   written by `npm run eval`
  types.ts              domain types + API contract shared with the server
server/
  index.ts              entrypoint: env, logger, listen, graceful shutdown, fatal-error logging
  app.ts                middleware stack + route mounting + static hosting
  ai/                   model gateway (LangChain, the only vendor import), summarize, translate, questions, TextRank, grounding
  eval/                 ROUGE and the benchmark
  export/               PDF / DOCX / TXT / MD builders
  lib/, middleware/     env (zod), logger, errors; auth, rate limits, security headers, upload, validation
  routes/               health, extract, summarize, translate, questions, export
  pipeline/             ingestion + preprocessing (see below)
supabase/               migrations and the database tests
scripts/                bundle-secret check, smoke test, RLS test runner, eval
docs/                   API, architecture, runbook, privacy, demo
```

See `docs/ARCHITECTURE.md` for the two trust zones (the server has no database access; the browser talks to Supabase under Row Level Security).

## Document ingestion (`POST /api/extract`)

Send exactly one of: a multipart `file`, a JSON `url`, or JSON `text`. Optional `stripReferences` drops a trailing bibliography. The response is an `ExtractionResult` (`src/types.ts`): cleaned `text`, `wordCount`, detected `language`, `stats`, `chunks` (offsets into `text` for long-document summarization) and human-readable `warnings`.

```
server/pipeline/
  sniff.ts       real format from the bytes, checked against the file name (never trusts the extension)
  pdf.ts         pdf.js text + layout -> lines, paragraph gaps from vertical spacing
  docx.ts        mammoth
  html.ts        Readability main-article extraction (linkedom)
  text.ts        UTF-8/UTF-16 BOM, Windows-1252 fallback
  rasterize.ts   renders PDF pages to images (pdf.js + @napi-rs/canvas)
  ocr.ts         vision-model transcription of scanned pages, via LangChain
  safeFetch.ts   SSRF-safe URL fetching (see below)
  clean.ts       ligatures, zero-width chars, hyphenation, hard-wrap reflow, headers/footers, page numbers
  language.ts    franc-based; only real prose votes, so technical text is not mislabelled
  segment.ts     Intl.Segmenter sentences + token-budgeted overlapping chunks
  ingest.ts      orchestrates the stages and reports progress
```

Behaviour worth knowing:

- **Scanned PDFs** (fewer than ~20 characters of text per page) are rendered to images and transcribed page by page by an open-weights vision model (default `qwen/qwen3.8-27b`) through LangChain's `ChatGroq`. **This sends the page images to Groq's hosted API**; the model is open-weights but it is not running on your own hardware. The result carries a warning saying OCR was used and to check it. Free-tier limits (about 1,000 requests/day and 8,000 tokens/minute per model) mean a scanned document costs roughly one request and ~1.5k tokens per page, so long scans are slow; failures show a clear message rather than provider details.
- **URLs** are fetched only over http/https, with every resolved address checked against private, loopback, link-local, multicast and reserved ranges (including cloud metadata, IPv4-mapped IPv6 and numeric host tricks). The check happens inside the connection's own DNS lookup, so DNS rebinding cannot swap in an internal address; redirects are re-validated hop by hop; time and decompressed size are capped.
- **Language** is `und` (undetermined) rather than a guess when there is no running prose to judge by, and `mixed` is only reported between supported languages (English, Swahili, French).
- Documents are processed in memory and never written to disk. Logs contain metadata only.

Known limits: multi-column PDF layouts are read in the order pdf.js provides (columns can interleave); tables become plain lines; legacy `.doc`, images and PDFs over 18 MB needing OCR are not supported. DOCX archives that declare an absurd uncompressed size or part count are refused before opening (`server/pipeline/zipGuard.ts`); an archive that lies about its sizes is only caught after the fact, so the upload limit and the memory of the host are the backstop.

## Export (`POST /api/export`)

Sends a summary in, returns a real file out: `pdf`, `docx`, `txt` or `md`. The browser posts the summary as it is on screen (so unsaved edits, the student's own notes and any translation are included), and nothing is stored on the server.

```json
{"format": "pdf", "document": {"title": "…", "language": "English", "contentParagraphs": ["…"], "bulletPoints": [{"title": "…", "text": "…"}], "discussionQuestions": [{"question": "…", "context": "…"}], "userNotes": "…"}}
```

- **PDF** (`pdfkit`): A4, real selectable text, headings, bullets, numbered questions, page numbers, document properties. It uses the standard PDF fonts, which cover English, Swahili and French; any other character becomes `?` and the response carries an `X-Export-Warning` header, which the app shows. Use Word or text for those.
- **DOCX** (`docx`): styled headings, true bullet and numbered lists, page numbers, document properties.
- **TXT / MD**: the same content as plain text or Markdown.
- Headings are in the summary's language (Swahili summaries get Swahili headings). File names are ASCII, made from the title.
- The endpoint takes the summary in the request rather than reading it from the database by id (as `plan.md` first sketched), because the server has no database access of its own and this way an export always matches what the student is looking at.

## Translation (`POST /api/translate`)

Translates a structured summary between English and Swahili with the same open-weights model that wrote it. The result lines up with the original item for item (same number of paragraphs, key points and questions), so review ticks and the current question carry over. The model is asked again once if the counts do not match, and the response carries a warning if a figure appears in the translation that is not in the original. Translations are stored as extra rows in `summaries` (one per language) and can be switched in the editor and exported. French is not offered yet.

## Request flow

`requestId` -> `accessLog` -> security headers -> CORS -> auth -> rate limit -> JSON parse -> route (`validate` first) -> `errorHandler`.

Every error is returned in one shape (`ApiErrorBody` in `src/types.ts`):

```json
{"error": {"code": "validation_failed", "message": "Request validation failed.", "requestId": "…", "details": [{"path": "body.text", "message": "…"}]}}
```

The `requestId` matches the `x-request-id` response header and the access log line. Logs record metadata only (method, path without query, status, timing), never request bodies or document text.

The target pipeline follows the 6-stage workflow in the project documentation: input, preprocessing, AI summarization, output, users, feedback loop. `plan.md` maps each stage to a phase.

## Security notes

- The Groq key lives only in the server process (in a git-ignored `.env`). `npm run verify:bundle` runs in CI to prove it never reaches the client bundle.
- Sign-in is real Supabase Auth (email/password, magic link, Google). The server verifies the access token on every `/api` route except `/api/health`, accepts only user sessions (not the public anon key), and takes the audience, issuer and algorithm from configuration, never from the token.
- Each student's data is isolated by Row Level Security on every table and on the private `uploads` bucket. Roles live in `profiles.role`; a user cannot change their own, and sign-up cannot request `faculty`. There is no sharing model: no role can read another user's documents. The one cross-user query is `feedback_aggregates()`, faculty-only, averages only, groups of fewer than 3 hidden.
- Web responses carry a Content-Security-Policy (scripts from our own origin only; connections only to this server and the Supabase project), `X-Frame-Options: DENY`, `nosniff`, a Permissions-Policy, and HSTS in production. API responses are `no-store`.
- Uploads: extension and content must agree; size, page and character limits; DOCX archive size guard; files are processed in memory and never written to disk. URL fetching blocks private, loopback, link-local and metadata addresses, including after DNS resolution and redirects.
- Untrusted text (documents, example summaries) is fenced in delimiters and the models are told to ignore instructions inside it; the models have no tools and their output is schema-validated.
- CPU- and model-heavy routes have their own per-user rate limits; only a few summarizations run at once; closing the connection cancels model calls.
- Logs contain metadata only. Unhandled errors are logged and the process exits so the platform restarts it.
- `npm audit` reports no known vulnerabilities at the time of writing; CI does not enforce it yet.
- `npm run test:rls` proves that two accounts cannot see or modify each other's rows or files, and that only faculty can call the aggregate function.

Not covered: the app has not been through an external penetration test; the CSP has been checked against the built page's structure but not exercised in every browser; sign-in flows (Google OAuth, email confirmation) need a real Supabase project to verify.

## Deploy

`Dockerfile` builds the web app and the server into one image (non-root, health check). `docs/RUNBOOK.md` has the steps, the settings each environment needs, logging and alerting, and troubleshooting.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request: type-check, tests, build, the bundle-secret check and a smoke test of the built server; a `database` job runs `npm run test:rls`; a `docker` job builds the production image.
