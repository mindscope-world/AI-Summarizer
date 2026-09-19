import dns from 'node:dns';
import zlib from 'node:zlib';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AppError} from '../lib/errors';
import {startFixtureServer, type FixtureServer} from '../testing/httpServer';
import {describeNetworkError, isBlockedAddress, safeFetch} from './safeFetch';

const OPTS = {timeoutMs: 3000, maxBytes: 1024 * 1024};
const servers: FixtureServer[] = [];
const serve = async (...args: Parameters<typeof startFixtureServer>) => {
  const s = await startFixtureServer(...args);
  servers.push(s);
  return s;
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

const rejection = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as AppError;

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1', '127.255.255.254', '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.0.1',
    '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '239.255.255.255', '255.255.255.255', '198.18.0.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '2001:db8::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '64:ff9b::7f00:1', 'fe80::1%eth0', '[::1]',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '172.15.255.255', '2606:4700:4700::1111', '2001:4860:4860::8888'])(
    'allows public address %s',
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    },
  );

  it('refuses anything that is not an IP address', () => {
    expect(isBlockedAddress('example.com')).toBe(true);
    expect(isBlockedAddress('')).toBe(true);
  });
});

describe('safeFetch: SSRF protection', () => {
  it.each([
    ['loopback IPv4', (port: number) => `http://127.0.0.1:${port}/`],
    ['localhost by name', (port: number) => `http://localhost:${port}/`],
    ['loopback IPv6', (port: number) => `http://[::1]:${port}/`],
    ['decimal-encoded loopback', (port: number) => `http://2130706433:${port}/`],
    ['hex-encoded loopback', (port: number) => `http://0x7f.1:${port}/`],
    ['private 10/8', () => 'http://10.0.0.5/'],
    ['cloud metadata endpoint', () => 'http://169.254.169.254/latest/meta-data/'],
    ['IPv4-mapped IPv6 loopback', (port: number) => `http://[::ffff:127.0.0.1]:${port}/`],
  ])('refuses %s without ever connecting', async (_name, build) => {
    let hit = false;
    const server = await serve((_req, res) => {
      hit = true;
      res.end('secret internal data');
    });
    const err = await rejection(safeFetch(build(server.port), OPTS));
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/private or disallowed/);
    expect(hit).toBe(false);
  });

  it('blocks a hostname if ANY of its addresses is private (mixed DNS answer / rebinding)', async () => {
    let hit = false;
    const server = await serve((_req, res) => {
      hit = true;
      res.end('x');
    });
    vi.spyOn(dns, 'lookup').mockImplementation(((_host: string, _opts: unknown, cb: (...a: unknown[]) => void) => {
      cb(null, [
        {address: '93.184.216.34', family: 4},
        {address: '127.0.0.1', family: 4},
      ]);
    }) as never);
    const err = await rejection(safeFetch(`http://rebind.test:${server.port}/`, OPTS));
    expect(err.status).toBe(400);
    expect(hit).toBe(false);
  });

  it('rejects non-http schemes, credentials and garbage', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com/a', 'gopher://x', 'javascript:alert(1)', 'not a url', '']) {
      const err = await rejection(safeFetch(url, OPTS));
      expect(err.status, url).toBe(400);
    }
    const creds = await rejection(safeFetch('http://user:pw@example.com/', OPTS));
    expect(creds.message).toMatch(/credentials/);
  });
});

