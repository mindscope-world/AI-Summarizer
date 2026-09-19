export {};

declare global {
  namespace Express {
    interface Request {
      /** Correlation id, also returned as the `x-request-id` response header. */
      id: string;
      /** Set by the auth middleware once Supabase auth lands (Phase 4). */
      user?: {id: string; role?: 'student' | 'researcher' | 'faculty'};
    }
  }
}
