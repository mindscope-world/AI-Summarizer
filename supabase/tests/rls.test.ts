import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

/**
 * Row Level Security tests against a real Postgres. They run only when RLS_DATABASE_URL points at
 * a disposable server (`npm run test:rls` starts one in docker); otherwise they are skipped.
 * Each run works in its own throwaway database.
 */
const url = process.env.RLS_DATABASE_URL;
const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe.skipIf(!url)('database schema and Row Level Security', () => {
  const dbName = `rls_${randomUUID().replace(/-/g, '')}`;
  let admin: Client;
  let db: Client;
  let alice: string;
  let bob: string;
  let aliceDoc: string;

  /** Runs `sql` the way PostgREST would: as the `authenticated` role with the user's id in the JWT claims. */
  async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) {
    await db.query('begin');
    try {
      await db.query(`set local role ${user === null ? 'anon' : 'authenticated'}`);
      if (user) await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user]);
      const res = await db.query(sql, params);
      await db.query('commit');
      return res as {rows: T[]; rowCount: number | null};
    } catch (err) {
      await db.query('rollback');
      throw err;
    }
  }

  const newUser = async (email: string, meta: Record<string, unknown> = {}) => {
    const {rows} = await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [
      email,
      JSON.stringify(meta),
    ]);
    return rows[0].id as string;
  };

  beforeAll(async () => {
    admin = new Client({connectionString: url});
    await admin.connect();
    await admin.query(`create database ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    db = new Client({connectionString: target.toString()});
    await db.connect();
    await db.query(read('tests/bootstrap.sql'));
    for (const file of fs.readdirSync(path.join(root, 'migrations')).sort()) await db.query(read(`migrations/${file}`));

    alice = await newUser('alice@example.edu', {full_name: 'Alice Wanjiru', institution: 'EAU', student_id: 'S1'});
    bob = await newUser('bob@example.edu', {full_name: 'Bob Otieno'});

    aliceDoc = (
      await as<{id: string}>(alice, `insert into documents (title, category) values ('Alice notes', 'CS') returning id`)
    ).rows[0].id;
    await as(alice, `insert into document_sources (document_id, text) values ($1, 'secret source text')`, [aliceDoc]);
    await as(alice, `insert into summaries (document_id, body) values ($1, '{"contentParagraphs":["p"]}')`, [aliceDoc]);
    await as(alice, `insert into comments (document_id, author_name, body) values ($1, 'Alice', 'private thought')`, [aliceDoc]);
    await as(alice, `insert into review_progress (document_id, progress) values ($1, '{"scrollPercent":10}')`, [aliceDoc]);
    await as(alice, `insert into feedback (document_id, rating) values ($1, 5)`, [aliceDoc]);
    await as(alice, `insert into user_preferences (preferences) values ('{"theme":"dark"}')`);
  }, 60_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`drop database if exists ${dbName} with (force)`);
      await admin.end();
    }
  });

  describe('accounts and roles', () => {
    it('creates a profile at sign-up from the sign-up metadata', async () => {
      const {rows} = await as(alice, `select full_name, role, institution, student_id from profiles`);
      expect(rows).toEqual([{full_name: 'Alice Wanjiru', role: 'student', institution: 'EAU', student_id: 'S1'}]);
    });

    it('lets a sign-up choose researcher but never faculty', async () => {
      const r = await newUser('r@example.edu', {role: 'researcher'});
      const f = await newUser('f@example.edu', {role: 'faculty'});
      const roles = await db.query(`select id, role from profiles where id = any($1)`, [[r, f]]);
      expect(Object.fromEntries(roles.rows.map((x) => [x.id, x.role]))).toEqual({[r]: 'researcher', [f]: 'student'});
    });

    it('falls back to the email name when sign-up gives no name (e.g. a bare email sign-up)', async () => {
      const id = await newUser('plain.person@example.edu');
      expect((await db.query(`select full_name from profiles where id = $1`, [id])).rows[0].full_name).toBe('plain.person');
    });

    it('lets users edit their own profile but not promote themselves', async () => {
      await as(alice, `update profiles set full_name = 'Alice W.' where id = $1`, [alice]);
      await expect(as(alice, `update profiles set role = 'faculty' where id = $1`, [alice])).rejects.toThrow(/administrator/);
      expect((await as(alice, `select role from profiles`)).rows[0]).toEqual({role: 'student'});
    });

    it('lets an administrator (no signed-in user) change a role', async () => {
      const id = await newUser('teacher@example.edu');
      await db.query(`update profiles set role = 'faculty' where id = $1`, [id]);
      expect((await as(id, `select role from profiles`)).rows[0]).toEqual({role: 'faculty'});
    });

    it('never lets one user see or change another user’s profile', async () => {
      expect((await as(bob, `select id from profiles`)).rows.map((r) => r.id)).toEqual([bob]);
      const res = await as(bob, `update profiles set full_name = 'hacked' where id = $1`, [alice]);
      expect(res.rowCount).toBe(0);
      expect((await db.query(`select full_name from profiles where id = $1`, [alice])).rows[0].full_name).toBe('Alice W.');
    });
  });

  describe('two accounts cannot see each other’s data', () => {
    const tables = ['documents', 'document_sources', 'summaries', 'comments', 'review_progress', 'feedback', 'user_preferences'];

    it.each(tables)('%s: the owner sees a row and another user sees none', async (table) => {
      expect((await as(alice, `select 1 from ${table}`)).rows).toHaveLength(1);
      expect((await as(bob, `select 1 from ${table}`)).rows).toHaveLength(0);
    });

    it('does not let another user edit or delete the row', async () => {
      expect((await as(bob, `update documents set title = 'pwned' where id = $1`, [aliceDoc])).rowCount).toBe(0);
      expect((await as(bob, `delete from documents where id = $1`, [aliceDoc])).rowCount).toBe(0);
      expect((await as(bob, `update comments set body = 'pwned'`)).rowCount).toBe(0);
      expect((await as(bob, `delete from document_sources`)).rowCount).toBe(0);
      expect((await as(alice, `select title from documents`)).rows).toEqual([{title: 'Alice notes'}]);
    });

    it('does not let a user create rows as someone else', async () => {
      await expect(as(bob, `insert into documents (user_id, title) values ($1, 'forged')`, [alice])).rejects.toThrow(/row-level security/);
      await expect(as(bob, `insert into user_preferences (user_id, preferences) values ($1, '{}')`, [alice])).rejects.toThrow(/row-level security/);
    });

    it('does not let a user attach rows to someone else’s document', async () => {
      const bad = [
        `insert into document_sources (document_id, text) values ($1, 'x')`,
        `insert into summaries (document_id, body) values ($1, '{}')`,
        `insert into comments (document_id, body) values ($1, 'x')`,
        `insert into review_progress (document_id, progress) values ($1, '{}')`,
        `insert into feedback (document_id, rating) values ($1, 3)`,
      ];
      for (const sql of bad) await expect(as(bob, sql, [aliceDoc])).rejects.toThrow(/row-level security/);
    });

    it('does not let a user move their own row onto someone else', async () => {
      const own = (await as<{id: string}>(bob, `insert into documents (title) values ('Bob notes') returning id`)).rows[0].id;
      await expect(as(bob, `update documents set user_id = $1 where id = $2`, [alice, own])).rejects.toThrow(/row-level security/);
    });

    it('gives each user their own list', async () => {
      const titles = (await as<{title: string}>(bob, `select title from documents order by title`)).rows.map((r) => r.title);
      expect(titles).toEqual(['Bob notes']);
      expect((await as(alice, `select 1 from documents`)).rows).toHaveLength(1);
    });
  });

  describe('signed-out access', () => {
    it.each(['profiles', 'documents', 'document_sources', 'summaries', 'comments', 'review_progress', 'feedback', 'user_preferences'])(
      'the anonymous role cannot read %s',
      async (table) => {
        await expect(as(null, `select 1 from ${table}`)).rejects.toThrow(/permission denied/);
      },
    );

    it('the anonymous role cannot write either', async () => {
      await expect(as(null, `insert into documents (title) values ('x')`)).rejects.toThrow(/permission denied/);
    });
  });

  describe('integrity', () => {
    it('has Row Level Security switched on for every table in the public schema', async () => {
      const {rows} = await db.query(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
      );
      expect(rows).toEqual([]);
    });

    it('rejects out-of-range or malformed values', async () => {
      await expect(as(alice, `insert into feedback (rating) values (6)`)).rejects.toThrow(/check constraint/);
      await expect(as(alice, `insert into documents (title, category_color) values ('x', 'neon')`)).rejects.toThrow(/check constraint/);
      await expect(as(alice, `insert into documents (title) values ('')`)).rejects.toThrow(/check constraint/);
    });

    it('keeps at most one summary per document and language', async () => {
      await expect(as(alice, `insert into summaries (document_id, body) values ($1, '{}')`, [aliceDoc])).rejects.toThrow(/duplicate key/);
      await as(alice, `insert into summaries (document_id, language, body) values ($1, 'Swahili', '{}')`, [aliceDoc]);
    });

    it('stamps updated_at when a row changes', async () => {
      const before = (await as<{updated_at: Date}>(alice, `select updated_at from documents`)).rows[0].updated_at;
      await new Promise((r) => setTimeout(r, 15));
      await as(alice, `update documents set user_notes = 'edited' where id = $1`, [aliceDoc]);
      const after = (await as<{updated_at: Date}>(alice, `select updated_at from documents`)).rows[0].updated_at;
      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });

    it('removes everything under a document when it is deleted, and everything of a user when the account goes', async () => {
      const temp = await newUser('temp@example.edu');
      const doc = (await as<{id: string}>(temp, `insert into documents (title) values ('t') returning id`)).rows[0].id;
      await as(temp, `insert into comments (document_id, body) values ($1, 'c')`, [doc]);
      await as(temp, `insert into document_sources (document_id, text) values ($1, 't')`, [doc]);
      await as(temp, `delete from documents where id = $1`, [doc]);
      expect((await db.query(`select 1 from comments where user_id = $1`, [temp])).rowCount).toBe(0);
      expect((await db.query(`select 1 from document_sources where user_id = $1`, [temp])).rowCount).toBe(0);

      await as(temp, `insert into documents (title) values ('t2')`);
      await db.query(`delete from auth.users where id = $1`, [temp]);
      for (const t of ['profiles', 'documents']) {
        expect((await db.query(`select 1 from ${t} where ${t === 'profiles' ? 'id' : 'user_id'} = $1`, [temp])).rowCount).toBe(0);
      }
    });

    it('keeps a rating but detaches it when its document is deleted', async () => {
      const doc = (await as<{id: string}>(alice, `insert into documents (title) values ('temp') returning id`)).rows[0].id;
      await as(alice, `insert into feedback (document_id, rating) values ($1, 4)`, [doc]);
      await as(alice, `delete from documents where id = $1`, [doc]);
      const rows = (await as<{document_id: string | null; rating: number}>(alice, `select document_id, rating from feedback where rating = 4`)).rows;
      expect(rows).toEqual([{document_id: null, rating: 4}]);
    });
  });

  describe('uploads bucket', () => {
    const put = (user: string, name: string) => as(user, `insert into storage.objects (bucket_id, name) values ('uploads', $1)`, [name]);

    it('is private, size-limited and restricted to document types', async () => {
      const {rows} = await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'uploads'`);
      expect(rows[0].public).toBe(false);
      expect(Number(rows[0].file_size_limit)).toBe(50 * 1024 * 1024);
      expect(rows[0].allowed_mime_types).toEqual(expect.arrayContaining(['application/pdf', 'text/plain']));
      expect(rows[0].allowed_mime_types).not.toContain('text/html');
    });

    it('lets a user store and read files in their own folder only', async () => {
      await put(alice, `${alice}/notes.pdf`);
      expect((await as(alice, `select name from storage.objects`)).rows).toEqual([{name: `${alice}/notes.pdf`}]);
      await expect(put(alice, `${bob}/planted.pdf`)).rejects.toThrow(/row-level security/);
      await expect(put(alice, `notes.pdf`)).rejects.toThrow(/row-level security/);
    });

    it('hides one user’s files from another and blocks deleting them', async () => {
      expect((await as(bob, `select name from storage.objects`)).rows).toEqual([]);
      expect((await as(bob, `delete from storage.objects where name = $1`, [`${alice}/notes.pdf`])).rowCount).toBe(0);
      expect((await as(alice, `select 1 from storage.objects`)).rows).toHaveLength(1);
    });

    it('does not serve other buckets’ files through the uploads policies', async () => {
      await db.query(`insert into storage.buckets (id, name) values ('other', 'other')`);
      await expect(
        as(alice, `insert into storage.objects (bucket_id, name) values ('other', $1)`, [`${alice}/x.pdf`]),
      ).rejects.toThrow(/row-level security/);
    });
  });
});
