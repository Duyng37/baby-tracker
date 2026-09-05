import { expect, it } from 'vitest';
import { configuration, cookie, cookieName, readCookie, requireMutation, seal, unseal } from './security';
import { config } from './test-fixture';

it('uses host-only, Secure, HttpOnly, Lax cookies with bounded lifetime', () => {
  const value = cookie(config, 'session', 'TEST_ONLY', 100);
  expect(value).toContain('__Host-noi_session='); expect(value).toContain('; Secure');
  expect(value).toContain('; HttpOnly'); expect(value).toContain('; SameSite=Lax'); expect(value).toContain('; Path=/');
  expect(value).not.toContain('Domain='); expect(cookie(config, 'session', '', 0)).toContain('Max-Age=0');
});
it('cookie parser fails closed on duplicate names', () => {
  const name = cookieName(config, 'session');
  expect(readCookie(`${name}=a; ${name}=b`, name)).toBe(''); expect(readCookie(`other=x; ${name}=a`, name)).toBe('a');
});
it('encryption authenticates context, ciphertext and key', () => {
  const encrypted = seal({ test: true }, config.encryptionKey, 'one');
  expect(unseal(encrypted, config.encryptionKey, 'one')).toEqual({ test: true });
  expect(() => unseal(encrypted, config.encryptionKey, 'two')).toThrow();
  expect(() => unseal(encrypted, Buffer.alloc(32, 8), 'one')).toThrow();
  const changed = Buffer.from(encrypted, 'base64url'); changed[30] ^= 1;
  expect(() => unseal(changed.toString('base64url'), config.encryptionKey, 'one')).toThrow();
});
it('CSRF requires both a fixed origin and custom header', () => {
  expect(() => requireMutation(config.origin, '1', config)).not.toThrow();
  for (const [origin, marker] of [[undefined, '1'], ['https://other.example.test', '1'], [config.origin, undefined]]) {
    expect(() => requireMutation(origin, marker, config)).toThrow();
  }
});
it('validates server-only config and prohibits insecure production origins', () => {
  const env = { NODE_ENV: 'production', APP_ORIGIN: config.origin, SUPABASE_URL: config.url,
    SUPABASE_PUBLISHABLE_KEY: config.publishable, SUPABASE_SECRET_KEY: config.secret, SESSION_ENCRYPTION_KEY: '07'.repeat(32) };
  expect(configuration(env).origin).toBe(config.origin);
  for (const override of [{ APP_ORIGIN: 'http://app.example.test' }, { APP_ORIGIN: 'http://localhost:5173' },
    { SESSION_ENCRYPTION_KEY: '' }, { SUPABASE_SECRET_KEY: config.publishable }, { VITE_SUPABASE_URL: 'https://other.supabase.co' }]) {
    expect(() => configuration({ ...env, ...override })).toThrow('configuration');
  }
});