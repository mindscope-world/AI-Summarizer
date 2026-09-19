# LeaderForge Academic Summarizer

AI-assisted summarization of university academic materials (lecture notes, papers, e-books, web articles) for The East Africa University. React + Vite frontend, Express + TypeScript backend.

> **Status: work in progress.** The UI is complete, but summarization, ingestion, persistence, real auth and export are still being built. `plan.md` is the roadmap. Today only `GET /api/health` is functional; the other API routes validate input and return `501 not_implemented` naming the phase that will build them.

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

If port 3000 is taken, the client fails with a clear error instead of drifting onto the API's port. Pick another one:

```bash
npm run dev:client -- --port 3100   # run `npm run dev:server` in another terminal
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | API (`tsx watch`) and Vite together |
| `npm run dev:server` / `dev:client` | Either half on its own |
| `npm run lint` | Type-check the whole project (`tsc --noEmit`) |
| `npm test` | Vitest: server (env, middleware, routes) and client (`src/lib/api`) |
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
scripts/                build-time checks
```

Request flow: `requestId` -> `accessLog` -> security headers -> CORS -> rate limit -> JSON parse -> route (`validate` first) -> `errorHandler`.

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
