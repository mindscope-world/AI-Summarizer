import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {Readable} from 'node:stream';
import zlib from 'node:zlib';
import {AppError, badRequest, unprocessable, upstreamError} from '../lib/errors';

/**
 * Fetching a user-supplied URL is the classic SSRF hole, so every safeguard here
 * is deliberate:
 *   - http/https only, no credentials in the URL
 *   - every address the hostname resolves to is checked, and the connection uses
 *     the very same lookup, so DNS rebinding cannot swap in a private address
 *   - IP-literal hosts are checked directly (Node skips DNS for those)
 *   - redirects are followed manually (max 5) and each hop is re-validated
 *   - hard caps on total time and on decoded bytes (also stops decompression bombs)
 */

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, incl. cloud metadata (169.254.169.254)
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const) {
  blocked.addSubnet(addr, prefix, 'ipv4');
}
// IPv4-mapped IPv6 (::ffff:a.b.c.d) is matched against the IPv4 rules above by BlockList itself.
blocked.addAddress('::', 'ipv6');
blocked.addAddress('::1', 'ipv6');
for (const [addr, prefix] of [
  ['64:ff9b::', 96], // NAT64
  ['100::', 64], // discard-only
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  blocked.addSubnet(addr, prefix, 'ipv6');
}

/** True for loopback, private, link-local, multicast and other non-public addresses. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').split('%')[0];
  const family = net.isIP(ip);
  if (family === 0) return true; // not an IP at all: refuse
  return blocked.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

class BlockedAddressError extends Error {
  code = 'EBLOCKED';
}

const BLOCKED_MESSAGE = 'That URL points to a private or disallowed address and cannot be fetched.';

export interface SafeFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects?: number;
  /** TESTS ONLY: skips the address check so a local fixture server can be reached. Never set from config. */
  allowPrivateAddresses?: boolean;
}

export interface FetchedResource {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
}

function makeLookup(allowPrivate: boolean): net.LookupFunction {
  return (hostname, options, callback) => {
    dns.lookup(hostname, {all: true, verbatim: true}, (err, addresses) => {
      if (err) return callback(err, '', 4);
      if (!addresses.length) return callback(new Error('no addresses'), '', 4);
      if (!allowPrivate && addresses.some((a) => isBlockedAddress(a.address))) {
        return callback(new BlockedAddressError('blocked address'), '', 4);
      }
      if ((options as {all?: boolean}).all) {
        (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addresses);
      } else {
        callback(null, addresses[0].address, addresses[0].family);
      }
    });
  };
}

function validateUrl(raw: string | URL, allowPrivate: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest('That is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw badRequest('Only http and https URLs are supported.');
  if (url.username || url.password) throw badRequest('URLs containing credentials are not allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!allowPrivate && net.isIP(host) && isBlockedAddress(host)) throw badRequest(BLOCKED_MESSAGE);
  return url;
}

interface Hop {
  status: number;
  headers: http.IncomingHttpHeaders;
  body?: Buffer;
}

function requestOnce(url: URL, opts: SafeFetchOptions, deadline: number): Promise<Hop> {
  return new Promise<Hop>((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(upstreamError('The URL took too long to respond.'));

    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method: 'GET',
        lookup: makeLookup(!!opts.allowPrivateAddresses),
        headers: {
          'User-Agent': 'LeaderForgeSummarizer/0.1 (+academic-use)',
          Accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,text/plain;q=0.8,*/*;q=0.1',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          clearTimeout(timer);
          return resolve({status, headers: res.headers});
        }
        if (status < 200 || status >= 300) {
          res.resume();
          clearTimeout(timer);
          return reject(upstreamError(`The URL responded with HTTP ${status}.`));
        }
        const declared = Number(res.headers['content-length']);
        if (Number.isFinite(declared) && declared > opts.maxBytes) {
          res.resume();
          clearTimeout(timer);
          return reject(unprocessable(tooLarge(opts.maxBytes)));
        }

        let source: Readable = res;
        const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase().trim();
        if (encoding === 'gzip' || encoding === 'x-gzip') source = res.pipe(zlib.createGunzip());
        else if (encoding === 'deflate') source = res.pipe(zlib.createInflate());
        else if (encoding === 'br') source = res.pipe(zlib.createBrotliDecompress());
        else if (encoding && encoding !== 'identity') {
          res.resume();
          clearTimeout(timer);
          return reject(unprocessable(`The URL uses an unsupported content encoding (${encoding}).`));
        }

        const chunks: Buffer[] = [];
        let total = 0;
        source.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > opts.maxBytes) {
            clearTimeout(timer);
            req.destroy();
            source.destroy();
            reject(unprocessable(tooLarge(opts.maxBytes)));
            return;
          }
          chunks.push(chunk);
        });
        source.on('end', () => {
          clearTimeout(timer);
          resolve({status, headers: res.headers, body: Buffer.concat(chunks)});
        });
        source.on('error', () => {
          clearTimeout(timer);
          reject(upstreamError('The response from the URL could not be read.'));
        });
      },
    );

    const timer = setTimeout(() => {
      req.destroy(Object.assign(new Error('timeout'), {code: 'ETOTALTIMEOUT'}));
    }, remaining);

    req.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === 'EBLOCKED') return reject(badRequest(BLOCKED_MESSAGE));
      if (err.code === 'ETOTALTIMEOUT') return reject(upstreamError('The URL took too long to respond.'));
      if (err instanceof AppError) return reject(err);
      reject(upstreamError(describeNetworkError(err.code)));
    });
    req.end();
  });
}

/** Specific, safe-to-show explanations for the network failures students actually hit. */
export function describeNetworkError(code: string | undefined): string {
  switch (code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'The website address could not be found. Check the spelling of the link.';
    case 'ECONNREFUSED':
      return 'The website refused the connection.';
    case 'ECONNRESET':
    case 'EPIPE':
      return 'The connection to the website was interrupted. Try again.';
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return 'The website could not be reached.';
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'CERT_HAS_EXPIRED':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return "The website's security certificate is not valid, so it was not fetched.";
    default:
      return 'Could not fetch the URL. Check the address and that the site is reachable.';
  }
}

const tooLarge = (maxBytes: number) => `The page is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`;

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions): Promise<FetchedResource> {
  const allowPrivate = !!opts.allowPrivateAddresses;
  const maxRedirects = opts.maxRedirects ?? 5;
  const deadline = Date.now() + opts.timeoutMs;

  let url = validateUrl(rawUrl, allowPrivate);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const result = await requestOnce(url, opts, deadline);
    if (result.body) {
      return {
        url: url.toString(),
        status: result.status,
        contentType: String(result.headers['content-type'] ?? '').toLowerCase(),
        body: result.body,
      };
    }
    // Redirect: resolve relative to the current URL and validate again.
    url = validateUrl(new URL(String(result.headers.location), url), allowPrivate);
  }
  throw upstreamError('The URL redirected too many times.');
}
