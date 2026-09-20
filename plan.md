# LeaderForge Academic Summarizer — Finalization Plan

> **Status of inputs**
> - Codebase: analysed (see §1).
> - Workflow diagram ("AI-Based Summarization System Workflow", 6 stages): analysed, used as the spec for §2.
> - `PROJECT DOCUMENTATION 2 (3).pdf`: **NOT yet read** (blocked by the read-outside-project setting). §8 lists what must be reconciled against it before Phase 0 closes. Anything in this plan that conflicts with the PDF, the PDF wins.

---

## Progress

| Phase | Status |
|---|---|
| 0 Baseline & housekeeping | Done, except reading the PDF / locking D1-D5 (PDF unreadable from the dev environment; defaults in §3 assumed) |
| 1 Backend foundation | Done |
| 2 Ingestion & preprocessing | Done. Scanned-PDF OCR uses an open-weights vision model (`qwen/qwen3.8-27b`) through LangChain + Groq; verified live on an image-only PDF |
| LLM provider swap | Done: Gemini removed; LangChain (`@langchain/groq`) on Groq is the model layer: Qwen (`qwen/qwen3.8-27b`) for OCR, `openai/gpt-oss-120b` for summarization (Groq caps Qwen at 1,000 output tokens/min, too little for a summarization call) |
| 3 AI summarization core | Done, except the items below. `POST /api/summarize` (JSON or SSE progress) runs the real abstractive/extractive summarizer with map-reduce, structured output, length/language controls and a grounding check; `NewSummaryModal` uses it with live progress and cancel; fake ROUGE constants and the template summary are gone. Verified live on an 11-page PDF (~2 min on the free tier). **Still open:** `POST /api/questions` (the editor's "Generate question" is still a canned 800 ms timer); "BERT/T5/GPT-Academic" labels remain in `SettingsModal`, `ArchitectureModal`, `LandingView` and other views, and `SummarizeJobConfig` is not aligned with the real options; the 100+ page map-reduce exit criterion and Swahili output have not been tried against the live API |
| 4 Persistence, auth, roles | Done, except the items below. Real Supabase Auth (email/password, magic link, Google); `supabase/migrations/20260920000000_init.sql` creates `profiles`, `documents`, `document_sources`, `summaries`, `comments`, `review_progress`, `feedback`, `user_preferences` and the private `uploads` bucket, with owner-only RLS everywhere; `src/lib/repository.ts` + `useDocuments` replace localStorage state; the workspace is gated on a session; the server verifies the Supabase JWT on all `/api` routes but `/health`; the role comes from `profiles.role` (header role toggle removed); comments use the real user; the "cannot delete the last document" rule is gone; a one-time import moves old `leaderforge_summaries` into the account. Verified: lint, build, `verify:bundle`, 391 unit tests, and 50 database tests (`npm run test:rls`: two accounts cannot see or change each other's rows or files). **Still open:** never run against a real Supabase project (Google OAuth redirect, email confirmation, storage upload and the JWKS check need one); no localStorage offline cache; no faculty read access (no share model chosen); `feedback` is stored but not yet wired to the UI (Phase 6) |
| 5-8 | Not started |

---

## 1. Where the project is today

**Bottom line: it is a high-fidelity, frontend-only prototype. Nothing in the 6-stage pipeline actually runs.** The UI (≈6,600 lines of React 19 + Vite 6 + Tailwind 4) is largely complete; every "AI" or "backend" behaviour is simulated.

| Area | What exists | Evidence |
|---|---|---|
| UI shell | Landing, Journal (editor), Dashboard, Programs, Scheduling, Metrics tabs; modals for new summary, architecture, settings, auth, demo | `src/App.tsx`, `src/components/*` |
| Data model | `DocumentSummary` with summary paragraphs, bullets, discussion questions, notes, comments, review progress, `sourceMetadata` | `src/types.ts` |
| Persistence | `localStorage` key `leaderforge_summaries`, seeded from mock docs | `src/App.tsx:27-60`, `src/data/mockDocuments.ts` |
| "Summarization" | `setInterval` steps every 450 ms, then a **hard-coded template doc** is built. Uploaded file content is never read (only `file.name`/`size`); paste text is just sliced to 110/220 chars | `NewSummaryModal.tsx:91-197` |
| Fake metrics | ROUGE 0.91/0.77/0.87, "86%" reduction, "380" words, "1.4s" are constants written into every new doc; Metrics tab shows static 0.892/0.741/0.865 | `NewSummaryModal.tsx:181-191`, `MetricsView.tsx:66-94` |
| Discussion-question "AI" | `setTimeout` 800 ms then one canned question | `MainEditorView.tsx:414-431` |
| Export | Writes a Markdown string into a Blob named `*.pdf` / `*.docx` → **corrupt files** | `App.tsx:136-159` |
| Auth | Fully simulated `SupabaseAcademicClient` in localStorage; no `@supabase/supabase-js`; any email "signs in"; only guards two Landing buttons — `App` opens on `Journal` so the workspace is reachable without auth | `lib/supabaseAuth.ts`, `App.tsx:24` |
| Roles | `userRole` in `App` state is independent of the session's role | `App.tsx:52` |
| Feedback (stage 6) | Form stores to component state and shows "recorded into the fine-tuning dataset" — nothing is recorded | `MetricsView.tsx:21-29,166-169` |
| Backend | None. `express`, `dotenv`, `@google/genai`, `tsx` are in `package.json` but **no server file exists**. Settings modal points at a non-existent Django/Flask API on `:8000` | `package.json`, `SettingsModal.tsx:13,57` |
| Tooling | No lockfile, no `node_modules`, no tests, no README/CI; `package.json` name is `react-example`; `vite` listed twice; `clean` script references a `server.js` that doesn't exist | `package.json` |

**Inconsistencies to resolve, not just build over**
1. **Backend stack conflict.** `metadata.json` + `@google/genai` + `express` say *Node + Gemini*. `SettingsModal`/`ArchitectureModal` say *Django/Flask + BERT/T5*. See Decision D1.
2. **Model labels are fictional.** "BERT-Academic v2.4", "T5-EastAfrica", "GPT-Academic" (in `SummarizeJobConfig`) don't exist as models in this repo.
3. **Compliance claim is unearned.** `MetricsView.tsx:52-53` says "GDPR & FERPA Compliant — No private coursework leaked to public LLMs". Sending documents to a hosted LLM contradicts that unless a data-processing arrangement backs it. Reword or substantiate.
4. **Hard-coded identity / PII.** "Noel Juma Muhemba" is baked into `NewSummaryModal` and `App.handleAddComment`; a real personal email is committed in `DEMO_CAMPUS_ACCOUNTS`.
5. **Type drift.** `SummarizeJobConfig.language` allows French and model allows `GPT-Academic`; the modal offers neither. `SummarizeJobConfig` is not used anywhere.

---

## 2. Target: diagram → implementation map

| Diagram stage | Requirement | Gap today | Delivered in |
|---|---|---|---|
| 1 Input sources | Lecture notes, PDF/DOCX/TXT, library/e-books, web articles, manual upload/paste | Only filename captured; no URL input in UI; "library" = 3 canned presets | Phase 2 |
| 2 Preprocessing | Text extraction (OCR/parser), cleaning, language detection, segmentation | Simulated | Phase 2 |
| 3 AI/NLP | NLP processing, semantic understanding, extractive/abstractive model, summary generation | Done (see Progress for open items) | Phase 3 |
| 4 Output | Structured format, optional translation, dashboard display, PDF/DOCX/TXT export | Display ✅; translation ❌; export produces invalid files | Phases 3, 5 |
| 5 Users | Students, researchers, faculty, staff | Done: roles come from `profiles.role`; faculty is admin-granted | Phase 4 |
| DB & cloud storage | Store uploads, summaries, history & preferences | Done: Supabase Postgres + Storage with RLS (untested against a live project) | Phase 4 |
| 6 Feedback loop | Ratings/comments → analysis → retraining → better summaries | Form discards input | Phase 6 |

---

## 3. Decisions needed up front (blockers for Phase 1)

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D1 | Backend stack: **Node/Express + LangChain with open-weights models (Groq)** vs **Python (Django/Flask/FastAPI) + HF BERT/T5** | **Node/Express + LangChain + open-weights models on Groq** (decided) unless the PDF *requires* self-hosted BERT/T5 | Deps and `metadata.json` already point there; one language; far less infra. Real BERT/T5 fine-tuning needs GPUs and a labelled corpus we don't have. Keep the model behind an interface so a Python service can be swapped in. |
| D2 | Persistence/auth: **real Supabase** vs SQLite + custom auth | **Real Supabase** (Auth + Postgres + Storage) | Code already models Supabase; diagram wants "database & cloud storage"; RLS gives per-user isolation cheaply. |
| D3 | Privacy stance for coursework sent to a hosted LLM | Add consent notice + drop the "no data to public LLMs" claim; use paid API tier (no training on inputs) | Honest and defensible. |
| D4 | What "retraining" means in stage 6 | Phase 6a: collect + analyse feedback, few-shot/prompt tuning from top-rated examples. Phase 6b (optional): fine-tune | Fine-tuning is out of reach without data volume; the loop can still be real. |
| D5 | Deployment target | Single container (Express serves built Vite app) on Cloud Run or similar | `.env.example` already mentions Cloud Run `APP_URL`. |

---

## 4. Phased plan

Size key: **S** ≈ ≤½ day · **M** ≈ 1–2 days · **L** ≈ 3–5 days (rough, one developer).

### Phase 0 — Baseline & housekeeping (S)
- Read the PDF; complete §8 reconciliation; lock D1–D5.
- `npm install`, generate lockfile, run `npm run lint` (`tsc --noEmit`) and `npm run build`; record baseline errors (not yet verified — no `node_modules` present).
- `package.json`: rename package, dedupe `vite`, add scripts (`dev:server`, `dev:client`, `start`, `test`), fix `clean`.
- Add `README.md` (setup, env vars, architecture), CI workflow (lint + build + test).
- Remove committed personal email from `DEMO_CAMPUS_ACCOUNTS`; drop hard-coded author names.

**Exit:** clean install, lint + build green on `main`, README present.

### Phase 1 — Backend foundation (M)
- Create `server/` (Express + TS via `tsx`): `index.ts`, `routes/{extract,summarize,documents,feedback,export}.ts`, `lib/{env,logger,errors}.ts`.
- Config via `dotenv` + schema validation (fail fast if `GROQ_API_KEY` missing). **Key stays server-side only**; verify it never appears in the Vite bundle.
- Vite dev proxy `/api → :3001`; production: Express serves `dist/`.
- Middleware: `zod` request validation, per-user rate limiting, body/upload size limits, structured error responses, request IDs.
- Wire `SettingsModal` to a real `GET /api/health` + configurable base URL (default `/api`) instead of the fake `:8000` text.
- Client `src/lib/api.ts`: typed fetch wrapper (shared types in `src/types.ts`).

**Exit:** `GET /api/health` reachable from the UI; no secrets in client bundle.

### Phase 2 — Ingestion & preprocessing (L) — diagram stages 1–2
Server pipeline `server/pipeline/`:
1. **Extract** (`extract.ts`): PDF → `pdfjs-dist`/`pdf-parse`; DOCX → `mammoth`; TXT/MD direct; **scanned PDF fallback** → OCR (implemented with a vision-capable open-weights model via LangChain instead of `tesseract.js`). Detect "no text layer" → OCR.
2. **URL ingest**: fetch + readability extraction. **Must include SSRF protection** (block private/loopback/link-local ranges, redirects re-validated, size/time caps, allow http/https only).
3. **Clean** (`clean.ts`): strip headers/footers/page numbers, de-hyphenate, normalise whitespace/unicode, drop references section (configurable).
4. **Language detect** (`franc`-style) → feeds prompt + validates the user's language choice; flag Swahili/English/mixed.
5. **Segment** (`segment.ts`): sentence/paragraph split; chunker with overlap for long docs (token-budgeted).
- Return `{ text, wordCount, language, segments, warnings }`.

Client (`NewSummaryModal.tsx`):
- Actually read the file (send multipart to `/api/extract`); show real filename/size/word count.
- Add **URL** input tab (type `'url'` already exists in `SummarizeJobConfig`); rename "University Samples" clearly as samples.
- Validate: accepted types, 50 MB cap (the UI already promises it), empty-text and unsupported-file errors.

**Exit:** PDF, DOCX, TXT, URL and pasted text each return clean text with correct word count; a scanned PDF fixture goes through OCR; SSRF test cases blocked.

### Phase 3 — AI summarization core (L) — diagram stage 3
- `server/ai/model.ts`: LangChain `BaseChatModel` factory (`ChatGroq`, open-weights Qwen), so the provider can change without touching routes.
- **Structured output**: request JSON matching the fields the UI already renders — `contentParagraphs`, `bulletPoints{title,text}`, `discussionQuestions{question,context}`, `excerpt`, `tags`, `emotionalTone`, `promptQuestion`. Validate with `zod`; retry once on schema failure.
- Controls actually honoured: **abstractive vs extractive** (extractive = sentence-selection prompt or TextRank pre-pass so output quotes the source), **length** (concise/balanced/detailed → word budgets), **language** (English/Swahili), discipline/category.
- **Long documents:** map-reduce over Phase 2 chunks (summarise chunks → merge), with token guard.
- **Real progress:** `POST /api/summarize` streams SSE stage events; replace the fake `setInterval` stepper in `NewSummaryModal` with the real stages (extract → clean → detect → segment → summarise → format) and real error/cancel handling.
- **Real metadata:** compute `originalWordCount`, `summaryWordCount`, `reductionRate`, `processingTime`, `modelUsed` from the run. **Delete the hard-coded ROUGE constants.**
- Replace `handleGenerateQuestionAI` with `POST /api/questions` (uses the doc's summary + source).
- Rename model options to what they are (e.g. "Qwen 3.8 27B (Groq) — Abstractive", "Extractive (TextRank)") across `NewSummaryModal`, `SettingsModal`, `ArchitectureModal`, `LandingView` demo labels; align `SummarizeJobConfig` with the actual options.
- **Grounding guardrail:** instruct model to use only the source; add a lightweight check that key numbers/named entities in the summary appear in the source, and surface a warning if not.

**Exit:** uploading a real lecture PDF produces a sensible structured summary in ≤ target latency; extractive output is verifiably quoted from source; a 100+ page doc succeeds via map-reduce.

### Phase 4 — Persistence, auth, roles (L) — diagram "Database & cloud storage" + stage 5
- Add `@supabase/supabase-js`; replace `supabaseAuth.ts` simulation with the real client (email/password + Google OAuth per the existing modal).
- Schema (SQL migrations checked into `supabase/migrations/`): `profiles(id, full_name, role, institution, student_id)`, `documents`, `summaries` (JSONB for structured body), `comments`, `feedback`, `review_progress`, `user_preferences`. **Row Level Security** on every table (owner-only; faculty read access to shared docs only if a share model is chosen).
- Storage bucket for original uploads with per-user paths.
- **Data layer** `src/lib/repository.ts`; swap `App.tsx` localStorage state for it. One-time **migration** of existing `leaderforge_summaries` to the user's account. Keep a small localStorage cache only as an offline convenience.
- **Gate the workspace:** unauthenticated users land on `Landing`; `Journal/Dashboard/…` require a session. Server verifies the Supabase JWT on all `/api/*` (except health).
- **Roles:** derive `userRole` from `profiles.role`, remove the independent `App` state and the header role toggle (or make it admin-only); comment author = real user name/avatar.
- Fix `onDeleteDocument` "cannot delete the last document" rule (an artefact of the mock data).

**Exit:** two accounts cannot see each other's documents (RLS test); refresh/logout/login preserves history; workspace inaccessible when signed out.

### Phase 5 — Output & presentation (M) — diagram stage 4
- **Real exports** (`server/export/`): TXT/MD (existing content builder), **DOCX** via `docx`, **PDF** via `pdfkit`/`pdf-lib` — proper title, metadata, headings, bullets, discussion questions, user notes. Endpoint `GET /api/documents/:id/export?format=`. Remove the mislabelled Blob download in `App.handleExport`.
- **Translation:** `POST /api/translate` (English ↔ Swahili, optionally French) surfaced as a control in `MainEditorView`; store translated variants on the summary.
- Verify Dashboard/Programs/Scheduling derive from real documents (they currently take the `documents` array; confirm no reliance on mock-only fields like `extraCount`, `dateBadge`, `timeAgoGroup` — compute these from timestamps instead of storing display strings).
- Empty, loading and error states for all views (first-run user has zero documents).

**Exit:** each export opens correctly in Word / a PDF reader / a text editor; translation round-trips a summary.

### Phase 6 — Feedback & continuous improvement (M) — diagram stage 6
- 6a **Collect:** thumbs/1–5 rating + comment on every summary (in the editor, not only the Metrics tab); persist to `feedback` with `document_id`, `model`, `params`, `role`. Wire `MetricsView.handleSubmitFeedback` to the API.
- 6a **Analyse:** `MetricsView` reads real aggregates — average rating by model/length/language/role, feedback volume, compression ratios, latency. Replace every static number with data or remove it.
- **Real quality metric:** offline eval script `scripts/eval/` that runs a small gold set (10–20 human reference summaries) and computes ROUGE-1/2/L; publish the results in the README/Metrics tab labelled *"benchmark on N reference documents"*, never per-document.
- 6a **Improve:** feed top-rated (with consent) summaries as few-shot exemplars per discipline/language; track before/after ratings.
- 6b *(optional, post-launch)*: export a fine-tuning dataset from consented feedback; evaluate fine-tuning only if volume justifies it. Reword the UI text that currently claims feedback "directly tunes the model checkpoint".

**Exit:** submitting feedback creates a DB row; Metrics tab numbers change when feedback/documents change; eval script reproducible.

### Phase 7 — Quality, security, release (M)
- **Tests:** `vitest` — unit (clean/segment/chunk, prompt builders, zod schemas, repository), API integration (extract→summarize with a mocked provider), SSRF and upload-abuse cases, RLS policy tests. One Playwright smoke: sign in → upload → summary → export.
- **Security review:** upload MIME sniffing, size/page limits, prompt-injection handling for untrusted document text (delimit source, ignore embedded instructions, never let output trigger actions), rate limits, CORS, secrets scan, dependency audit.
- **Accessibility & responsiveness** pass on the modals and editor; keyboard focus traps for modals (none today).
- **Performance:** code-split `LandingView` (1,163 lines) and `MainEditorView` (1,210 lines); lazy-load tabs; avoid re-rendering the whole doc list on each edit.
- Dockerfile + deploy config (D5), `.env.example` updated (Supabase URL/anon key, service key, `GROQ_API_KEY`, `APP_URL`), health check, basic logging/error monitoring.
- Truthfulness sweep of all marketing/UI copy (compliance claims, "fine-tuned", ROUGE targets, user-count style stats on Landing).

**Exit:** CI green; security checklist signed off; deployed staging URL passes the smoke test.

### Phase 8 — Documentation & handover (S)
- Update `ArchitectureModal` to describe the *real* pipeline; final README, API reference, runbook, data-retention/privacy notice, demo script + sample documents for the university presentation.

---

## 5. Dependency order

```
P0 ─► P1 ─► P2 ─► P3 ─┬─► P5 ─┐
            │        │       ├─► P7 ─► P8
            └─► P4 ──┴─► P6 ─┘
```
P4 (auth/DB) can run in parallel with P2–P3 once P1 is done; P3's SSE route and P4's JWT check meet at the end of Phase 4. **Shortest path to a demoable product:** P0 → P1 → P2 → P3 (real summaries, still localStorage), then P4/P5/P6.

---

## 6. Key files to touch

| File | Change |
|---|---|
| `src/components/NewSummaryModal.tsx` | Real upload/URL/paste → API; SSE progress; remove templated doc + fake metrics |
| `src/App.tsx` | Repository instead of localStorage; real export; auth gate; drop `userRole` state |
| `src/lib/supabaseAuth.ts` | Replace with real Supabase client |
| `src/components/MainEditorView.tsx` | Real question generation, translation control, in-editor rating |
| `src/components/MetricsView.tsx` | Real aggregates + feedback submit; remove static ROUGE & compliance claim |
| `src/components/SettingsModal.tsx` | Real API base/health; real model options |
| `src/types.ts` | Align `SummarizeJobConfig`; add timestamps, feedback, translation types |
| `package.json`, `vite.config.ts`, `.env.example` | Scripts, proxy, new env vars |
| **New:** `server/**`, `supabase/migrations/**`, `scripts/eval/**`, `README.md`, CI, Dockerfile | Backend, DB, eval, docs |

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Hallucinated / ungrounded summaries in an academic setting | Source-only prompting, grounding check, visible "verify against source" affordance (split view already exists) |
| Student documents sent to a third-party LLM | D3 consent + paid tier + data-retention policy; don't log document text |
| Prompt injection via uploaded docs/URLs | Delimit + sanitise; structured output only; no tool access |
| SSRF via URL ingestion | Allow-list schemes, resolve-and-block private IPs, cap size/time |
| Scanned/low-quality PDFs and Swahili OCR accuracy | OCR fallback + warnings; test with real scans |
| LLM cost/latency on large docs | Map-reduce, caching by content hash, rate limits, per-user quotas |
| Scope creep into model training | Fix scope via D4; treat 6b as post-launch |
| Existing UI copy over-claims | Truthfulness sweep in Phase 7 |

---

## 8. Reconcile with `PROJECT DOCUMENTATION 2 (3).pdf` (pending)

Once the PDF is readable, check and update this plan for:
- [ ] Mandated tech stack / models (does it require BERT/T5, Python, Django/Flask?) → D1
- [ ] Functional requirements list — any feature not in §2 (e.g. citation extraction, keyword extraction, multi-document summary, admin panel)
- [ ] Non-functional targets (latency, accuracy/ROUGE thresholds, supported file sizes, concurrent users)
- [ ] Evaluation methodology & success criteria the university will grade against → Phase 6 eval
- [ ] Privacy/ethics/compliance requirements → D3
- [ ] Deliverables & deadlines (report, demo, source, deployment) → Phase 8 and ordering
- [ ] Scope exclusions (things we can safely skip)

---

## 9. Definition of done

1. A user signs in, uploads a PDF/DOCX/TXT (or pastes text / gives a URL), and receives a **real, source-grounded structured summary** in English or Swahili, with extractive/abstractive and length options honoured.
2. Summaries, uploads, comments, notes and review progress **persist per user** and are isolated by RLS.
3. Export to **PDF, DOCX, TXT/MD** produces valid files; translation works.
4. Feedback is **stored and reflected** in the Metrics tab; no fabricated or hard-coded metrics remain; ROUGE is reported only from the offline benchmark.
5. Lint, build, tests, and CI pass; security checklist complete; deployed and demoable; README and architecture docs describe what is actually built.
