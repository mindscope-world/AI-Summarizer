# API reference

Base path `/api` (same origin as the web app). Types are in `src/types.ts`, shared with the browser client `src/lib/api.ts`.

## Conventions

- **Auth.** Every route except `GET /api/health` needs `Authorization: Bearer <Supabase access token>` of a signed-in user (the public anon key is refused). Missing or invalid token: `401 unauthorized`. Where auth is not set up: `503 service_unavailable`. `AUTH_MODE=off` disables the check for local experiments and is refused in production.
- **Bodies.** JSON, up to `JSON_BODY_LIMIT` (default 2 MB). File uploads are `multipart/form-data`, up to `MAX_UPLOAD_MB` (default 50).
- **Errors.** One shape everywhere; `requestId` equals the `x-request-id` response header and the log line.

  ```json
  {"error": {"code": "validation_failed", "message": "Request validation failed.", "requestId": "…", "details": [{"path": "body.text", "message": "…"}]}}
  ```

  | code | status | meaning |
  |---|---|---|
  | `bad_request` | 400 | malformed request |
  | `validation_failed` | 400 | a field is missing or out of range (`details` lists them) |
  | `unauthorized` | 401 | no or invalid sign-in token |
  | `forbidden` | 403 | signed in but not allowed |
  | `not_found` | 404 | no such route |
  | `payload_too_large` | 413 | body or upload over the limit |
  | `unsupported_media_type` | 415 | file type not supported, or its content does not match its name |
  | `unprocessable` | 422 | the content cannot be processed (corrupt, no text, too long) |
  | `rate_limited` | 429 | too many requests, or the summarizer is busy |
  | `upstream_error` | 502 | the AI service or a fetched URL failed |
  | `service_unavailable` | 503 | sign-in verification is not configured or its keys cannot be fetched |
  | `internal_error` | 500 | a bug; the log line has the details |

- **Rate limits** (per signed-in user, per minute): all routes `RATE_LIMIT_PER_MINUTE` (60); `extract` and `export` `EXTRACT_RATE_LIMIT_PER_MINUTE` (20); `summarize`, `translate` and `questions` `SUMMARIZE_RATE_LIMIT_PER_MINUTE` (6). Only `LLM_MAX_CONCURRENT` (2) summarizations run at once. Limit headers follow the IETF draft (`RateLimit`, `RateLimit-Policy`, `Retry-After`).
- **Logging.** Requests are logged with metadata only, never document text, titles, file names, URLs or summaries.

---

## `GET /api/health`

No auth. Uptime probe and the Settings "Test connection".

```json
{"status": "ok", "service": "leaderforge-academic-summarizer", "version": "0.1.0", "environment": "production",
 "uptimeSeconds": 812, "timestamp": "…", "ai": {"provider": "groq", "model": "openai/gpt-oss-120b", "ocrModel": "qwen/qwen3.8-27b"}}
```

## `POST /api/extract`

Turns one input into clean text. Send **exactly one** of: multipart field `file`, JSON `url`, JSON `text`. Optional `stripReferences` (boolean) drops a trailing bibliography.

Returns an `ExtractionResult`: `text`, `wordCount`, `charCount`, `source` (`kind`, `format`, `fileName`/`url`, `title`, `author`, `pageCount`, `ocrUsed`), `language` (`code` `en|sw|fr|other|und`, `confidence`, `mixed`), `stats` (`paragraphs`, `sentences`, `chunks`), `chunks` (offsets into `text`) and `warnings`.

- Accepted: `.pdf`, `.docx`, `.txt`, `.md`; `http(s)` URLs (private, loopback and link-local addresses are refused, redirects are re-checked, time and size are capped); pasted text.
- The real format is read from the bytes and must match the extension. DOCX archives that declare more than 250 MB uncompressed or more than 5,000 parts are refused (`422`) before anything is opened.
- A PDF with no text layer is read with the OCR model (up to `OCR_MAX_PAGES`, default 20); the result says so in `warnings` and `source.ocrUsed`.

## `POST /api/summarize`

```json
{"text": "…", "category": "Computer Science", "title": "optional", "courseCode": "optional",
 "summarizationType": "abstractive", "length": "balanced", "language": "English",
 "sourceLanguage": "en", "examples": [{"title": "…", "text": "…"}]}
```

| field | values | default |
|---|---|---|
| `summarizationType` | `abstractive` (a model writes it) / `extractive` (TextRank picks sentences quoted from the source) | `abstractive` |
| `length` | `concise` / `balanced` / `detailed` | `balanced` |
| `language` | `English` / `Swahili` | `English` |
| `examples` | up to 2 earlier summaries the student rated highly, as **style references** (each `text` at most 2,000 characters). Shown to the model inside delimiters, with an instruction never to copy their facts. Ignored in extractive mode | `[]` |

Send `Accept: text/event-stream` to get progress; otherwise the response is one JSON document. The stream is Server-Sent Events, each `data:` line a `SummarizeEvent`:

```
data: {"type":"progress","stage":"sections","message":"Reading section 2 of 5","percent":24,"current":1,"total":5}
data: {"type":"result","result":{ …SummaryResult… }}      (or {"type":"error","error":{…}})
```

`SummaryResult`: `title`, `contentParagraphs[]`, `bulletPoints[{title,text}]`, `discussionQuestions[{question,context}]`, `promptQuestion`, `emotionalTone`, `tags[]`, `excerpt`, `warnings[]` (figures or names not found in the source; degraded features) and `metadata` (`model`, `mode`, `length`, `language`, `originalWordCount`, `summaryWordCount`, `reductionRate`, `sections`, `processingSeconds`, `examplesUsed`).

Long documents are read in sections and merged (limit `SUMMARY_MAX_CHUNKS`, default 10; extractive mode has no limit). Closing the connection cancels the model calls.

## `POST /api/translate`

Translates a structured summary between English and Swahili, item for item.

```json
{"targetLanguage": "Swahili", "sourceLanguage": "English", "contentParagraphs": ["…"],
 "bulletPoints": [{"title": "…", "text": "…"}], "discussionQuestions": [{"question": "…", "context": "…"}], "promptQuestion": "…"}
```

Returns the same lists translated plus `language`, `model` and `warnings`. The lists have the same lengths as the request (the model is asked once more if they do not). A warning is added when a figure appears that is not in the original. At most 20,000 characters in total (`413` above that).

## `POST /api/questions`

One new revision question for a summary, different from the ones it has.

```json
{"title": "…", "language": "English", "contentParagraphs": ["…"], "bulletPoints": [{"title": "…", "text": "…"}], "existingQuestions": ["…"]}
```

Returns `{"question": "…", "context": "…"}`. A repeat of an existing question is rejected and retried once; if it still repeats, `502`.

## `POST /api/export`

```json
{"format": "pdf", "document": {"title": "…", "language": "English", "contentParagraphs": ["…"], "bulletPoints": [{"title": "…", "text": "…"}], "discussionQuestions": [{"question": "…", "context": "…"}], "userNotes": "…"}}
```

`format` is `pdf`, `docx`, `txt` or `md`. The response is the file (`Content-Disposition: attachment`). The document comes in the request, so unsaved edits and translations export as shown; nothing is stored. PDF text is Western-alphabet only: other characters become `?` and the response has an `X-Export-Warning` header (URL-encoded).

---

## Not on this server

Documents, summaries, notes, comments, review progress, ratings and uploaded files are stored in Supabase and are read and written by the browser directly, protected by Row Level Security (see `docs/ARCHITECTURE.md`). There is no `/api/documents` or `/api/feedback`. Faculty read averaged ratings through the database function `feedback_aggregates()`.
