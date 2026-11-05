# Data and privacy notice

What the system does with student data, in plain terms. Keep this true: if the code changes what happens to data, change this file. (A university should have its data-protection officer review it before launch; this is a description, not legal advice.)

## What is stored, and who can see it

| Data | Where | Who can read it |
|---|---|---|
| Account (name, email, institution, student number, role) | Supabase Auth and `profiles` | the person; the administrator |
| Summaries, notes, comments, review progress | Supabase Postgres | **only the person who made them** |
| Extracted text of each document | Supabase Postgres (`document_sources`) | only that person |
| The original uploaded file | Supabase Storage, private folder per user | only that person |
| Ratings and comments on summaries | Supabase Postgres (`feedback`) | only that person; faculty see **averages** across users, never rows or comments, and never a group of fewer than 3 |

Row Level Security in the database enforces this. Two accounts cannot see each other's data, and this is tested (`npm run test:rls`). Administrators with database access (the Supabase project owners) can technically read everything.

## What leaves the system

To write, translate or extract text from a scanned page, **the document's text (or page images) is sent to Groq**, a third-party AI provider, which runs open-weights models. This is the main privacy trade-off, and the app says so where students start a summary. Consequences:

- Do not summarise material you may not share with a third party (for example unpublished, confidential or exam material).
- The project should use a Groq plan whose terms say inputs are not used for training, and should link the provider's data-processing terms here.
- The server keeps nothing: text is processed in memory, never written to disk, and logs hold metadata only (sizes, timings, format, status), never text, titles, file names or URLs.

Nothing is sent to any other service. Fonts are loaded from Google Fonts by the browser.

## Ratings and "use as an example"

Rating a summary is optional. If a student ticks "use this summary as an example", then, when they rate it 4 or 5, a short part of that summary (not its source text) may be shown to the AI, as a style guide, the next time **the same student** summarises something in the same subject. It is never shown to other students. Unticking, or deleting the summary, ends this. The AI is **not retrained** on student data.

If the university later wants to export consented ratings to evaluate or fine-tune a model, that is a new use: it needs a new, explicit consent text and a review, and is not implemented.

## Retention and deletion

- A student can delete a summary at any time in the app; this removes its text, translations, notes, comments, review progress and the stored original. Their ratings remain but are detached from the deleted summary (so averages stay honest); they can be deleted with the account.
- Deleting an account in Supabase removes all of that person's rows and files (`on delete cascade`).
- Logs: the hosting platform's request and error logs contain metadata only. Set their retention (for example 30 days) in the platform.
- Backups: follow the Supabase plan's backup schedule; deleted data can persist in backups until they expire.

## Legal status

Nothing in this app claims GDPR, FERPA or any other certification. Whether the university's use complies with the law that applies to it (for example the data-protection law of the country it operates in) is for the university to decide with its data-protection officer.
