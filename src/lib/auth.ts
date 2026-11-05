import type {AuthChangeEvent, Session, SupabaseClient, User} from '@supabase/supabase-js';
import {useSyncExternalStore} from 'react';
import {setAccessTokenProvider} from './api';
import {isSupabaseConfigured, supabase} from './supabase';

export type UserRole = 'student' | 'researcher' | 'faculty';

export interface AcademicUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string;
  institution: string;
  studentId?: string;
  /** From `profiles.role`, which only an administrator can change. Never taken from the token. */
  role: UserRole;
  createdAt: string;
}

export type AuthState = {status: 'loading'} | {status: 'signedOut'} | {status: 'signedIn'; user: AcademicUser};

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  institution?: string;
  studentId?: string;
  /** Faculty accounts are granted by an administrator, so they cannot be requested here. */
  role?: 'student' | 'researcher';
}

export interface AuthResult {
  /** A message safe to show the user, or null on success. */
  error: string | null;
}

export interface Auth {
  readonly configured: boolean;
  getState(): AuthState;
  subscribe(listener: () => void): () => void;
  signInWithPassword(email: string, password: string): Promise<AuthResult>;
  signUp(input: SignUpInput): Promise<AuthResult & {needsConfirmation: boolean}>;
  signInWithMagicLink(email: string): Promise<AuthResult>;
  signInWithGoogle(): Promise<AuthResult>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<string | null>;
}

const NOT_CONFIGURED = 'Sign-in is not set up for this app yet. Ask the administrator to configure Supabase.';
const UNREACHABLE = 'Could not reach the sign-in service. Check your connection and try again.';

/** How long a sign-in or sign-up may take before the user is told it failed. */
export const AUTH_TIMEOUT_MS = 15_000;

/**
 * Settles with `fallback` if `work` rejects or has not settled within `ms`, so a sign-in button never
 * stays on "Please wait..." (an unreachable or paused Supabase project can leave requests hanging).
 * A late success still signs the person in through onAuthStateChange.
 */
function withTimeout<T>(work: () => Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  const settled = Promise.resolve()
    .then(work)
    .catch(() => fallback);
  return Promise.race([settled, late]).finally(() => clearTimeout(timer));
}

