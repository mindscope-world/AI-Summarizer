import {describe, expect, it} from 'vitest';
import {isAuthRedirect} from './supabase';

describe('isAuthRedirect', () => {
  it('recognises the return leg of sign-in links', () => {
    expect(isAuthRedirect({hash: '#access_token=abc&refresh_token=x&type=signup', search: ''})).toBe(true); // email confirmation
    expect(isAuthRedirect({hash: '#access_token=abc&type=magiclink', search: ''})).toBe(true); // magic link
    expect(isAuthRedirect({hash: '', search: '?code=123'})).toBe(true); // PKCE (Google)
    expect(isAuthRedirect({hash: '', search: '?token_hash=abc&type=email'})).toBe(true);
  });

  it('ignores ordinary visits', () => {
    expect(isAuthRedirect({hash: '', search: ''})).toBe(false);
    expect(isAuthRedirect({hash: '#features', search: '?ref=newsletter'})).toBe(false);
    expect(isAuthRedirect({hash: '', search: '?barcode=1'})).toBe(false);
  });
});
