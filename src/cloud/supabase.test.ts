import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Explicitly fabricated values; no environment files or real credentials in assertions.
const fake = vi.hoisted(() => ({
  session: { user: { id: 'account-a' }, expires_at: 9_000_000_000, access_token: 'TEST_ONLY_NOT_A_TOKEN' },
  create: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: fake.create }));
beforeEach(() => {
  vi.resetModules(); fake.create.mockReset();
  fake.session = { user: { id: 'account-a' }, expires_at: 9_000_000_000, access_token: 'TEST_ONLY_NOT_A_TOKEN' };
  fake.create.mockImplementation(() => ({ auth: { getSession: async () => ({ data: { session: fake.session }, error: null }) } }));
  vi.stubEnv('VITE_SUPABASE_URL', 'https://unit-test-placeholder.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_TEST_ONLY_NOT_A_KEY');
});
afterEach(() => vi.unstubAllEnvs());

it('pins the session token for a run instead of following a changed shared account', async () => {
  const { authenticatedTransport } = await import('./supabase');
  const api = await authenticatedTransport('account-a');
  const options = fake.create.mock.calls[1][2];
  fake.session = { ...fake.session, user: { id: 'account-b' }, access_token: 'OTHER_TEST_ONLY_NOT_A_TOKEN' };
  expect(api.userId).toBe('account-a');
  expect(await options.accessToken()).toBe('TEST_ONLY_NOT_A_TOKEN');
});
it('refuses a different account before constructing a scoped RPC client', async () => {
  const { authenticatedTransport } = await import('./supabase');
  await expect(authenticatedTransport('account-b')).rejects.toMatchObject({ kind: 'auth' });
  expect(fake.create).toHaveBeenCalledTimes(1);
});
it('expired sessions cannot send pending operations', async () => {
  const { authenticatedTransport } = await import('./supabase'); fake.session.expires_at = 1;
  await expect(authenticatedTransport('account-a')).rejects.toMatchObject({ kind: 'auth' });
});
it('rejects non-publishable config without constructing any client', async () => {
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'NOT_A_PUBLISHABLE_KEY');
  const { supabase } = await import('./supabase'); expect(supabase).toBeNull(); expect(fake.create).not.toHaveBeenCalled();
});