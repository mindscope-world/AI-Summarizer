import type {RequestHandler} from 'express';
import {createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTVerifyGetKey} from 'jose';
import type {Env} from '../lib/env';
import {AppError, unauthorized} from '../lib/errors';
import type {Logger} from '../lib/logger';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Signing algorithms Supabase can use: HS256 (legacy shared secret) or an asymmetric key published as JWKS. */
const SYMMETRIC = 'HS256';
const ASYMMETRIC = ['ES256', 'RS256', 'EdDSA'];

/**
 * Verifies the Supabase access token on every request that reaches it and sets `req.user`.
 *
 * - The key comes from configuration only, chosen by the token's algorithm: HS256 is checked
 *   against SUPABASE_JWT_SECRET and never against a public key (and vice versa), so a token cannot
 *   pick its own verification method.
 * - Only user sessions pass: the token must be for the `authenticated` audience and role and carry
 *   a user id. The project's public "anon" key is also a valid JWT, and is refused here.
 * - Nothing about the token is logged, and its failure details are never sent back.
 */
export function createAuthMiddleware(env: Env, logger: Logger): RequestHandler {
  if (env.AUTH_MODE === 'off') return (_req, _res, next) => next();

  const secret = env.SUPABASE_JWT_SECRET ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET) : null;
  const jwks = env.SUPABASE_URL ? createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', env.SUPABASE_URL)) : null;
  const issuer = env.SUPABASE_URL ? new URL('/auth/v1', env.SUPABASE_URL).toString() : undefined;

  if (!secret && !jwks) {
    logger.warn('auth_not_configured', {
      hint: 'Set SUPABASE_URL (and/or SUPABASE_JWT_SECRET) in .env; until then every /api route except /api/health answers 503.',
    });
    return (_req, _res, next) =>
      next(
        new AppError(
          503,
          'service_unavailable',
          'Sign-in is not configured on the server. The administrator needs to set SUPABASE_URL in .env.',
        ),
      );
  }

  const getKey: JWTVerifyGetKey = async (header, token) => {
    if (header.alg === SYMMETRIC) {
      if (!secret) throw new joseErrors.JOSEAlgNotAllowed('HS256 tokens are not accepted');
      return secret;
    }
    if (!jwks || !ASYMMETRIC.includes(header.alg)) throw new joseErrors.JOSEAlgNotAllowed('Unsupported algorithm');
    return jwks(header, token);
  };

  return async (req, _res, next) => {
    const header = req.headers.authorization;
    const match = header ? /^Bearer\s+(\S+)$/i.exec(header) : null;
    if (!match) return next(unauthorized('Sign in to use this feature.'));

    try {
      const {payload} = await jwtVerify(match[1], getKey, {
        audience: 'authenticated',
        ...(issuer ? {issuer} : {}),
        algorithms: [SYMMETRIC, ...ASYMMETRIC],
      });
      if (payload.role !== 'authenticated' || typeof payload.sub !== 'string' || !UUID.test(payload.sub)) {
        return next(unauthorized('Sign in to use this feature.'));
      }
      req.user = {id: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined};
      next();
    } catch (err) {
      if (isKeyLookupFailure(err)) {
        // Not the user's fault: we could not get Supabase's public keys, so no token can be checked.
        const cause = (err as {cause?: {code?: string; message?: string}}).cause;
        logger.error('auth_keys_unavailable', {
          requestId: req.id,
          reason: (err as Error).name,
          message: (err as Error).message,
          cause: cause?.code ?? cause?.message,
          hint: 'The server could not fetch the signing keys from SUPABASE_URL. Check that this machine can reach it.',
        });
        return next(
          new AppError(503, 'service_unavailable', 'Could not verify your sign-in because the server cannot reach Supabase. Try again in a moment.'),
        );
      }
      // Expired tokens are routine; anything else (bad signature, wrong issuer) is worth a look.
      if (!(err instanceof joseErrors.JWTExpired)) logger.warn('auth_token_rejected', {requestId: req.id, reason: (err as Error).name});
      next(unauthorized('Your session has expired or is invalid. Please sign in again.'));
    }
  };
}

/** Errors that mean "the keys could not be fetched or read", as opposed to "this token is bad". */
function isKeyLookupFailure(err: unknown): boolean {
  if (!(err instanceof joseErrors.JOSEError)) return true; // e.g. TypeError: fetch failed (DNS, refused, offline)
  return ['ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID', 'ERR_JOSE_GENERIC'].includes(err.code);
}
