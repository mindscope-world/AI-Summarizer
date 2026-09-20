# Demo script (about 10 minutes)

For the university presentation. Everything below is what the app really does; nothing is staged. The three files in `docs/samples/` are short original texts written for demos (they are not extracts from published papers).

## Before you start

- A deployed or local instance (`npm run dev`, http://localhost:3000) with Supabase and Groq configured.
- Two accounts: a **student** and a **faculty** one (set with the SQL in `docs/RUNBOOK.md`, step 5). Create both in advance; sign-up with email needs a confirmation click.
- Free-tier Groq is rate limited: run the two summaries you will show once beforehand, so the audience sees them already saved if a live one is slow. A short text takes about a minute on the free tier.
- Optional: scan a printed page to a PDF to show the OCR path.

## Script

1. **Landing page (30 s).** Point out what it says it does, and that the "Examples" block is hand-written, not live. Open *How privacy works*.
2. **Sign in as the student (30 s).** The workspace is unreachable while signed out. Note the role (student) in the profile menu.
3. **Ingest (2 min).** New summary → *Upload*: `docs/samples/monetary-policy.txt`. Show what the server extracted (word count, language English) before summarising. Then *Paste text* with `docs/samples/kiswahili-mfano.txt` and show the detected language is Kiswahili. Mention the notice that text goes to Groq.
4. **Summarise (2 min).** Category Economics, abstractive, balanced, English. Watch the real progress stages. Open the result: paragraphs, key points, discussion questions. Switch to *Side-by-Side* and check a claim against the source. Point at the warnings box if the model produced a figure that is not in the source (it flags it; do not promise it never happens). Repeat quickly in *Extractive* mode to show the sentences are quotes from the source.
5. **Study tools (1.5 min).** Generate another question (a real model call, different from the existing ones). Translate to Kiswahili and switch the language; export the Kiswahili summary as Word and open it. Show the Scheduling view: review days 1, 3, 7 and 30, and *Mark reviewed*.
6. **Feedback (1 min).** Rate the summary 4 stars with a comment and tick *use as an example*. Open the Metrics tab: your average and rating counts, by model/mode/length. Note that ROUGE appears only as an offline benchmark (or "no benchmark has been run yet" if none has been).
7. **Style examples (1 min).** Make a second Economics summary. The Metrics tab (or the summary's metadata) records that one example was used. Say honestly that with few ratings the difference in ratings is noise.
8. **Faculty view (1 min).** Sign out, sign in as faculty. Metrics shows *Across all users*: averages only, groups under 3 hidden. Show that faculty cannot open the student's documents (they are not in the list). This is Row Level Security, and `npm run test:rls` is the proof.
9. **Close (30 s).** Show `docs/PRIVACY.md`: what is stored, what leaves the system (the text goes to Groq), and that the model is not retrained.

## Questions to expect

- *Is it fine-tuned or trained on our data?* No. It uses an open-weights model as is. Rated examples are only shown to the same student's later prompts.
- *How accurate is it?* Say what the benchmark says, with its N, or that it has not been run. Individual summaries can be wrong: the app flags figures not in the source, and the source view is there to verify.
- *Does it work offline / on our own servers?* Not offline. The model is open-weights, but it is hosted by Groq; running it on university hardware would be a change to `server/ai/model.ts` only.
- *Who can see my documents?* Only you. Administrators of the database can technically; faculty see averages only.
