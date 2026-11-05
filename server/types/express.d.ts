export {};

declare global {
  namespace Express {
    interface Request {
      /** Correlation id, also returned as the `x-request-id` response header. */
      id: string;
      /** The verified Supabase user; set by the auth middleware on every route except /api/health. */
      user?: {id: string; email?: string};
    }
  }
}
