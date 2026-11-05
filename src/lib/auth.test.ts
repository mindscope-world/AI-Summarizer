// @vitest-environment jsdom
import type {Session, SupabaseClient} from '@supabase/supabase-js';
import {describe, expect, it, vi} from 'vitest';
import {createAuth, initialsAvatar} from './auth';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const session = (id = ALICE, meta: Record<string, unknown> = {}): Session =>
  ({access_token: `token-for-${id}`, user: {id, email: 'alice@example.edu', user_metadata: meta, created_at: '2026-01-01T00:00:00Z'}}) as unknown as Session;

interface FakeOptions {
  session?: Session | null;
  profile?: Record<string, unknown> | null;
  profileError?: boolean;
}

function fake({session: initial = null, profile = null, profileError = false}: FakeOptions = {}) {
  let listener: ((event: string, session: Session | null) => void) | undefined;
  const auth = {
    getSession: vi.fn(async () => ({data: {session: initial}})),
    onAuthStateChange: vi.fn((cb) => {
      listener = cb;
      return {data: {subscription: {unsubscribe() {}}}};
    }),
    signInWithPassword: vi.fn(async () => ({error: null})),
    signUp: vi.fn(async () => ({data: {session: null}, error: null})),
    signInWithOtp: vi.fn(async () => ({error: null})),
    signInWithOAuth: vi.fn(async () => ({error: null})),
    signOut: vi.fn(async () => ({error: null})),
  };
  const maybeSingle = vi.fn(async () => (profileError ? Promise.reject(new Error('down')) : {data: profile, error: null}));
  const eq = vi.fn(() => ({maybeSingle}));
  const from = vi.fn(() => ({select: () => ({eq})}));
  const client = {auth, from} as unknown as SupabaseClient;
  return {client, auth, from, eq, emit: (event: string, s: Session | null) => listener?.(event, s)};
}

const settled = (a: ReturnType<typeof createAuth>) => vi.waitFor(() => expect(a.getState().status).not.toBe('loading'));
const profile = (over: Record<string, unknown> = {}) => ({
  full_name: 'Alice Wanjiru',
  role: 'student',
  institution: 'EAU',
  student_id: 'S1',
  avatar_url: null,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
});

describe('without Supabase configured', () => {
  it('is signed out, says so, and cannot sign anyone in', async () => {
    const a = createAuth(null);
    expect(a.configured).toBe(false);
    expect(a.getState()).toEqual({status: 'signedOut'});
    expect((await a.signInWithPassword('a@b.edu', 'x')).error).toMatch(/not set up/i);
    expect((await a.signUp({email: 'a@b.edu', password: 'x', fullName: 'A'})).error).toMatch(/not set up/i);
    expect(await a.getAccessToken()).toBeNull();
  });
});

describe('restoring a session', () => {
  it('starts as loading, then signed out when there is no session', async () => {
    const f = fake();
    const a = createAuth(f.client);
    expect(a.getState()).toEqual({status: 'loading'});
    await settled(a);
    expect(a.getState()).toEqual({status: 'signedOut'});
  });

  it('signs in from a stored session, using the profile for name and role', async () => {
    const f = fake({session: session(), profile: profile({role: 'researcher'})});
    const a = createAuth(f.client);
    await settled(a);
    expect(a.getState()).toMatchObject({
      status: 'signedIn',
      user: {id: ALICE, email: 'alice@example.edu', fullName: 'Alice Wanjiru', role: 'researcher', institution: 'EAU', studentId: 'S1'},
    });
    expect(f.from).toHaveBeenCalledWith('profiles');
    expect(f.eq).toHaveBeenCalledWith('id', ALICE);
  });

  it('takes the role from the database profile, never from user-editable token metadata', async () => {
    const f = fake({session: session(ALICE, {role: 'faculty'}), profile: profile({role: 'student'})});
    const a = createAuth(f.client);
    await settled(a);
    expect((a.getState() as {user: {role: string}}).user.role).toBe('student');
  });

  it('falls back to the least-privileged role if the profile cannot be read', async () => {
    const f = fake({session: session(ALICE, {role: 'faculty', full_name: 'Alice'}), profileError: true});
    const a = createAuth(f.client);
    await settled(a);
    expect(a.getState()).toMatchObject({status: 'signedIn', user: {role: 'student', fullName: 'Alice'}});
  });

  it('gives people without a picture an initials badge instead of a broken image', async () => {
    const f = fake({session: session(), profile: profile({avatar_url: null})});
    const a = createAuth(f.client);
    await settled(a);
    const {user} = a.getState() as {user: {avatarUrl: string}};
    expect(user.avatarUrl).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(user.avatarUrl)).toContain('AW');
  });

  it('uses the Google profile picture when there is one', async () => {
    const f = fake({session: session(ALICE, {picture: 'https://lh3.example/a.png'}), profile: profile()});
    const a = createAuth(f.client);
    await settled(a);
    expect((a.getState() as {user: {avatarUrl: string}}).user.avatarUrl).toBe('https://lh3.example/a.png');
  });
});

