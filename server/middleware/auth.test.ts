import type {Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {exportJWK, generateKeyPair, SignJWT, type JWK} from 'jose';
import {afterEach, describe, expect, it} from 'vitest';
import type {ApiErrorBody} from '../../src/types';
import {createApp} from '../app';
import {loadEnv} from '../lib/env';
import {createLogger} from '../lib/logger';
import {startFixtureServer, type FixtureServer} from '../testing/httpServer';

const GROQ = 'test-groq-key-do-not-leak';
const SECRET = 'a-legacy-hs256-secret-of-decent-length';
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const servers: Server[] = [];
const fixtures: FixtureServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
  await Promise.all(fixtures.splice(0).map((f) => f.close()));
});

async function start(overrides: Record<string, string> = {}) {
  const env = loadEnv({GROQ_API_KEY: GROQ, NODE_ENV: 'test', ...overrides});
  const lines: string[] = [];
  const app = createApp({env, logger: createLogger('debug', (l) => lines.push(l)), staticDir: false});
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  return {base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, lines};
}

interface TokenOptions {
  sub?: string | null;
  role?: string;
  aud?: string;
  iss?: string;
  expiresIn?: string | number;
  email?: string;
}

/** A Supabase-shaped access token. */
async function token(key: Uint8Array | CryptoKey, alg: string, opts: TokenOptions = {}, kid?: string) {
  const {sub = ALICE, role = 'authenticated', aud = 'authenticated', iss, expiresIn = '1h', email = 'alice@example.edu'} = opts;
  const jwt = new SignJWT({role, email}).setProtectedHeader({alg, ...(kid ? {kid} : {})}).setIssuedAt().setExpirationTime(expiresIn).setAudience(aud);
  if (sub) jwt.setSubject(sub);
  if (iss) jwt.setIssuer(iss);
  return jwt.sign(key);
}

const hs = (opts?: TokenOptions, secret = SECRET) => token(new TextEncoder().encode(secret), 'HS256', opts);

const post = (base: string, jwt?: string) =>
  fetch(`${base}/api/extract`, {
    method: 'POST',
    headers: {'content-type': 'application/json', ...(jwt ? {authorization: `Bearer ${jwt}`} : {})},
    body: JSON.stringify({text: 'Consensus protocols let independent nodes agree on one value even when some fail.'}),
  });

const errorOf = async (res: Response) => ((await res.json()) as ApiErrorBody).error;

