import type {Request, Response} from 'express';
import {describe, expect, it} from 'vitest';
import {contentSecurityPolicy, securityHeaders} from './securityHeaders';

function run(env: Parameters<typeof securityHeaders>[0], path: string) {
  const headers: Record<string, string> = {};
  const res = {setHeader: (k: string, v: string) => void (headers[k] = v)} as unknown as Response;
  let called = false;
  securityHeaders(env)({path} as Request, res, () => void (called = true));
  return {headers, called};
}

describe('securityHeaders', () => {
  const dev = {NODE_ENV: 'development' as const, SUPABASE_URL: 'https://abc.supabase.co/'};

  it('sets the basic protections on every response and continues', () => {
    const {headers, called} = run(dev, '/api/health');
    expect(called).toBe(true);
    expect(headers).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    });
    expect(headers['Permissions-Policy']).toContain('microphone=()');
  });

  it('puts the CSP on the app’s pages but not on API responses', () => {
    expect(run(dev, '/').headers['Content-Security-Policy']).toBeTruthy();
    expect(run(dev, '/some/spa/route').headers['Content-Security-Policy']).toBeTruthy();
    expect(run(dev, '/api/summarize').headers['Content-Security-Policy']).toBeUndefined();
  });

  it('only sends HSTS in production', () => {
    expect(run(dev, '/').headers['Strict-Transport-Security']).toBeUndefined();
    expect(run({...dev, NODE_ENV: 'production'}, '/').headers['Strict-Transport-Security']).toMatch(/max-age=\d+/);
  });
});

describe('contentSecurityPolicy', () => {
  const directives = (csp: string) => Object.fromEntries(csp.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]));

  it('allows scripts only from our own origin (no inline scripts, no eval, no other hosts)', () => {
    const d = directives(contentSecurityPolicy({SUPABASE_URL: 'https://abc.supabase.co'}));
    expect(d['script-src']).toEqual(["'self'"]);
    expect(d['default-src']).toEqual(["'self'"]);
    expect(d['object-src']).toEqual(["'none'"]);
    expect(d['frame-ancestors']).toEqual(["'none'"]);
  });

  it('lets the browser talk only to this server and the Supabase project', () => {
    expect(directives(contentSecurityPolicy({SUPABASE_URL: 'https://abc.supabase.co/some/path'}))['connect-src']).toEqual(["'self'", 'https://abc.supabase.co']);
    expect(directives(contentSecurityPolicy({SUPABASE_URL: undefined}))['connect-src']).toEqual(["'self'"]);
    expect(directives(contentSecurityPolicy({SUPABASE_URL: 'not a url'}))['connect-src']).toEqual(["'self'"]);
  });
});
