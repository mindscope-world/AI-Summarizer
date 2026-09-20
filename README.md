# LeaderForge Academic Summarizer

AI-assisted summarization of university academic materials (lecture notes, papers, e-books, web articles) for The East Africa University. React + Vite frontend, Express + TypeScript backend.

> **Status: work in progress.** `plan.md` is the roadmap.
>
> | Working | Not yet (still simulated or `501 not_implemented`) |
> |---|---|
> | Document ingestion and preprocessing: `GET /api/health`, `POST /api/extract` (PDF, DOCX, TXT/MD, web article URL, pasted text; OCR fallback for scanned PDFs; cleaning; language detection; sentence/chunk segmentation) | AI summarization (the summary body, ROUGE numbers and "BERT/T5" labels in the UI are still placeholders), persistence and real auth, PDF/DOCX export, feedback loop |

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
| `npm test` | Vitest: server (env, middleware, routes, ingestion pipeline, SSRF guard) and client (`src/lib/api`, the new-summary modal in jsdom) |
| `npm run build` | `vite build` to `dist/`, and bundle the server to `server.js` |
| `npm start` | Production: `node server.js`, serving the API and `dist/` on one port |
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
| `MAX_UPLOAD_MB` | `50` | Max uploaded document size |
| `JSON_BODY_LIMIT` | `2mb` | Max JSON body |
| `RATE_LIMIT_PER_MINUTE` | `60` | Per user (per IP while signed out); `/health` is exempt |
| `CORS_ORIGINS` | empty | Comma-separated allowed cross-origin callers; empty means same-origin only |
| `TRUST_PROXY` | `0` | Reverse-proxy hops (Cloud Run = `1`) so rate limiting sees client IPs |
| `EXTRACT_RATE_LIMIT_PER_MINUTE` | `20` | Stricter limit for `POST /api/extract` |
| `MAX_PDF_PAGES` | `500` | Refuse PDFs with more pages |
| `MAX_EXTRACTED_CHARS` | `3000000` | Refuse documents with more text than this |
| `URL_FETCH_TIMEOUT_MS` | `15000` | Total time allowed to fetch a URL |
| `URL_FETCH_MAX_MB` | `10` | Max size of a fetched page (measured after decompression) |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

## Architecture

```
src/                    React app (Vite, Tailwind 4)
  lib/api.ts            typed fetch wrapper: base URL, timeouts, ApiError
  types.ts              domain types + API contract shared with the server
server/
  index.ts              entrypoint: env, logger, listen, graceful shutdown
  app.ts                middleware stack + route mounting + static hosting
  ai/                   LangChain chat-model factory (the only place a vendor SDK is imported)
  lib/                  env (zod), logger, errors, meta
  middleware/           requestId, accessLog, rateLimit, validate (zod), upload (multer)
  routes/               health, extract, summarize, documents, feedback, export
  pipeline/             ingestion + preprocessing (see below)
  testing/              PDF/DOCX builders and a fixture HTTP server for tests
scripts/                build-time checks
```

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

Known limits: multi-column PDF layouts are read in the order pdf.js provides (columns can interleave); tables become plain lines; legacy `.doc`, images and PDFs over 18 MB needing OCR are not supported; DOCX archives are not yet inspected for decompression bombs (Phase 7).

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

`requestId` -> `accessLog` -> security headers -> CORS -> rate limit -> JSON parse -> route (`validate` first) -> `errorHandler`.

Every error is returned in one shape (`ApiErrorBody` in `src/types.ts`):

```json
{"error": {"code": "validation_failed", "message": "Request validation failed.", "requestId": "…", "details": [{"path": "body.text", "message": "…"}]}}
```

The `requestId` matches the `x-request-id` response header and the access log line. Logs record metadata only (method, path without query, status, timing), never request bodies or document text.

The target pipeline follows the 6-stage workflow in the project documentation: input, preprocessing, AI summarization, output, users, feedback loop. `plan.md` maps each stage to a phase.

## Security notes

- The Groq key lives only in the server process (in a git-ignored `.env`). `npm run verify:bundle` runs in CI to prove it never reaches the client bundle.
- Sign-in is real Supabase Auth (email/password, magic link, Google). The server verifies the Supabase access token on every `/api` route except `/api/health` (`server/middleware/auth.ts`), accepts only user sessions (not the public anon key), and takes the audience, issuer and algorithm from configuration, never from the token.
- Each student's data is isolated by Row Level Security on every table and on the private `uploads` storage bucket (`supabase/migrations`). Roles live in `profiles.role`; a user cannot change their own, and sign-up cannot request `faculty`. There is no sharing model yet, so no role can read another user's documents.
- The workspace is unreachable while signed out; the UI shows only the Landing page. Summaries saved in `localStorage` before accounts existed are offered for a one-time import into the signed-in account.
- `npm run test:rls` runs the schema and isolation tests against disposable Postgres and PostgREST containers (needs Docker), including that two accounts cannot see or modify each other's rows or files.
- Accounts in `DEMO_CAMPUS_ACCOUNTS` are fictional (`*.example` addresses).

## CI

`.github/workflows/ci.yml` runs type-check, tests, build and the bundle-secret check on every push to `main` and every pull request.
