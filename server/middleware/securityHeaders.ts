import type {RequestHandler} from 'express';
import type {Env} from '../lib/env';

const originOf = (url: string | undefined): string | null => {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
};

/**
 * Content-Security-Policy for the web app (not for JSON). Scripts only from our own origin, so an
 * injected `<script>` or inline handler cannot run; the browser may talk only to this server and to
 * the Supabase project (sign-in and the student's own data). Styles allow `unsafe-inline` because
 * React and the animation library set inline style attributes; fonts come from Google Fonts.
 */
export function contentSecurityPolicy(env: Pick<Env, 'SUPABASE_URL'>): string {
  const supabase = originOf(env.SUPABASE_URL);
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    // Profile pictures (e.g. Google) and the landing photo come from other https hosts.
    "img-src 'self' data: blob: https:",
    `connect-src 'self'${supabase ? ` ${supabase}` : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Headers for every response; the CSP only for the app's pages, and HSTS only where TLS is expected. */
export function securityHeaders(env: Pick<Env, 'NODE_ENV' | 'SUPABASE_URL'>): RequestHandler {
  const csp = contentSecurityPolicy(env);
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    if (env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    if (!req.path.startsWith('/api')) res.setHeader('Content-Security-Policy', csp);
    next();
  };
}
