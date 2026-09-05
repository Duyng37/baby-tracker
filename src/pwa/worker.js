/* Build-time placeholders. Only public, versioned app-shell assets enter this cache. */
const CACHE = __NOI_CACHE__;
const FILES = __NOI_FILES__;
const allowed = new Set(FILES.map(file => new URL(file, self.location.origin).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Validate every response before opening the cache; never install a partial shell.
    const responses = await Promise.all(FILES.map(async file => {
      const response = await fetch(file, { cache: 'reload', credentials: 'omit', redirect: 'error' });
      const type = response.headers.get('content-type') || '';
      const validType = file.endsWith('.js') ? /javascript/.test(type)
        : file.endsWith('.css') ? /text\/css/.test(type)
        : file.endsWith('.png') ? /image\/png/.test(type)
        : file.endsWith('.webmanifest') ? /json/.test(type) : /text\/html/.test(type);
      if (!response.ok || response.redirected || !validType) throw new Error('App shell unavailable');
      return response;
    }));
    const cache = await caches.open(CACHE);
    try { await Promise.all(FILES.map((file, index) => cache.put(file, responses[index]))); }
    catch (error) { await caches.delete(CACHE); throw error; }
    // No skipWaiting: let existing tabs finish before switching their version.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('noi-shell-v1-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    // Keep HTML and lazy chunks on the same installed version until all old tabs close.
    // Queries may contain callback errors/codes: never fetch/cache them while shell is present.
    event.respondWith((async () => {
      const shell = await (await caches.open(CACHE)).match('/index.html');
      if (shell) return shell;
      try {
        const response = await fetch(request, { signal: AbortSignal.timeout(5000) });
        if (response.ok) return response;
      } catch { /* Offline: open the public shell, not a cached authenticated response. */ }
      return Response.error();
    })());
  } else if (allowed.has(url.href)) {
    event.respondWith((async () => (await (await caches.open(CACHE)).match(request)) || fetch(request))());
  }
});