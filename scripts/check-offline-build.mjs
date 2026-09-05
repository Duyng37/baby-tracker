// Production-artifact smoke test: loopback HTTP + Node VM, not a real-browser SW test.
// Uses no auth, cookies, environment values or production data; prints counts/pass-fail only.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { runInNewContext } from 'node:vm';

const root = new URL('../dist/', import.meta.url);
const mime = path => path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css'
  : path.endsWith('.png') ? 'image/png' : path.endsWith('.webmanifest') ? 'application/manifest+json' : 'text/html';
let server;
try {
  const files = readdirSync(root, { recursive: true }).map(path => path.replaceAll('\\', '/'));
  const assets = files.filter(path => /^(assets\/.*\.(js|css)|icons\/noi-[0-9]+\.png)$/.test(path));
  assert(assets.some(path => /\/Account-.*\.js$/.test(path)));
  assert.equal(assets.filter(path => path.endsWith('.png')).length, 3);
  const expected = new Set(['/index.html', '/manifest.webmanifest', ...assets.map(path => `/${path}`)]);
  server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const file = path === '/' ? 'index.html' : path.slice(1);
    if (!files.includes(file) || !/\.(js|css|html|png|webmanifest)$/.test(file)) {
      response.writeHead(404).end(); return;
    }
    response.writeHead(200, { 'Content-Type': mime(file) });
    response.end(readFileSync(new URL(file, root)));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const buckets = new Map(), handlers = new Map();
  const key = value => new URL(typeof value === 'string' ? value : value.url, origin).href;
  let offline = false, networkRequests = 0, claimed = false;
  const caches = {
    open: async name => {
      if (!buckets.has(name)) buckets.set(name, new Map());
      const bucket = buckets.get(name);
      return { put: async (value, response) => bucket.set(key(value), response.clone()),
        match: async value => bucket.get(key(value))?.clone() };
    },
    keys: async () => [...buckets.keys()], delete: async name => buckets.delete(name),
  };
  const workerFetch = async (input, options) => {
    if (offline) throw new Error('simulated offline');
    const url = new URL(key(input));
    assert.equal(url.origin, origin); assert.equal(url.search, ''); assert(expected.has(url.pathname));
    networkRequests++;
    return fetch(url, options);
  };
  const self = { location: new URL(origin), clients: { claim: async () => { claimed = true; } },
    addEventListener: (name, handler) => handlers.set(name, handler) };
  const worker = readFileSync(new URL('sw.js', root), 'utf8');
  assert(!worker.includes('__NOI_')); assert(worker.includes('noi-shell-v1-'));
  runInNewContext(worker, { self, caches, fetch: workerFetch, URL, Response, AbortSignal });
  const lifecycle = name => {
    let pending; handlers.get(name)({ waitUntil: promise => { pending = promise; } }); return pending;
  };
  const request = (path, mode = 'cors') => {
    let pending;
    handlers.get('fetch')({ request: { url: new URL(path, origin).href, mode, method: 'GET' },
      respondWith: promise => { pending = promise; } });
    return pending;
  };
  await lifecycle('install'); await lifecycle('activate');
  assert(claimed); assert.equal(buckets.size, 1); assert.equal(networkRequests, expected.size);
  const cached = [...buckets.values()][0];
  assert.deepEqual(new Set([...cached.keys()].map(url => new URL(url).pathname)), expected);
  offline = true;
  const shell = await request('/?auth=failed', 'navigate');
  assert.equal(await shell.text(), readFileSync(new URL('index.html', root), 'utf8'));
  for (const asset of assets) {
    const response = await request(`/${asset}`);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(new URL(asset, root)));
  }
  for (const path of ['/api/auth?action=session', '/api/auth?action=callback', '/api/rpc', 'https://external.test/']) {
    assert.equal(request(path, 'navigate'), undefined);
  }
  assert.equal(networkRequests, expected.size);
  const headers = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).headers;
  assert(headers.find(rule => rule.source === '/sw.js').headers.some(header => header.key === 'Cache-Control' && header.value.includes('no-cache')));
  assert(headers.find(rule => rule.source === '/api/(.*)').headers.some(header => header.key === 'Cache-Control' && header.value.includes('no-store')));
  console.log(`PASS: production shell (${expected.size} files) fetched via loopback HTTP; offline HTML/lazy chunks/icons match; API bypass and cache headers verified. Node VM only.`);
} catch {
  console.error('FAIL: production offline-shell check. No raw response/config/user data logged.');
  process.exitCode = 1;
} finally {
  if (server?.listening) {
    const closed = new Promise(resolve => server.close(resolve));
    server.closeAllConnections(); await closed;
  }
}