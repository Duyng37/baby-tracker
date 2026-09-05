import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const network = vi.fn();
const projectId = 'unit-test-placeholder.supabase.co';
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
beforeEach(() => {
  vi.resetModules(); network.mockReset(); vi.stubGlobal('fetch', network);
  vi.stubEnv('VITE_SUPABASE_URL', `https://${projectId}`);
  network.mockImplementation(async () => response({ userId: 'account-a', projectId }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('pins account and project on every RPC without a browser bearer token', async () => {
  const { authenticatedTransport } = await import('./supabase');
  const api = await authenticatedTransport('account-a');
  network.mockResolvedValue(response({ data: { ok: true } }));
  await api.rpc('get_workspace', {}, new AbortController().signal);
  const [path, options] = network.mock.calls[1];
  expect(path).toBe('/api/rpc');
  expect(JSON.parse(options.body)).toEqual({ name: 'get_workspace', args: {}, userId: 'account-a', projectId });
  expect(options.credentials).toBe('same-origin'); expect(options.cache).toBe('no-store');
  expect(options.headers).toEqual({ 'X-Noi-Client': '1', 'Content-Type': 'application/json' });
});
it('refuses a different account before constructing a transport', async () => {
  const { authenticatedTransport } = await import('./supabase');
  await expect(authenticatedTransport('account-b')).rejects.toMatchObject({ kind: 'auth' });
  expect(network).toHaveBeenCalledTimes(1);
});
it('expired sessions cannot send pending operations', async () => {
  network.mockResolvedValue(response({ error: 'auth' }, 401));
  const { authenticatedTransport, getSession } = await import('./supabase');
  expect(await getSession()).toBeNull();
  await expect(authenticatedTransport('account-a')).rejects.toMatchObject({ kind: 'auth' });
});
it('does not mistake an outage for a confirmed logout', async () => {
  network.mockResolvedValue(response({ error: 'retry' }, 503));
  const { getSession } = await import('./supabase');
  await expect(getSession()).rejects.toMatchObject({ kind: 'retry' });
});
it('rejects mismatched server project before opening any local account', async () => {
  network.mockResolvedValue(response({ userId: 'account-a', projectId: 'other.supabase.co' }));
  const { getSession } = await import('./supabase');
  await expect(getSession()).rejects.toMatchObject({ kind: 'retry' });
});
it('rechecks auth after server rejects account switch during an RPC', async () => {
  const { authenticatedTransport, authEvents } = await import('./supabase');
  const api = await authenticatedTransport('account-a'); const recheck = vi.fn();
  authEvents.addEventListener('recheck', recheck);
  network.mockResolvedValue(response({ error: 'account_changed' }, 409));
  await expect(api.rpc('get_workspace', {}, new AbortController().signal)).rejects.toMatchObject({ kind: 'auth' });
  expect(recheck).toHaveBeenCalledOnce();
});
it('logout only hides the local account after the server confirms revocation', async () => {
  const { signOut, authEvents } = await import('./supabase'); const listener = vi.fn();
  authEvents.addEventListener('signed-out', listener);
  network.mockRejectedValueOnce(new Error('offline'));
  await expect(signOut()).rejects.toThrow(); expect(listener).not.toHaveBeenCalled();
  network.mockResolvedValueOnce(response({ ok: true }));
  await signOut(); expect(listener).toHaveBeenCalledOnce();
});
it('OAuth starts at the server without forced Google login prompts', async () => {
  const assign = vi.fn(); vi.stubGlobal('window', { location: { assign } });
  const url = `https://${projectId}/auth/v1/authorize?provider=google`;
  network.mockResolvedValue(response({ url }));
  const { signIn } = await import('./supabase'); await signIn();
  expect(network.mock.calls[0][0]).toBe('/api/auth?action=start');
  expect(network.mock.calls[0][1].method).toBe('POST'); expect(assign).toHaveBeenCalledWith(url);
});
it('rejects unexpected OAuth origins and invalid frontend config', async () => {
  network.mockResolvedValue(response({ url: 'https://untrusted.invalid/' }));
  const { signIn } = await import('./supabase'); await expect(signIn()).rejects.toMatchObject({ kind: 'auth' });
  vi.resetModules(); vi.stubEnv('VITE_SUPABASE_URL', 'http://untrusted.invalid');
  const { configured } = await import('./supabase'); expect(configured).toBe(false);
});