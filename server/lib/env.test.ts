import {describe, expect, it} from 'vitest';
import {EnvError, loadEnv} from './env';

describe('loadEnv', () => {
  it('applies defaults when only the API key is set', () => {
    const env = loadEnv({GROQ_API_KEY: 'abc123'});
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3001,
      MAX_UPLOAD_MB: 50,
      JSON_BODY_LIMIT: '2mb',
      RATE_LIMIT_PER_MINUTE: 60,
      CORS_ORIGINS: [],
      TRUST_PROXY: 0,
      LOG_LEVEL: 'info',
    });
  });

  it('fails fast when GROQ_API_KEY is missing', () => {
    expect(() => loadEnv({})).toThrow(EnvError);
    expect(() => loadEnv({})).toThrow(/GROQ_API_KEY/);
  });

  it('rejects the placeholder key from .env.example', () => {
    expect(() => loadEnv({GROQ_API_KEY: 'MY_GROQ_API_KEY'})).toThrow(/placeholder/);
  });

  it('treats empty values as unset so defaults apply', () => {
    const env = loadEnv({GROQ_API_KEY: 'k', PORT: '', CORS_ORIGINS: '', APP_URL: ''});
    expect(env.PORT).toBe(3001);
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.APP_URL).toBeUndefined();
  });

  it('parses and coerces optional settings', () => {
    const env = loadEnv({
      GROQ_API_KEY: 'k',
      PORT: '8080',
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://a.example, https://b.example',
      MAX_UPLOAD_MB: '25',
      TRUST_PROXY: '1',
    });
    expect(env.PORT).toBe(8080);
    expect(env.NODE_ENV).toBe('production');
    expect(env.CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
    expect(env.MAX_UPLOAD_MB).toBe(25);
    expect(env.TRUST_PROXY).toBe(1);
  });

  it('reports every problem and never echoes secret values', () => {
    const secret = 'super-secret-value';
    try {
      loadEnv({GROQ_API_KEY: secret, PORT: 'not-a-number', LOG_LEVEL: 'loud'});
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      const {message, problems} = err as EnvError;
      expect(problems.length).toBeGreaterThanOrEqual(2);
      expect(message).toMatch(/PORT/);
      expect(message).toMatch(/LOG_LEVEL/);
      expect(message).not.toContain(secret);
    }
  });
});
