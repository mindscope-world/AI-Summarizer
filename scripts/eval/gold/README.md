# Gold set for the offline benchmark

The Metrics tab reports ROUGE scores from **one place only**: `npm run eval`, which summarises the
documents in this folder with the real summarizer and compares each result with a summary a person wrote.

Nothing here is invented for you. To publish numbers, add real documents with human-written references.
The plan is 10 to 20 documents; the Metrics tab shows however many you provide ("benchmark on N reference documents").

## Format

One `.json` file per document, or one file holding an array of them:

```json
{
  "id": "econ-monetary-policy-01",
  "title": "Monetary policy transmission in developing economies",
  "category": "Economics",
  "source": "The full text of the reading (a few hundred words or more)...",
  "reference": "A summary of that text written by a lecturer or a student, not by a model.",
  "author": "Lecturer, Economics"
}
```

- Use readings you are allowed to keep in the repository (your own notes, open-access texts, public-domain works).
- Write the reference yourself or ask a person to. A reference produced by a language model would measure the model against itself.
- `id` must be unique.

## Running it

```bash
npm run eval                                   # abstractive, balanced
npm run eval -- --mode extractive --length concise
```

It needs `GROQ_API_KEY` (a real run, on the free tier, takes about a minute per document). It writes
`src/data/benchmark.json`, which the Metrics tab reads, and `scripts/eval/results/latest.json` with the
per-document scores for your own analysis (that folder is git-ignored).

Commit `src/data/benchmark.json` when you want the new numbers to ship with the app.