describe('sign-in required (HS256 project secret)', () => {
  it('accepts a valid session token', async () => {
    const {base} = await start({SUPABASE_JWT_SECRET: SECRET});
    expect((await post(base, await hs())).status).toBe(200);
  });

  it('keeps /api/health public', async () => {
    const {base} = await start({SUPABASE_JWT_SECRET: SECRET});
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
  });

  it.each([
    ['no Authorization header', undefined],
    ['a malformed token', 'not.a.jwt'],
    ['an empty bearer token', ''],
  ])('rejects %s with 401', async (_name, jwt) => {
    const {base} = await start({SUPABASE_JWT_SECRET: SECRET});
    const res = await fetch(`${base}/api/extract`, {
      method: 'POST',
      headers: {'content-type': 'application/json', ...(jwt === undefined ? {} : {authorization: `Bearer ${jwt}`})},
      body: JSON.stringify({text: 'hello world'}),
    });
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe('unauthorized');
  });

  it('protects every other API route, including unknown ones', async () => {
    const {base} = await start({SUPABASE_JWT_SECRET: SECRET});
    for (const path of ['/api/summarize', '/api/documents/x/export?format=pdf', '/api/feedback', '/api/nope']) {
      const res = await fetch(`${base}${path}`, {method: path === '/api/nope' ? 'GET' : 'POST'});
      expect(res.status, path).toBe(401);
    }
  });

  it('rejects an expired token', async () => {
    const {base} = await start({SUPABASE_JWT_SECRET: SECRET});
    const res = await post(base, await hs({expiresIn: -60}));
    expect(res.status).toBe(401);
    expect((await errorOf(res)).message).toMatch(/expired or is invalid/);
  });

  it('rejects a token signed with a different secret', async () => {
    const {base} = await start({SUPABASE_JWT_SECRET: SECRET});
    expect((await post(base, await hs({}, 'some-other-secret-that-is-long-enough'))).status).toBe(401);
  });

  it('rejects an unsigned (alg=none) token', async () => {
    const {base} = await start({SUPABASE_JWT_SECRET: SECRET});
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${b64({alg: 'none', typ: 'JWT'})}.${b64({sub: ALICE, role: 'authenticated', aud: 'authenticated', exp: 9999999999})}.`;
    expect((await post(base, forged)).status).toBe(401);
  });

  it('rejects the project’s public anon key and tokens for other audiences or roles', async () => {
    const {base} = await start({SUPABASE_JWT_SECRET: SECRET});
    // The anon key is a genuine project-signed JWT, but it is not a signed-in user.
    expect((await post(base, await hs({role: 'anon', sub: null}))).status).toBe(401);
    expect((await post(base, await hs({role: 'service_role', sub: null}))).status).toBe(401);
    expect((await post(base, await hs({aud: 'something-else'}))).status).toBe(401);
    expect((await post(base, await hs({role: 'anon'}))).status).toBe(401);
  });

  it('rejects a token without a valid user id', async () => {
    const {base} = await start({SUPABASE_JWT_SECRET: SECRET});
    expect((await post(base, await hs({sub: null}))).status).toBe(401);
    expect((await post(base, await hs({sub: 'admin'}))).status).toBe(401);
  });

  it('never echoes the token or the secret, and never logs them', async () => {
    const {base, lines} = await start({SUPABASE_JWT_SECRET: SECRET});
    const bad = await hs({}, 'some-other-secret-that-is-long-enough');
    const res = await post(base, bad);
    const body = JSON.stringify(await res.json());
    for (const out of [body, lines.join('\n')]) {
      expect(out).not.toContain(bad);
      expect(out).not.toContain(SECRET);
    }
  });

  it('limits requests per signed-in user, not per address', async () => {
    const {base} = await start({SUPABASE_JWT_SECRET: SECRET, RATE_LIMIT_PER_MINUTE: '2', EXTRACT_RATE_LIMIT_PER_MINUTE: '2'});
    const alice = await hs({sub: ALICE});
    const bob = await hs({sub: BOB});
    expect([(await post(base, alice)).status, (await post(base, alice)).status, (await post(base, alice)).status]).toEqual([200, 200, 429]);
    // Same IP, different user: still has their own allowance.
    expect((await post(base, bob)).status).toBe(200);
  });

  it('lets CORS preflights through without a token', async () => {
    const {base} = await start({SUPABASE_JWT_SECRET: SECRET, CORS_ORIGINS: 'https://app.example.edu'});
    const res = await fetch(`${base}/api/extract`, {
      method: 'OPTIONS',
      headers: {origin: 'https://app.example.edu', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type'},
    });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.edu');
  });
});

describe('sign-in required (Supabase signing keys / JWKS)', () => {
  /** A fake Supabase Auth serving its public keys, plus a helper to sign tokens like it would. */
  async function supabase() {
    const {publicKey, privateKey} = await generateKeyPair('ES256');
    const jwk: JWK = {...(await exportJWK(publicKey)), kid: 'key-1', alg: 'ES256', use: 'sig'};
    const fixture = await startFixtureServer((req, res) => {
      if (req.url === '/auth/v1/.well-known/jwks.json') {
        res.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify({keys: [jwk]}));
      } else res.writeHead(404).end();
    });
    fixtures.push(fixture);
    const iss = `${fixture.url}/auth/v1`;
    return {url: fixture.url, iss, sign: (opts: TokenOptions = {}, key: CryptoKey = privateKey) => token(key, 'ES256', {iss, ...opts}, 'key-1'), jwk};
  }

  it('accepts a token signed by the project’s key', async () => {
    const sb = await supabase();
    const {base} = await start({SUPABASE_URL: sb.url});
    expect((await post(base, await sb.sign())).status).toBe(200);
  });

  it('rejects a token signed by some other key, even one claiming the same key id', async () => {
    const sb = await supabase();
    const {base} = await start({SUPABASE_URL: sb.url});
    const attacker = await generateKeyPair('ES256');
    expect((await post(base, await sb.sign({}, attacker.privateKey))).status).toBe(401);
  });

  it('rejects a token from a different issuer', async () => {
    const sb = await supabase();
    const {base} = await start({SUPABASE_URL: sb.url});
    expect((await post(base, await sb.sign({iss: 'https://evil.example/auth/v1'}))).status).toBe(401);
  });

  it('rejects an expired token and the anon key', async () => {
    const sb = await supabase();
    const {base} = await start({SUPABASE_URL: sb.url});
    expect((await post(base, await sb.sign({expiresIn: -60}))).status).toBe(401);
    expect((await post(base, await sb.sign({role: 'anon', sub: null}))).status).toBe(401);
  });

  it('is not fooled by an HS256 token when only public keys are configured (algorithm confusion)', async () => {
    const sb = await supabase();
    const {base} = await start({SUPABASE_URL: sb.url});
    // Classic attack: sign with HS256 using the public key material as the "secret".
    const forged = await hs({iss: sb.iss}, JSON.stringify(sb.jwk));
    expect((await post(base, forged)).status).toBe(401);
    expect((await post(base, await hs({iss: sb.iss}))).status).toBe(401);
  });

  it('supports both kinds of key at once (project migrating from a shared secret)', async () => {
    const sb = await supabase();
    const {base} = await start({SUPABASE_URL: sb.url, SUPABASE_JWT_SECRET: SECRET});
    expect((await post(base, await sb.sign())).status).toBe(200);
    expect((await post(base, await hs({iss: sb.iss}))).status).toBe(200);
  });
});

describe('Supabase keys unreachable', () => {
  it('answers 503 (not "session expired") and logs the cause when the signing keys cannot be fetched', async () => {
    const fixture = await startFixtureServer((_req, res) => res.destroy());
    const url = fixture.url;
    await fixture.close(); // nothing is listening any more: connection refused
    const {base, lines} = await start({SUPABASE_URL: url});
    const jwt = await token((await generateKeyPair('ES256')).privateKey, 'ES256', {iss: `${url}/auth/v1`}, 'key-1');
    const res = await post(base, jwt);
    expect(res.status).toBe(503);
    expect((await errorOf(res)).code).toBe('service_unavailable');
    expect(lines.join('\n')).toContain('auth_keys_unavailable');
    expect(lines.join('\n')).not.toContain(jwt);
  });
});

describe('sign-in not configured', () => {
  it('answers 503 with guidance instead of letting anyone in, while /api/health stays up', async () => {
    const {base, lines} = await start();
    const res = await post(base, await hs());
    expect(res.status).toBe(503);
    expect((await errorOf(res)).code).toBe('service_unavailable');
    expect(lines.join('\n')).toContain('auth_not_configured');
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
  });
});

describe('AUTH_MODE=off', () => {
  it('skips the check (for local API experiments and tests)', async () => {
    const {base} = await start({AUTH_MODE: 'off'});
    expect((await post(base)).status).toBe(200);
  });
});