describe('auth state changes', () => {
  it('signs out when Supabase says so', async () => {
    const f = fake({session: session(), profile: profile()});
    const a = createAuth(f.client);
    await settled(a);
    f.emit('SIGNED_OUT', null);
    await vi.waitFor(() => expect(a.getState()).toEqual({status: 'signedOut'}));
  });

  it('notifies subscribers, and stops when they unsubscribe', async () => {
    const f = fake({session: session(), profile: profile()});
    const a = createAuth(f.client);
    const listener = vi.fn();
    const off = a.subscribe(listener);
    await settled(a);
    expect(listener).toHaveBeenCalled();
    off();
    listener.mockClear();
    f.emit('SIGNED_OUT', null);
    await new Promise((r) => setTimeout(r, 10));
    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores token refreshes and repeated sign-ins of the same person (no reload, no flicker)', async () => {
    const f = fake({session: session(), profile: profile()});
    const a = createAuth(f.client);
    await settled(a);
    const calls = f.from.mock.calls.length;
    f.emit('TOKEN_REFRESHED', session());
    f.emit('SIGNED_IN', session());
    await new Promise((r) => setTimeout(r, 10));
    expect(f.from.mock.calls.length).toBe(calls);
  });

  it('switches to a different person who signs in', async () => {
    const f = fake({session: session(), profile: profile()});
    const a = createAuth(f.client);
    await settled(a);
    f.emit('SIGNED_IN', session(BOB));
    await vi.waitFor(() => expect((a.getState() as {user: {id: string}}).user.id).toBe(BOB));
  });

  it('reloads the profile when it is updated', async () => {
    const f = fake({session: session(), profile: profile()});
    const a = createAuth(f.client);
    await settled(a);
    const calls = f.from.mock.calls.length;
    f.emit('USER_UPDATED', session());
    await vi.waitFor(() => expect(f.from.mock.calls.length).toBeGreaterThan(calls));
  });
});