/** A neutral initials badge for people who have no picture, so the UI never shows a broken image. */
export function initialsAvatar(name: string): string {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">` +
    `<rect width="96" height="96" fill="#047857"/>` +
    `<text x="48" y="48" dy=".35em" text-anchor="middle" font-family="system-ui,sans-serif" font-size="38" font-weight="600" fill="#fff">${initials.replace(/[<>&]/g, '')}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Turns a Supabase error into something a student can act on, without leaking internals. */
function friendly(error: {message?: string; status?: number} | null): string | null {
  if (!error) return null;
  const message = error.message ?? '';
  if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first: check your inbox for the link we sent.';
  if (/already registered|already been registered/i.test(message)) return 'An account with this email already exists. Try signing in.';
  if (/password/i.test(message) && /(short|least|weak|characters)/i.test(message)) return message;
  if (error.status === 429 || /rate limit|too many/i.test(message)) return 'Too many attempts. Please wait a minute and try again.';
  if (/fetch|network/i.test(message)) return 'Could not reach the sign-in service. Check your connection and try again.';
  return message || 'Something went wrong. Please try again.';
}

interface ProfileRow {
  full_name: string;
  role: UserRole;
  institution: string;
  student_id: string | null;
  avatar_url: string | null;
  created_at: string;
}

function toUser(user: User, profile: Partial<ProfileRow> | null): AcademicUser {
  const meta = user.user_metadata ?? {};
  const email = user.email ?? '';
  const fullName = profile?.full_name || (meta.full_name as string) || (meta.name as string) || email.split('@')[0] || 'Student';
  return {
    id: user.id,
    email,
    fullName,
    avatarUrl: profile?.avatar_url || (meta.avatar_url as string) || (meta.picture as string) || initialsAvatar(fullName),
    institution: profile?.institution ?? '',
    studentId: profile?.student_id ?? undefined,
    // Least privilege if the profile could not be read: the token's own claims are not trusted for this.
    role: profile?.role ?? 'student',
    createdAt: profile?.created_at ?? user.created_at,
  };
}

/** Auth state for the app, backed by a Supabase client (or none, when Supabase is not configured). */
export function createAuth(client: SupabaseClient | null, {timeoutMs = AUTH_TIMEOUT_MS}: {timeoutMs?: number} = {}): Auth {
  let state: AuthState = client ? {status: 'loading'} : {status: 'signedOut'};
  const listeners = new Set<() => void>();
  let generation = 0;

  const set = (next: AuthState) => {
    state = next;
    listeners.forEach((l) => l());
  };

  async function apply(session: Session | null) {
    const mine = ++generation;
    if (!session) return set({status: 'signedOut'});
    let profile: ProfileRow | null = null;
    try {
      const {data} = await client!.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
      profile = (data as ProfileRow | null) ?? null;
    } catch {
      // fall through with metadata only
    }
    if (mine !== generation) return; // a newer sign-in/out overtook this one
    set({status: 'signedIn', user: toUser(session.user, profile)});
  }

  if (client) {
    client.auth.onAuthStateChange((event: AuthChangeEvent, session) => {
      // Token refreshes and tab-focus "sign-ins" for the same person change nothing we show.
      if (session && state.status === 'signedIn' && state.user.id === session.user.id && event !== 'USER_UPDATED') return;
      // supabase-js asks not to call back into it from inside this listener, so defer.
      setTimeout(() => void apply(session), 0);
    });
    client.auth.getSession().then(
      ({data}) => {
        if (state.status === 'loading') void apply(data.session);
      },
      () => set({status: 'signedOut'}),
    );
  }

  const unavailable = async (): Promise<AuthResult> => ({error: NOT_CONFIGURED});
  const guarded = <T extends AuthResult>(work: () => Promise<T>, fallback: Omit<T, 'error'>): Promise<T> =>
    withTimeout(work, timeoutMs, {...fallback, error: UNREACHABLE} as T);

  return {
    configured: client !== null,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async signInWithPassword(email, password) {
      if (!client) return unavailable();
      return guarded(async () => {
        const {error} = await client.auth.signInWithPassword({email: email.trim(), password});
        return {error: friendly(error)};
      }, {});
    },
    async signUp({email, password, fullName, institution, studentId, role}) {
      if (!client) return {...(await unavailable()), needsConfirmation: false};
      return guarded(async () => {
        const {data, error} = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: fullName.trim(),
              institution: institution?.trim() || undefined,
              student_id: studentId?.trim() || undefined,
              role: role === 'researcher' ? 'researcher' : 'student',
            },
          },
        });
        return {error: friendly(error), needsConfirmation: !error && !data.session};
      }, {needsConfirmation: false});
    },
    async signInWithMagicLink(email) {
      if (!client) return unavailable();
      return guarded(async () => {
        const {error} = await client.auth.signInWithOtp({email: email.trim(), options: {emailRedirectTo: window.location.origin}});
        return {error: friendly(error)};
      }, {});
    },
    async signInWithGoogle() {
      if (!client) return unavailable();
      return guarded(async () => {
        const {error} = await client.auth.signInWithOAuth({provider: 'google', options: {redirectTo: window.location.origin}});
        return {error: friendly(error)};
      }, {});
    },
    async signOut() {
      if (!client) return;
      // Local sign-out must always succeed from the user's point of view, even offline.
      await client.auth.signOut().catch(() => undefined);
      generation++;
      set({status: 'signedOut'});
    },
    async getAccessToken() {
      if (!client) return null;
      const {data} = await client.auth.getSession();
      return data.session?.access_token ?? null;
    },
  };
}

export const auth: Auth = createAuth(supabase);
setAccessTokenProvider(() => auth.getAccessToken());

export {isSupabaseConfigured};

/** The current sign-in state; re-renders when it changes. */
export function useAuth(): AuthState {
  return useSyncExternalStore(auth.subscribe, auth.getState, auth.getState);
}

/** The signed-in user, or null while signed out or still loading. */
export function useAuthUser(): AcademicUser | null {
  const state = useAuth();
  return state.status === 'signedIn' ? state.user : null;
}
