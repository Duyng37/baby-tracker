import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); vi.stubEnv('PROD', true); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function setup() {
  const worker = Object.assign(new EventTarget(), { state: 'installing' });
  const registration = Object.assign(new EventTarget(), {
    installing: worker, waiting: null as null | typeof worker, active: null as null | typeof worker,
  });
  const register = vi.fn().mockResolvedValue(registration);
  vi.stubGlobal('navigator', { serviceWorker: { register, ready: new Promise(() => {}) } });
  return { registration, worker, register };
}
it('registers only in production with an uncached worker update check', async () => {
  const app = setup(), api = await import('./register');
  await api.registerOfflineShell();
  expect(app.register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
  expect(api.offlineStatus()).toBe('preparing');
  app.registration.active = app.worker; app.worker.state = 'activated';
  app.worker.dispatchEvent(new Event('statechange'));
  expect(api.offlineStatus()).toBe('ready');
});
it.each(['development', 'unsupported'])('does not register in %s', async mode => {
  const app = setup();
  if (mode === 'development') vi.stubEnv('PROD', false); else vi.stubGlobal('navigator', {});
  const api = await import('./register'); await api.registerOfflineShell();
  expect(api.offlineStatus()).toBe('unsupported'); expect(app.register).not.toHaveBeenCalled();
});
it('notifies subscribers of a waiting version without forcibly activating it', async () => {
  const app = setup(), api = await import('./register'), listener = vi.fn();
  const stop = api.subscribeOfflineStatus(listener); await api.registerOfflineShell();
  app.registration.active = app.worker; app.registration.waiting = app.worker;
  app.worker.dispatchEvent(new Event('statechange'));
  expect(listener).toHaveBeenLastCalledWith('update');
  stop(); listener.mockClear(); app.worker.dispatchEvent(new Event('statechange'));
  expect(listener).not.toHaveBeenCalled();
});
it('reports a failed first install and registration errors without a false ready status', async () => {
  const app = setup(), api = await import('./register'); await api.registerOfflineShell();
  app.worker.state = 'redundant'; app.worker.dispatchEvent(new Event('statechange'));
  expect(api.offlineStatus()).toBe('error');
  app.register.mockRejectedValueOnce(new Error('network failure'));
  await api.registerOfflineShell(); expect(api.offlineStatus()).toBe('error');
});