# Runbook

## First deploy (Google Cloud Run; any container host works the same way)

1. **Supabase.** Create a project. Run `supabase/migrations/*.sql` in order in the SQL editor (or `supabase db push`). Turn on the Email and Google providers (Authentication > Providers) and add your app URL to the redirect URLs. Note the project URL and the anon (publishable) key.
2. **Groq.** Create an API key at https://console.groq.com/keys. Prefer a plan whose terms say inputs are not used for training.
3. **Build** (the two `VITE_` values are public and are baked into the browser bundle, so they are build arguments):

   ```bash
   docker build \
     --build-arg VITE_SUPABASE_URL=https://<project>.supabase.co \
     --build-arg VITE_SUPABASE_ANON_KEY=<anon key> \
     -t leaderforge .
   ```

4. **Run with secrets as runtime configuration**, not build arguments:

   | Variable | Value |
   |---|---|
   | `GROQ_API_KEY` | your key (store in Secret Manager or the host's secret store) |
   | `SUPABASE_URL` | the project URL (the server verifies sign-in tokens with the project's public keys) |
   | `APP_URL` | the public URL |
   | `NODE_ENV` | `production` (the image sets it) |
   | `TRUST_PROXY` | `1` behind Cloud Run / one load balancer (the image sets it) |

   The server refuses to start in production without `SUPABASE_URL` (or `SUPABASE_JWT_SECRET`), with `AUTH_MODE=off`, or with a missing Groq key. Everything else has a default; see `.env.example`.

   ```bash
   gcloud run deploy leaderforge --source . --region <region> --allow-unauthenticated \
     --set-secrets GROQ_API_KEY=groq-key:latest --set-env-vars SUPABASE_URL=...,APP_URL=... \
     --memory 1Gi --cpu 1 --max-instances 3
   ```

   (`--allow-unauthenticated` is right: sign-in is the app's own, and `/api` rejects requests without a valid token. With `--source`, pass the build args through a `cloudbuild.yaml` or build and push the image yourself.)
5. **Give someone faculty.** In the Supabase SQL editor (no signed-in user, so the guard trigger allows it): `update profiles set role = 'faculty' where id = '<user id>';`
6. **Smoke test:** `SMOKE_URL=https://<your app> node scripts/smoke.mjs`. Add `SMOKE_TOKEN=<access token of a test account>` to also check extraction and all four exports, and `SMOKE_SUMMARIZE=1` for one real summary.

## Free deploy on Render (sleeps when idle)

`render.yaml` describes a free Render web service built from the `Dockerfile`. It sleeps after 15 minutes without traffic; the next request wakes it in about 30-60 seconds. Free instances have 512 MB RAM, so the blueprint caps the Node heap, scanned-PDF OCR (10 pages) and uploads (20 MB).

1. Do steps 1-2 above (Supabase project with migrations, Groq key). Supabase's free tier also pauses a project after a week without activity; resume it from the dashboard.
2. Push the branch with `render.yaml` to GitHub. In Render: **New > Blueprint**, connect the repo, pick the branch.
3. Render asks for the values marked `sync: false`:
   - `VITE_SUPABASE_URL`, `SUPABASE_URL`: the Supabase project URL (both the same)
   - `VITE_SUPABASE_ANON_KEY`: the anon (publishable) key
   - `GROQ_API_KEY`: your key
   - `APP_URL`: leave empty for the first deploy, then set it to `https://<service>.onrender.com`
4. After the first deploy, add `https://<service>.onrender.com` to Supabase **Authentication > URL Configuration** (Site URL and redirect URLs), and to the Google OAuth client's authorized redirect/origins if you use Google sign-in.
5. Smoke test: `SMOKE_URL=https://<service>.onrender.com npm run smoke`.

Changing a `VITE_` value needs a rebuild (**Manual Deploy > Clear build cache & deploy**), because it is baked into the bundle.

## Health and logs

- `GET /api/health` (no auth) is the liveness probe. The image has a Docker `HEALTHCHECK` on it.
- Logs are JSON lines on stdout: `{"time", "level", "msg", ...}`. Useful messages: `server_started`, `summarize_completed` / `translate_completed` / `question_generated` / `extract_completed` / `export_completed` (with durations, sizes, no content), `unhandled_error`, `uncaught_exception`, `unhandled_rejection` (the process then exits and the platform restarts it).
- **Error monitoring:** alert on `level=error` in the platform's log-based alerting (Cloud Logging: a log-based metric on `jsonPayload.level="error"`). Every error returned to a user carries a `requestId`; a student who reports a problem can quote it and you can find the exact log line.
- Each response has `x-request-id`; it matches the log line for that request.

## Common problems

| Symptom | Likely cause | What to do |
|---|---|---|
| Server exits at start with a readable message | missing or placeholder `GROQ_API_KEY`, no `SUPABASE_URL` in production | fix the variable |
| Every request answers 503 "sign-in is not configured" / cannot verify | `SUPABASE_URL` unset or wrong, or the project's keys cannot be fetched (the cause is logged) | check the URL; check outbound network access |
| Users get 401 after signing in | server `SUPABASE_URL` is a different project from the browser's `VITE_SUPABASE_URL` | make them the same project; rebuild the image if the build arguments were wrong |
| Sign-in page says sign-in is not set up | the image was built without the `VITE_SUPABASE_*` build arguments | rebuild with them |
| "You are going too fast" / 429 | per-user rate limit, or the summarizer is busy (`LLM_MAX_CONCURRENT`) | wait a minute; raise limits only if the plan allows |
| Summaries are slow or "Waiting for the rate limit" | Groq's free tier caps tokens per minute (`LLM_TPM`, default 7,000) | upgrade the Groq plan and raise `LLM_TPM` |
| A long document is refused | it needs more than `SUMMARY_MAX_CHUNKS` sections | use extractive mode, or split the file; raise the limit on a paid plan |
| Scanned PDF fails | OCR model unavailable or over `OCR_MAX_PAGES` | check the log; try again |
| A PDF export shows `?` | it contains characters the built-in PDF fonts lack (for example Japanese) | export Word or text instead |

## Operations

- **Rotate the Groq key:** create a new one, update the secret, deploy a new revision, delete the old key. No client change is needed (the key never reaches the browser; `npm run verify:bundle` checks that).
- **Roll back:** redeploy the previous image. Migrations are additive (`supabase/migrations`); write a new migration to change the schema, never edit an applied one.
- **Change the model:** set `LLM_MODEL` (keep a `gpt-oss` model on Groq's free tier, see `.env.example`); the Settings dialog shows the model in use.
- **Run the benchmark after a model change:** add human-written references to `scripts/eval/gold/` (see its README), run `npm run eval`, commit `src/data/benchmark.json`.
- **Database tests before a schema change:** `npm run test:rls` (needs Docker).
- **Delete a user's data on request:** delete the user in Supabase (Authentication > Users); their rows and files cascade. Confirm in the Storage browser that the `uploads/<user id>/` folder is gone.
- **Backups and retention:** Supabase's schedule for the plan you are on; set log retention in the hosting platform. See `docs/PRIVACY.md`.

## Costs to watch

The only per-use cost is Groq tokens: roughly one call for a short document, one per section plus one for a long one, one per scanned page for OCR, one per translation or question. The per-user limits in `docs/API.md` and `LLM_MAX_CONCURRENT` bound the spend.