describe('safeFetch: fetching (private addresses allowed for the local fixture only)', () => {
  const opts = {...OPTS, allowPrivateAddresses: true};

  it('returns the body, final URL and lower-cased content type', async () => {
    const server = await serve((_req, res) => {
      res.setHeader('Content-Type', 'Text/Plain; charset=utf-8');
      res.end('hello world');
    });
    const result = await safeFetch(`${server.url}/doc`, opts);
    expect(result.body.toString()).toBe('hello world');
    expect(result.contentType).toBe('text/plain; charset=utf-8');
    expect(result.url).toBe(`${server.url}/doc`);
  });

  it('follows relative and absolute redirects', async () => {
    const server = await serve((req, res) => {
      if (req.url === '/a') return void res.writeHead(302, {Location: '/b'}).end();
      if (req.url === '/b') return void res.writeHead(301, {Location: `http://127.0.0.1:${(req.socket.localPort)}/c`}).end();
      res.end('arrived');
    });
    const result = await safeFetch(`${server.url}/a`, opts);
    expect(result.body.toString()).toBe('arrived');
    expect(result.url).toBe(`${server.url}/c`);
  });

  it('gives up on redirect loops', async () => {
    const server = await serve((_req, res) => void res.writeHead(302, {Location: '/loop'}).end());
    const err = await rejection(safeFetch(`${server.url}/loop`, {...opts, maxRedirects: 3}));
    expect(err.status).toBe(502);
    expect(err.message).toMatch(/redirected too many times/);
  });

  it('re-validates redirect targets (scheme and credentials)', async () => {
    for (const location of ['ftp://example.com/file', 'http://user:pw@example.com/', 'file:///etc/passwd']) {
      const server = await serve((_req, res) => void res.writeHead(302, {Location: location}).end());
      const err = await rejection(safeFetch(server.url, opts));
      expect(err.status, location).toBe(400);
    }
  });

  it('maps HTTP errors to upstream_error', async () => {
    const server = await serve((_req, res) => void res.writeHead(404).end('nope'));
    const err = await rejection(safeFetch(server.url, opts));
    expect(err).toMatchObject({status: 502, code: 'upstream_error'});
    expect(err.message).toMatch(/HTTP 404/);
  });

  it('maps connection failures to upstream_error', async () => {
    const server = await serve((_req, res) => res.end());
    const url = server.url;
    await server.close();
    servers.length = 0;
    const err = await rejection(safeFetch(url, opts));
    expect(err).toMatchObject({status: 502, code: 'upstream_error'});
  });

  it('times out on a server that never answers', async () => {
    const server = await serve(() => {
      /* never respond */
    });
    const err = await rejection(safeFetch(server.url, {...opts, timeoutMs: 300}));
    expect(err).toMatchObject({status: 502, code: 'upstream_error'});
    expect(err.message).toMatch(/too long/);
  });

  it('enforces the size cap on streamed bodies', async () => {
    const server = await serve((_req, res) => {
      res.write(Buffer.alloc(40 * 1024, 97));
      res.write(Buffer.alloc(40 * 1024, 97));
      res.end();
    });
    const err = await rejection(safeFetch(server.url, {...opts, maxBytes: 50 * 1024}));
    expect(err).toMatchObject({status: 422, code: 'unprocessable'});
  });

  it('rejects early when Content-Length already exceeds the cap', async () => {
    const server = await serve((_req, res) => {
      res.setHeader('Content-Length', String(10 * 1024 * 1024));
      res.flushHeaders();
    });
    const err = await rejection(safeFetch(server.url, {...opts, maxBytes: 1024}));
    expect(err.status).toBe(422);
  });

  it('decodes gzip, deflate and brotli', async () => {
    const payload = Buffer.from('compressed payload '.repeat(20));
    const encoders: Record<string, (b: Buffer) => Buffer> = {gzip: zlib.gzipSync, deflate: zlib.deflateSync, br: zlib.brotliCompressSync};
    for (const [encoding, encode] of Object.entries(encoders)) {
      const server = await serve((_req, res) => {
        res.setHeader('Content-Encoding', encoding);
        res.end(encode(payload));
      });
      const result = await safeFetch(server.url, opts);
      expect(result.body.equals(payload), encoding).toBe(true);
    }
  });

  it('applies the size cap to DECODED bytes, so a small gzip bomb is refused', async () => {
    const bomb = zlib.gzipSync(Buffer.alloc(20 * 1024 * 1024, 48)); // ~20 KB on the wire, 20 MB decoded
    expect(bomb.length).toBeLessThan(100 * 1024);
    const server = await serve((_req, res) => {
      res.setHeader('Content-Encoding', 'gzip');
      res.end(bomb);
    });
    const err = await rejection(safeFetch(server.url, {...opts, maxBytes: 1024 * 1024}));
    expect(err.status).toBe(422);
  });

  it('refuses unknown content encodings', async () => {
    const server = await serve((_req, res) => {
      res.setHeader('Content-Encoding', 'compress');
      res.end('data');
    });
    const err = await rejection(safeFetch(server.url, opts));
    expect(err.status).toBe(422);
    expect(err.message).toMatch(/content encoding/);
  });
});

describe('describeNetworkError', () => {
  it.each([
    ['ENOTFOUND', /address could not be found/],
    ['ECONNREFUSED', /refused the connection/],
    ['ECONNRESET', /interrupted/],
    ['ETIMEDOUT', /could not be reached/],
    ['ENETUNREACH', /could not be reached/],
    ['CERT_HAS_EXPIRED', /security certificate/],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', /security certificate/],
    ['SOMETHING_ELSE', /Could not fetch the URL/],
    [undefined, /Could not fetch the URL/],
  ])('explains %s', (code, expected) => {
    expect(describeNetworkError(code)).toMatch(expected);
  });

  it('gives a specific message when the connection is refused', async () => {
    const server = await serve((_req, res) => res.end());
    const url = server.url;
    await server.close();
    servers.length = 0;
    const err = await rejection(safeFetch(url, {...OPTS, allowPrivateAddresses: true}));
    expect(err.message).toMatch(/refused the connection/);
  });
});

