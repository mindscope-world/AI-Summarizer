import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {SignJWT} from 'jose';
import {Client} from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {createRepository, upgradeLegacy, type DocumentRepository} from '../../src/lib/repository';
import type {DocumentSummary} from '../../src/types';

/**
 * The app's data layer against a real Postgres (with the migrations applied) behind PostgREST,
 * the same REST layer Supabase uses, with the real supabase-js client. Runs only through
 * `npm run test:rls`, which starts the containers and sets these variables.
 */
const dbUrl = process.env.REPO_DATABASE_URL;
const restUrl = process.env.POSTGREST_URL;
const jwtSecret = process.env.POSTGREST_JWT_SECRET;

describe.skipIf(!dbUrl || !restUrl || !jwtSecret)('repository against Postgres + PostgREST', () => {
  let admin: Client;
  let proxy: http.Server;
  let proxyUrl: string;
  /** Every request the client sent, so tests can check that only necessary writes happen. */
  let requests: {method: string; path: string}[] = [];

  /** Supabase serves PostgREST under /rest/v1; forward that to the bare PostgREST. */
  async function startProxy() {
    proxy = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const url = new URL(req.url ?? '/', 'http://x');
      if (!url.pathname.startsWith('/rest/v1/')) {
        res.writeHead(404, {'content-type': 'application/json'}).end(JSON.stringify({message: 'not available in this test'}));
        return;
      }
      const path = url.pathname.slice('/rest/v1'.length);
      requests.push({method: req.method ?? 'GET', path});
      const headers = {...req.headers} as Record<string, string>;
      delete headers.host;
      delete headers['content-length'];
      const upstream = await fetch(`${restUrl}${path}${url.search}`, {
        method: req.method,
        headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
      });
      const body = Buffer.from(await upstream.arrayBuffer());
      const out: Record<string, string> = {};
      upstream.headers.forEach((v, k) => {
        if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(k)) out[k] = v;
      });
      res.writeHead(upstream.status, out).end(body);
    });
    await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
    proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  }

  async function signedInClient(userId: string): Promise<SupabaseClient> {
    const jwt = await new SignJWT({role: 'authenticated'})
      .setProtectedHeader({alg: 'HS256'})
      .setSubject(userId)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(jwtSecret));
    return createClient(proxyUrl, 'anon-key-not-checked-by-postgrest', {
      global: {headers: {Authorization: `Bearer ${jwt}`}},
      auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
    });
  }

  const newUser = async (email: string) => {
    const {rows} = await admin.query(`insert into auth.users (email, raw_user_meta_data) values ($1, '{}') returning id`, [email]);
    return rows[0].id as string;
  };
  const repoFor = async (userId: string, name: string): Promise<DocumentRepository> =>
    createRepository(await signedInClient(userId), userId, {fullName: name, avatarUrl: ''});

  let aliceId: string;
  let bobId: string;
  let alice: DocumentRepository;
  let bob: DocumentRepository;

  const uuid = () => crypto.randomUUID();
  const makeDoc = (over: Partial<DocumentSummary> = {}): DocumentSummary => ({
    id: uuid(),
    title: 'Consensus Protocols',
    dateBadge: 'Today',
    timeAgoGroup: 'Last 7 days',
    category: 'Computer Science',
    categoryColor: 'blue',
    tags: ['Consensus', 'Raft'],
    excerpt: 'Nodes agree on one value.',
    createdDate: 'ignored: derived from createdAt',
    emotionalTone: 'Analytical & Rigorous',
    promptQuestion: 'How do quorums keep replicas consistent?',
    contentParagraphs: ['Nodes agree using quorums.', 'Raft elects a leader.'],
    bulletPoints: [
      {title: 'Quorums.', text: 'A majority vote.'},
      {title: 'Leaders.', text: 'One leader orders writes.', reviewed: true},
    ],
    discussionQuestions: [{id: uuid(), question: 'Why a majority?', context: 'Partitions.'}],
    currentDiscussionIndex: 0,
    userNotes: '',
    comments: [],
    sourceText: 'The full extracted source text of the document.',
    sourceMetadata: {fileName: 'notes.pdf', fileType: 'PDF', originalWordCount: 1234, summaryWordCount: 61, reductionRate: '95%', modelUsed: 'openai/gpt-oss-120b', language: 'English'},
    summaryWarnings: ['Check the figure 34%.'],
    ...over,
  });
  const writes = () => requests.filter((r) => r.method !== 'GET').map((r) => `${r.method} ${r.path}`);

  beforeAll(async () => {
    admin = new Client({connectionString: dbUrl});
    await admin.connect();
    await startProxy();
    aliceId = await newUser('alice@example.edu');
    bobId = await newUser('bob@example.edu');
    alice = await repoFor(aliceId, 'Alice');
    bob = await repoFor(bobId, 'Bob');
  }, 60_000);

  afterAll(async () => {
    await new Promise((r) => proxy?.close(r));
    await admin?.end();
  });

  beforeEach(async () => {
    await admin.query(`delete from documents`);
    requests = [];
  });

  it('stores a document and reads it back intact', async () => {
    const doc = makeDoc();
    expect(await alice.create(doc)).toEqual({warnings: []});
    const [got] = await alice.list();

    expect(got).toMatchObject({
      id: doc.id,
      title: doc.title,
      category: 'Computer Science',
      categoryColor: 'blue',
      tags: ['Consensus', 'Raft'],
      excerpt: doc.excerpt,
      emotionalTone: doc.emotionalTone,
      promptQuestion: doc.promptQuestion,
      contentParagraphs: doc.contentParagraphs,
      bulletPoints: doc.bulletPoints,
      discussionQuestions: doc.discussionQuestions,
      summaryWarnings: ['Check the figure 34%.'],
      currentDiscussionIndex: 0,
      userNotes: '',
      comments: [],
    });
    expect(got.sourceMetadata).toEqual(doc.sourceMetadata);
    // Display strings are derived from the real timestamp, not stored.
    expect(got.dateBadge).toBe('Today');
    expect(got.timeAgoGroup).toBe('Last 7 days');
    expect(got.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(got.createdDate).not.toContain('ignored');
    // The (large) source text is not in the list; it is fetched on demand.
    expect(got.sourceText).toBeUndefined();
    expect(await alice.loadSourceText(doc.id)).toBe(doc.sourceText);
  });

  it('lists newest first', async () => {
    const older = makeDoc({title: 'Older', createdAt: '2026-01-01T10:00:00.000Z'});
    const newer = makeDoc({title: 'Newer', createdAt: '2026-03-01T10:00:00.000Z'});
    await alice.create(older);
    await alice.create(newer);
    expect((await alice.list()).map((d) => d.title)).toEqual(['Newer', 'Older']);
    expect((await alice.list()).find((d) => d.title === 'Older')).toMatchObject({timeAgoGroup: 'Older', dateBadge: 'Jan 1'});
  });

  it('saves edits, and sends only the parts that changed', async () => {
    const doc = makeDoc();
    await alice.create(doc);
    await alice.list();

    requests = [];
    await alice.save({...doc, userNotes: 'my notes'});
    expect(writes()).toEqual(['PATCH /documents']);

    requests = [];
    await alice.save({...doc, userNotes: 'my notes', bulletPoints: [{...doc.bulletPoints[0], reviewed: true}, doc.bulletPoints[1]]});
    expect(writes()).toEqual(['POST /summaries']); // upsert of the summary body only

    requests = [];
    await alice.save({...doc, userNotes: 'my notes', bulletPoints: [{...doc.bulletPoints[0], reviewed: true}, doc.bulletPoints[1]]});
    expect(writes()).toEqual([]); // nothing changed, nothing sent

    const [got] = await alice.list();
    expect(got.userNotes).toBe('my notes');
    expect(got.bulletPoints[0].reviewed).toBe(true);
    expect(got.contentParagraphs).toEqual(doc.contentParagraphs);
  });

  it('stores a translation as its own row, reads it back, and saves only what changed', async () => {
    const doc = makeDoc();
    await alice.create(doc);
    await alice.list();

    const sw = {
      contentParagraphs: ['Nodi hukubaliana kwa kutumia akidi.', 'Raft huchagua kiongozi.'],
      bulletPoints: [
        {title: 'Akidi.', text: 'Kura ya walio wengi.'},
        {title: 'Viongozi.', text: 'Kiongozi mmoja hupanga maandishi.'},
      ],
      discussionQuestions: [{question: 'Kwa nini wingi?', context: 'Migawanyiko.'}],
      promptQuestion: 'Akidi husaidiaje?',
      model: 'openai/gpt-oss-120b',
      warnings: ['Angalia takwimu 34%.'],
    };

    requests = [];
    await alice.save({...doc, translations: {Swahili: sw}});
    expect(writes()).toEqual(['POST /summaries']); // only the new language row

    requests = [];
    await alice.save({...doc, translations: {Swahili: sw}});
    expect(writes()).toEqual([]);

    const [got] = await alice.list();
    // The original is untouched, and the translation is not mistaken for it.
    expect(got.contentParagraphs).toEqual(doc.contentParagraphs);
    expect(got.translations).toEqual({Swahili: sw});

    const {rows} = await admin.query(`select language, model from summaries order by language`);
    expect(rows).toEqual([
      {language: 'English', model: 'openai/gpt-oss-120b'},
      {language: 'Swahili', model: 'openai/gpt-oss-120b'},
    ]);

    // Editing the translation rewrites that row only.
    requests = [];
    await alice.save({...doc, translations: {Swahili: {...sw, contentParagraphs: ['Imebadilishwa.', 'Raft huchagua kiongozi.']}}});
    expect(writes()).toEqual(['POST /summaries']);
    expect((await alice.list())[0].translations?.Swahili.contentParagraphs[0]).toBe('Imebadilishwa.');
  });

  it('creates a document together with its translations, and deletes them with it', async () => {
    const doc = makeDoc({
      translations: {Swahili: {contentParagraphs: ['Habari.'], bulletPoints: [], discussionQuestions: []}},
    });
    await alice.create(doc);
    expect((await alice.list())[0].translations?.Swahili.contentParagraphs).toEqual(['Habari.']);
    await alice.remove(doc.id);
    expect((await admin.query(`select 1 from summaries`)).rowCount).toBe(0);
  });

  it('keeps review progress', async () => {
    const doc = makeDoc();
    await alice.create(doc);
    const progress = {scrollPercent: 40, maxScrollPercent: 60, reviewedBulletIndices: [1], completedTaskIds: ['t1'], isFullyReviewed: false};
    await alice.save({...doc, reviewProgress: progress});
    await alice.save({...doc, reviewProgress: {...progress, maxScrollPercent: 90, isFullyReviewed: true}});
    expect((await alice.list())[0].reviewProgress).toMatchObject({maxScrollPercent: 90, isFullyReviewed: true, completedTaskIds: ['t1']});
  });

  it('adds and removes comments, with the author’s name and a relative time', async () => {
    const doc = makeDoc();
    await alice.create(doc);
    await alice.list();
    const c1 = {id: uuid(), author: 'Alice', avatar: 'https://img.example/a.png', text: 'first', timestamp: 'Just now'};
    const c2 = {id: uuid(), author: 'Alice', avatar: '', text: 'second', timestamp: 'Just now'};
    await alice.save({...doc, comments: [c1]});
    await alice.save({...doc, comments: [c1, c2]});
    let got = (await alice.list())[0];
    expect(got.comments.map((c) => [c.text, c.author, c.avatar, c.timestamp])).toEqual([
      ['first', 'Alice', 'https://img.example/a.png', 'Just now'],
      ['second', 'Alice', '', 'Just now'],
    ]);
    await alice.save({...doc, comments: [c2]});
    got = (await alice.list())[0];
    expect(got.comments.map((c) => c.text)).toEqual(['second']);
  });

  it('deletes a document with everything under it', async () => {
    const doc = makeDoc({comments: [{id: uuid(), author: 'Alice', avatar: '', text: 'hi', timestamp: ''}]});
    await alice.create(doc);
    await alice.remove(doc.id);
    expect(await alice.list()).toEqual([]);
    for (const t of ['document_sources', 'summaries', 'comments']) {
      expect((await admin.query(`select 1 from ${t}`)).rowCount, t).toBe(0);
    }
  });

  it('can delete the last remaining document', async () => {
    const doc = makeDoc();
    await alice.create(doc);
    await alice.remove(doc.id);
    expect(await alice.list()).toEqual([]);
  });

  it('leaves nothing half-saved when a later part fails', async () => {
    // An empty comment violates the database's check constraint, after the document itself was stored.
    const doc = makeDoc({comments: [{id: uuid(), author: 'Alice', avatar: '', text: '', timestamp: ''}]});
    await expect(alice.create(doc)).rejects.toThrow(/Could not save/);
    expect(await alice.list()).toEqual([]);
    expect((await admin.query(`select 1 from documents`)).rowCount).toBe(0);
  });

  it('keeps the summary but warns when the original file cannot be stored', async () => {
    const doc = makeDoc();
    // This test setup has no Storage API, so the upload fails the way an outage would.
    const {warnings} = await alice.create(doc, {originalFile: new File(['%PDF-1.4'], 'notes.pdf', {type: 'application/pdf'})});
    expect(warnings).toEqual(['The summary was saved, but the original file could not be kept.']);
    expect(await alice.list()).toHaveLength(1);
  });

  describe('two accounts', () => {
    it('never list each other’s documents', async () => {
      await alice.create(makeDoc({title: 'Alice only'}));
      await bob.create(makeDoc({title: 'Bob only'}));
      expect((await alice.list()).map((d) => d.title)).toEqual(['Alice only']);
      expect((await bob.list()).map((d) => d.title)).toEqual(['Bob only']);
    });

    it('cannot read, change or delete each other’s documents', async () => {
      const doc = makeDoc({title: 'Alice only'});
      await alice.create(doc);
      await alice.list();

      expect(await bob.loadSourceText(doc.id)).toBeNull();
      await bob.save({...doc, title: 'Hacked', userNotes: 'pwned'}).catch(() => undefined);
      await bob.remove(doc.id).catch(() => undefined);

      const [still] = await alice.list();
      expect(still).toMatchObject({title: 'Alice only', userNotes: ''});
      expect(await alice.loadSourceText(doc.id)).toBe(doc.sourceText);
    });

    it('cannot create a document under someone else’s account', async () => {
      const forged = createRepository(await signedInClient(bobId), aliceId, {fullName: 'Bob', avatarUrl: ''});
      await expect(forged.create(makeDoc())).rejects.toThrow();
      expect(await alice.list()).toEqual([]);
    });
  });

  describe('importing summaries saved in the browser before accounts existed', () => {
    it('gives old documents proper ids and their original date, and keeps their content', async () => {
      const legacy = {
        ...makeDoc({id: 'doc-1712345678901', createdDate: 'March 05, 2026 09:30 AM'}),
        discussionQuestions: [{id: 'dq-new-1', question: 'Q?', context: 'c'}],
        comments: [{id: 'c-1712345678902', author: 'Me', avatar: '', text: 'old comment', timestamp: 'Just now'}],
      } as DocumentSummary;
      const upgraded = upgradeLegacy(legacy);
      expect(upgraded.id).not.toBe('doc-1712345678901');
      expect(upgraded.comments[0].id).not.toBe('c-1712345678902');
      expect(upgraded.createdAt).toMatch(/^2026-03-05/);

      await alice.create(upgraded);
      const [got] = await alice.list();
      expect(got).toMatchObject({title: 'Consensus Protocols', timeAgoGroup: 'Older'});
      expect(got.comments.map((c) => c.text)).toEqual(['old comment']);
      expect(got.discussionQuestions[0].question).toBe('Q?');
    });
  });
});
