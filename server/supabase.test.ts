import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ create: vi.fn(), reply: { data: null as unknown, error: null as null | { code: string }, status: 200 } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: fake.create }));
import { backend } from './supabase';
import { config, tokens } from './test-fixture';

beforeEach(() => {
  fake.reply = { data: null, error: null, status: 200 }; fake.create.mockReset();
  fake.create.mockImplementation(() => ({ rpc: () => ({ abortSignal: async () => fake.reply }) }));
});
afterEach(() => vi.unstubAllGlobals());
it('vault uses server key but all business RPCs pin a user JWT with publishable key', async () => {
  const api = backend(config); await api.read('TEST_ONLY_HASH');
  await api.rpc(tokens().access_token, 'get_workspace', {});
  expect(fake.create.mock.calls[0][1]).toBe(config.secret); expect(fake.create.mock.calls[1][1]).toBe(config.publishable);
  expect(await fake.create.mock.calls[1][2].accessToken()).toBe(tokens().access_token);
  expect(fake.create.mock.calls[1][2].auth.persistSession).toBe(false);
});
it('token exchange derives expiry and drops unnecessary provider/profile fields', async () => {
  const value = { ...tokens(), expires_at: undefined, expires_in: 3600, provider_token: 'TEST_ONLY_NOT_A_TOKEN', user: { id: tokens().user.id, email: 'fake@example.test' } };
  const network = vi.fn().mockResolvedValue(new Response(JSON.stringify(value))); vi.stubGlobal('fetch', network);
  const result = await backend(config).exchange('TEST_ONLY_NOT_A_CODE', 'TEST_ONLY_NOT_A_VERIFIER');
  expect(Object.keys(result).sort()).toEqual(['access_token', 'expires_at', 'refresh_token', 'user']);
  expect(Object.keys(result.user)).toEqual(['id']); expect(result.expires_at).toBeGreaterThan(Date.now() / 1000);
  expect(network.mock.calls[0][1].redirect).toBe('error'); expect(network.mock.calls[0][1].cache).toBe('no-store');
});
it.each([[400, 401], [401, 401], [403, 401], [422, 401], [429, 503], [500, 503]])('maps auth HTTP %i to safe status %i', async (upstream, expected) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('TEST_ONLY_RAW_ERROR', { status: upstream })));
  await expect(backend(config).refresh('TEST_ONLY_NOT_A_TOKEN')).rejects.toMatchObject({ status: expected });
});
it('preserves retry semantics for serialization failures and hides backend errors', async () => {
  const api = backend(config); fake.reply = { data: null, error: { code: '40001' }, status: 400 };
  await expect(api.rpc('TEST_ONLY', 'apply_event', {})).rejects.toMatchObject({ status: 503, kind: 'retry' });
  fake.reply.error = { code: '42501' }; fake.reply.status = 403;
  await expect(api.rpc('TEST_ONLY', 'get_workspace', {})).rejects.toMatchObject({ status: 403, kind: 'forbidden' });
});