describe('signing in and out', () => {
  it('trims the email and reports success as no error', async () => {
    const f = fake();
    const a = createAuth(f.client);
    expect(await a.signInWithPassword('  alice@example.edu ', 'pw')).toEqual({error: null});
    expect(f.auth.signInWithPassword).toHaveBeenCalledWith({email: 'alice@example.edu', password: 'pw'});
  });

  it.each([
    ['Invalid login credentials', /wrong email or password/i],
    ['Email not confirmed', /confirm your email/i],
    ['User already registered', /already exists/i],
    ['Email rate limit exceeded', /too many attempts/i],
    ['TypeError: Failed to fetch', /could not reach/i],
    ['Password should be at least 8 characters.', /at least 8/],
  ])('turns the Supabase message %j into something friendly', async (message, expected) => {
    const f = fake();
    f.auth.signInWithPassword.mockResolvedValueOnce({error: {message}} as never);
    const a = createAuth(f.client);
    expect((await a.signInWithPassword('a@b.edu', 'x')).error).toMatch(expected);
  });

  it('creates an account with the sign-up details as metadata', async () => {
    const f = fake();
    const a = createAuth(f.client);
    const result = await a.signUp({email: 'a@b.edu', password: 'longenough', fullName: ' Alice W ', institution: 'EAU', studentId: 'S1', role: 'researcher'});
    expect(result).toEqual({error: null, needsConfirmation: true});
    expect(f.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({email: 'a@b.edu', options: expect.objectContaining({data: {full_name: 'Alice W', institution: 'EAU', student_id: 'S1', role: 'researcher'}})}),
    );
  });

  it('never asks to be faculty when signing up', async () => {
    const f = fake();
    const a = createAuth(f.client);
    await a.signUp({email: 'a@b.edu', password: 'longenough', fullName: 'A', role: 'faculty' as never});
    const data = (f.auth.signUp.mock.calls[0] as unknown as [{options: {data: {role: string}}}])[0].options.data;
    expect(data.role).toBe('student');
  });

  it('does not need a confirmation when Supabase signs the new user straight in', async () => {
    const f = fake();
    f.auth.signUp.mockResolvedValueOnce({data: {session: session()}, error: null} as never);
    const a = createAuth(f.client);
    expect((await a.signUp({email: 'a@b.edu', password: 'longenough', fullName: 'A'})).needsConfirmation).toBe(false);
  });

  it('starts Google sign-in and the email link, returning here afterwards', async () => {
    const f = fake();
    const a = createAuth(f.client);
    await a.signInWithGoogle();
    expect(f.auth.signInWithOAuth).toHaveBeenCalledWith({provider: 'google', options: {redirectTo: window.location.origin}});
    await a.signInWithMagicLink(' a@b.edu ');
    expect(f.auth.signInWithOtp).toHaveBeenCalledWith({email: 'a@b.edu', options: {emailRedirectTo: window.location.origin}});
  });

  it('signs out locally even if the network call fails', async () => {
    const f = fake({session: session(), profile: profile()});
    f.auth.signOut.mockRejectedValueOnce(new Error('offline'));
    const a = createAuth(f.client);
    await settled(a);
    await a.signOut();
    expect(a.getState()).toEqual({status: 'signedOut'});
  });

  it('hands out the current access token', async () => {
    const f = fake({session: session()});
    const a = createAuth(f.client);
    expect(await a.getAccessToken()).toBe(`token-for-${ALICE}`);
  });
});

describe('when the sign-in service does not answer', () => {
  const never = () => new Promise<never>(() => {});

  it('gives up after the timeout with a message instead of waiting forever', async () => {
    vi.useFakeTimers();
    try {
      const f = fake();
      f.auth.signInWithPassword.mockImplementation(never);
      f.auth.signUp.mockImplementation(never);
      f.auth.signInWithOtp.mockImplementation(never);
      f.auth.signInWithOAuth.mockImplementation(never);
      const a = createAuth(f.client, {timeoutMs: 1000});
      const results = Promise.all([
        a.signInWithPassword('alice@example.edu', 'pw'),
        a.signUp({email: 'alice@example.edu', password: 'longenough', fullName: 'Alice'}),
        a.signInWithMagicLink('alice@example.edu'),
        a.signInWithGoogle(),
      ]);
      await vi.advanceTimersByTimeAsync(1000);
      const [signIn, signUp, link, google] = await results;
      for (const r of [signIn, signUp, link, google]) expect(r.error).toMatch(/could not reach the sign-in service/i);
      expect(signUp.needsConfirmation).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a failed request (for example no network) the same way', async () => {
    const f = fake();
    f.auth.signInWithPassword.mockRejectedValue(new TypeError('Failed to fetch'));
    const a = createAuth(f.client);
    expect((await a.signInWithPassword('alice@example.edu', 'pw')).error).toMatch(/could not reach the sign-in service/i);
  });

  it('still returns the real answer when it arrives in time', async () => {
    const f = fake();
    f.auth.signInWithPassword.mockResolvedValue({error: {message: 'Invalid login credentials', status: 400}} as never);
    const a = createAuth(f.client, {timeoutMs: 1000});
    expect((await a.signInWithPassword('alice@example.edu', 'wrong')).error).toBe('Wrong email or password.');
  });
});

describe('initialsAvatar', () => {
  it('uses up to two initials and copes with odd names', () => {
    expect(decodeURIComponent(initialsAvatar('Alice Wanjiru Otieno'))).toContain('>AW<');
    expect(decodeURIComponent(initialsAvatar('madonna'))).toContain('>M<');
    expect(decodeURIComponent(initialsAvatar(''))).toContain('>?<');
    expect(decodeURIComponent(initialsAvatar('<script> x'))).not.toContain('<script');
  });
});
