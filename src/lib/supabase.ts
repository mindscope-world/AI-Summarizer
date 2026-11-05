import {createClient, type SupabaseClient} from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/**
 * True when this page load is the return leg of a sign-in link (email confirmation, magic link,
 * Google). Read before the client below consumes and clears the tokens from the URL.
 */
export function isAuthRedirect(location: Pick<Location, 'hash' | 'search'>): boolean {
  return /(^|[#&?])(access_token|code|token_hash)=/.test(`${location.hash}&${location.search}`);
}
export const arrivedFromAuthRedirect = typeof window !== 'undefined' && isAuthRedirect(window.location);

/** False until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set (see .env.example). */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * The browser's Supabase client, or null when the project is not configured. The anon key is
 * public by design: what protects each student's data is Row Level Security in the database
 * (supabase/migrations), never this key. The JWT secret and service-role key must never come here.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true},
    })
  : null;
