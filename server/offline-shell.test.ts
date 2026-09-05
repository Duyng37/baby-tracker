import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { offlineShell } from './offline-shell';

const origin = 'https://app.test';
const files = ['/index.html', '/assets/main-a.js', '/assets/Account-a.js', '/assets/main-a.css', '/manifest.webmanifest'];
const cacheName = 'noi-shell-v1-test';
function fixture() {
  const buckets = new Map<string, Map<string, Response>>();
  const key = (value: string | { url: string }) => new URL(typeof value === 'string' ? value : value.url, origin).href;
  const caches = {
    open: vi.fn(async (name: string) => {
      if (!buckets.has(name)) buckets.set(name, new Map());
      const bucket = buckets.get(name)!;
      return { put: async (url: string, response: Response) => { bucket.set(key(url), response.clone()); },
        match: async (url: string | { url: string }) => bucket.get(key(url))?.clone() };
    }),
    keys: async () => [...buckets.keys()], delete: vi.fn(async (name: string) => buckets.delete(name)),
  };
  const fetch = vi.fn(async (input: string | { url: string }) => {
    const path = new URL(key(input)).pathname;
    const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css'
      : path.endsWith('.webmanifest') ? 'application/manifest+json' : 'text/html';
    return new Response(`public-shell:${path}`, { headers: { 'Content-Type': type } });
  });
  const handlers = new Map<string, (event: unknown) => void>();
  const self = { location: new URL(origin), clients: { claim: vi.fn(async () => {}) },
    addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler) };
  const source = readFileSync(new URL('../src/pwa/worker.js', import.meta.url), 'utf8')
    .replace('__NOI_CACHE__', JSON.stringify(cacheName)).replace('__NOI_FILES__', JSON.stringify(files));
  runInNewContext(source, { self, caches, fetch, URL, Response, AbortSignal });
  function lifecycle(name: string) {
    let pending!: Promise<void>; handlers.get(name)!({ waitUntil: (promise: Promise<void>) => { pending = promise; } }); return pending;
  }
  function request(path: string, mode = 'cors', method = 'GET') {
    let pending: Promise<Response> | undefined;
    handlers.get('fetch')!({ request: { url: new URL(path, origin).href, mode, method }, respondWith: (promise: Promise<Response>) => { pending = promise; } });
    return pending;
  }
  return { buckets, caches, fetch, self, lifecycle, request };
}
it('preloads the entire static shell including lazy Account before offline use', async () => {
  const app = fixture(); await app.lifecycle('install');
  expect(app.fetch).toHaveBeenCalledTimes(files.length);
  expect(app.fetch).toHaveBeenCalledWith('/index.html', { cache: 'reload', credentials: 'omit', redirect: 'error' });
  app.fetch.mockRejectedValue(new Error('offline'));
  expect(await (await app.request('/', 'navigate'))!.text()).toBe('public-shell:/index.html');
  expect(await (await app.request('/assets/Account-a.js'))!.text()).toBe('public-shell:/assets/Account-a.js');
  expect(app.buckets.get(cacheName)?.size).toBe(files.length);
});
it('never intercepts Auth/RPC, external origins, unknown assets or POSTs', async () => {
  const app = fixture(); await app.lifecycle('install');
  for (const path of ['/api/auth?action=session', '/api/auth?action=callback&code=TEST_ONLY', '/api/rpc', '/unknown.js', 'https://external.test/assets/main-a.js']) {
    expect(app.request(path, 'navigate')).toBeUndefined();
  }
  expect(app.request('/index.html', 'navigate', 'POST')).toBeUndefined();
  expect(app.request('/assets/main-a.js?unexpected=1')).toBeUndefined();
});
it('keeps navigation on the installed version and never fetches or caches query-bearing responses', async () => {
  const app = fixture(); await app.lifecycle('install');
  app.fetch.mockClear();
  app.fetch.mockResolvedValueOnce(new Response('do-not-cache-query-response', { status: 200 }));
  expect(await (await app.request('/?auth=failed', 'navigate'))!.text()).toBe('public-shell:/index.html');
  app.fetch.mockResolvedValueOnce(new Response('outage', { status: 503 }));
  expect(await (await app.request('/', 'navigate'))!.text()).toBe('public-shell:/index.html');
  expect(app.fetch).not.toHaveBeenCalled();
  expect(app.buckets.get(cacheName)?.size).toBe(files.length);
});
it('falls back to uncached network only when shell is missing, and fails closed offline', async () => {
  const app = fixture(); await app.lifecycle('install'); app.buckets.get(cacheName)!.clear();
  expect(await (await app.request('/', 'navigate'))!.text()).toBe('public-shell:/');
  expect(app.fetch).toHaveBeenLastCalledWith(expect.objectContaining({ url: `${origin}/` }), { signal: expect.any(AbortSignal) });
  app.fetch.mockRejectedValue(new Error('offline'));
  expect((await app.request('/', 'navigate'))!.type).toBe('error');
  expect(app.buckets.get(cacheName)?.size).toBe(0);
});
it('does not install a partial shell on network errors or an HTML page in place of a script', async () => {
  const failed = fixture(); failed.fetch.mockRejectedValueOnce(new Error('offline'));
  await expect(failed.lifecycle('install')).rejects.toThrow(); expect(failed.buckets.size).toBe(0);
  const wrong = fixture(); wrong.fetch.mockResolvedValue(new Response('login-page', { headers: { 'Content-Type': 'text/html' } }));
  await expect(wrong.lifecycle('install')).rejects.toThrow('App shell'); expect(wrong.buckets.size).toBe(0);
});
it('activation removes only older app-shell versions, not unrelated caches or IndexedDB', async () => {
  const app = fixture(); await app.lifecycle('install');
  app.buckets.set('noi-shell-v1-old', new Map()); app.buckets.set('another-app', new Map());
  await app.lifecycle('activate');
  expect(app.caches.delete).toHaveBeenCalledExactlyOnceWith('noi-shell-v1-old');
  expect(app.buckets.has(cacheName)).toBe(true); expect(app.buckets.has('another-app')).toBe(true);
  expect(app.self.clients.claim).toHaveBeenCalledOnce();
});
it('build plugin includes emitted shell chunks, excludes API/maps, and changes cache version with content', () => {
  const build = (html: string) => {
    const emitFile = vi.fn();
    const bundle = { 'index.html': { type: 'asset', source: html }, 'assets/main-a.js': { type: 'chunk', code: 'main' },
      'assets/Account-a.js': { type: 'chunk', code: 'lazy account' }, 'assets/main-a.js.map': { type: 'asset', source: 'map' },
      'api/auth.js': { type: 'chunk', code: 'not-public' } };
    // Minimal build fixture: the plugin only needs emitFile and emitted source/code.
    const hook = offlineShell().generateBundle as unknown as { handler: (this: { emitFile: typeof emitFile }, options: unknown, bundle: unknown, isWrite: boolean) => void };
    hook.handler.call({ emitFile }, {}, bundle, false);
    return emitFile.mock.calls[0][0].source as string;
  };
  const one = build('<html>one</html>'), two = build('<html>two</html>');
  expect(one).toContain('/assets/Account-a.js'); expect(one).toContain('/manifest.webmanifest');
  expect(one).not.toContain('api/auth.js'); expect(one).not.toContain('.js.map');
  expect(one.match(/noi-shell-v1-[a-f0-9]+/)![0]).not.toBe(two.match(/noi-shell-v1-[a-f0-9]+/)![0]);
  expect(one).not.toContain('__NOI_');
});