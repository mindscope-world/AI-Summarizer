#!/usr/bin/env node
/**
 * Smoke test for a running deployment: does it start, serve the app, gate the API, and build real files?
 *
 *   node scripts/smoke.mjs                       # http://127.0.0.1:3001
 *   SMOKE_URL=https://my-app.example node scripts/smoke.mjs
 *
 * SMOKE_TOKEN     a Supabase access token for a test account. Without it, the API checks that need sign-in
 *                 are skipped (and, if the server requires sign-in, the script checks that it says 401).
 * SMOKE_SUMMARIZE=1  also runs one real summarization (uses the model, so it costs tokens and takes a while).
 */
const base = (process.env.SMOKE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3001}`).replace(/\/$/, '');
const token = process.env.SMOKE_TOKEN;
const headers = {'content-type': 'application/json', ...(token ? {authorization: `Bearer ${token}`} : {})};

const results = [];
async function check(name, fn) {
  try {
    const note = await fn();
    results.push({name, ok: true, note});
    console.log(`ok    ${name}${note ? `  (${note})` : ''}`);
  } catch (err) {
    results.push({name, ok: false, note: err.message});
    console.log(`FAIL  ${name}: ${err.message}`);
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const health = await fetch(`${base}/api/health`).then((r) => r.json().then((body) => ({status: r.status, body}))).catch(() => null);
await check('server answers /api/health', () => {
  expect(health, `cannot reach ${base}`);
  expect(health.status === 200 && health.body.status === 'ok', `unexpected health response ${JSON.stringify(health?.body)}`);
  expect(!/gsk_|sk-|secret|service_role/i.test(JSON.stringify(health.body)), 'health leaks configuration');
  return `${health.body.environment}, v${health.body.version}`;
});
if (!health) process.exit(1);

await check('serves the web app with a Content-Security-Policy', async () => {
  const res = await fetch(`${base}/`);
  const csp = res.headers.get('content-security-policy');
  if (health.body.environment !== 'production') return 'skipped: only the production server serves the built app';
  expect(res.status === 200 && (res.headers.get('content-type') ?? '').includes('text/html'), `GET / -> ${res.status}`);
  expect(csp && csp.includes("script-src 'self'"), 'no CSP on the app page');
  expect(res.headers.get('x-frame-options') === 'DENY', 'no X-Frame-Options');
  return 'CSP present';
});

const authRequired = (await fetch(`${base}/api/extract`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({text: 'hello world'})})).status === 401;
await check('the API is closed to signed-out requests (or auth is off)', () => (authRequired ? 'returns 401 without a token' : 'auth is off on this server'));

const canCall = token || !authRequired;
const SAMPLE = 'Consensus protocols let independent nodes agree on one value even when some of them fail. Paxos and Raft achieve this with quorum voting and leader election. A log replicated across a majority of nodes survives the loss of a minority.';

if (!canCall) {
  console.log('skip  API checks that need sign-in (set SMOKE_TOKEN to run them)');
} else {
  await check('extracts pasted text', async () => {
    const res = await fetch(`${base}/api/extract`, {method: 'POST', headers, body: JSON.stringify({text: SAMPLE})});
    const body = await res.json();
    expect(res.status === 200, `status ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
    expect(body.wordCount > 20 && body.language?.code === 'en', 'wrong word count or language');
    return `${body.wordCount} words`;
  });

  const doc = {
    title: 'Smoke Test Summary',
    contentParagraphs: ['Consensus protocols let nodes agree even when some fail.'],
    bulletPoints: [{title: 'Quorums.', text: 'A majority vote keeps replicas consistent.'}],
    discussionQuestions: [{question: 'Why does a majority matter?', context: 'Think about partitions.'}],
  };
  const formats = {
    pdf: (b) => b.subarray(0, 5).toString() === '%PDF-',
    docx: (b) => b[0] === 0x50 && b[1] === 0x4b,
    txt: (b) => b.toString('utf8').includes('Smoke Test Summary'),
    md: (b) => b.toString('utf8').startsWith('#'),
  };
  for (const [format, valid] of Object.entries(formats)) {
    await check(`exports a real ${format.toUpperCase()} file`, async () => {
      const res = await fetch(`${base}/api/export`, {method: 'POST', headers, body: JSON.stringify({format, document: doc})});
      expect(res.status === 200, `status ${res.status}`);
      expect((res.headers.get('content-disposition') ?? '').includes(`.${format}`), 'no download filename');
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.length > 100 && valid(bytes), `the ${format} file has the wrong content`);
      return `${bytes.length} bytes`;
    });
  }

  if (process.env.SMOKE_SUMMARIZE === '1') {
    await check('summarizes a document with the real model', async () => {
      const res = await fetch(`${base}/api/summarize`, {method: 'POST', headers, body: JSON.stringify({text: SAMPLE.repeat(4), category: 'Computer Science', length: 'concise'})});
      const body = await res.json();
      expect(res.status === 200, `status ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
      expect(body.contentParagraphs?.length && body.bulletPoints?.length && body.discussionQuestions?.length, 'incomplete summary');
      return `${body.metadata.model}, ${body.metadata.processingSeconds}s`;
    });
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
