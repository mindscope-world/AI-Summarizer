# LeaderForge Academic Summarizer

AI-assisted summarization of university academic materials (lecture notes, papers, e-books, web articles) for The East Africa University. React + Vite frontend, Express + TypeScript backend.

> **Status: work in progress.** `plan.md` is the roadmap.
>
> | Working | Not yet (still simulated or `501 not_implemented`) |
> |---|---|
> | Document ingestion and preprocessing: `GET /api/health`, `POST /api/extract` (PDF, DOCX, TXT/MD, web article URL, pasted text; OCR fallback for scanned PDFs; cleaning; language detection; sentence/chunk segmentation) | AI summarization (the summary body, ROUGE numbers and "BERT/T5" labels in the UI are still placeholders), persistence and real auth, PDF/DOCX export, feedback loop |

## Requirements

- Node.js >= 20 (developed on 22)
- A Gemini API key (server-side only)

## Setup

```bash
npm ci
cp .env.example .env      # then set GEMINI_API_KEY
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
| `npm run verify:bundle` | Fails if `dist/` contains secret values or `GEMINI_API_KEY` |
| `npm run clean` | Remove `dist/` and `server.js` |

## Configuration

All variables are read by the server only (`server/lib/env.ts`) and validated at start-up. The server exits with a readable message if `GEMINI_API_KEY` is missing or still the placeholder. Never prefix a secret with `VITE_`: that would ship it to the browser.

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | required | Gemini API key |
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
| `GEMINI_OCR_MODEL` | `gemini-2.5-flash` | Model used to read scanned PDFs |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

## Architecture

```
src/                    React app (Vite, Tailwind 4)
  lib/api.ts            typed fetch wrapper: base URL, timeouts, ApiError
  types.ts              domain types + API contract shared with the server
server/
  index.ts              entrypoint: env, logger, listen, graceful shutdown
  app.ts                middleware stack + route mounting + static hosting
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
  ocr.ts         Gemini transcription for PDFs with no text layer
  safeFetch.ts   SSRF-safe URL fetching (see below)
  clean.ts       ligatures, zero-width chars, hyphenation, hard-wrap reflow, headers/footers, page numbers
  language.ts    franc-based; only real prose votes, so technical text is not mislabelled
  segment.ts     Intl.Segmenter sentences + token-budgeted overlapping chunks
  ingest.ts      orchestrates the stages and reports progress
```

Behaviour worth knowing:

- **Scanned PDFs** (fewer than ~20 characters of text per page) are sent to Gemini for OCR. **This transmits the document to Google's API**; the result carries a warning saying OCR was used and to check it. Without an OCR provider such files are rejected with a clear message.
- **URLs** are fetched only over http/https, with every resolved address checked against private, loopback, link-local, multicast and reserved ranges (including cloud metadata, IPv4-mapped IPv6 and numeric host tricks). The check happens inside the connection's own DNS lookup, so DNS rebinding cannot swap in an internal address; redirects are re-validated hop by hop; time and decompressed size are capped.
- **Language** is `und` (undetermined) rather than a guess when there is no running prose to judge by, and `mixed` is only reported between supported languages (English, Swahili, French).
- Documents are processed in memory and never written to disk. Logs contain metadata only.

Known limits: multi-column PDF layouts are read in the order pdf.js provides (columns can interleave); tables become plain lines; legacy `.doc`, images and PDFs over 18 MB needing OCR are not supported; DOCX archives are not yet inspected for decompression bombs (Phase 7).

## Request flow

`requestId` -> `accessLog` -> security headers -> CORS -> rate limit -> JSON parse -> route (`validate` first) -> `errorHandler`.

Every error is returned in one shape (`ApiErrorBody` in `src/types.ts`):

```json
{"error": {"code": "validation_failed", "message": "Request validation failed.", "requestId": "…", "details": [{"path": "body.text", "message": "…"}]}}
```

The `requestId` matches the `x-request-id` response header and the access log line. Logs record metadata only (method, path without query, status, timing), never request bodies or document text.

The target pipeline follows the 6-stage workflow in the project documentation: input, preprocessing, AI summarization, output, users, feedback loop. `plan.md` maps each stage to a phase.

## Security notes

- The Gemini key lives only in the server process. `npm run verify:bundle` runs in CI to prove it never reaches the client bundle.
- Auth and storage in the UI are still **simulated in the browser** (`src/lib/supabaseAuth.ts`, `localStorage`) until Phase 4. Do not treat them as real access control.
- Accounts in `DEMO_CAMPUS_ACCOUNTS` are fictional (`*.example` addresses).

## CI

`.github/workflows/ci.yml` runs type-check, tests, build and the bundle-secret check on every push to `main` and every pull request.
