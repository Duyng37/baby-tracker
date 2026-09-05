import { createServer, type Server } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { handler } from './http';
import { Sessions } from './session';
import { config, fixture, id, user } from './test-fixture';
import { cookieName } from './security';

const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }))); });
async function setup() {
  const db = fixture(); const sessions = new Sessions(config, db);
  const server = createServer(handler(() => config, () => sessions)); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('test listener');
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Origin: config.origin, 'X-Noi-Client': '1', 'Content-Type': 'application/json', Cookie: `${cookieName(config, 'session')}=${id}` };
  return { db, sessions, base, headers };
}
it('session endpoint returns only account metadata and cannot be cached', async () => {
  const { base, headers } = await setup();
  const response = await fetch(`${base}/api/auth?action=session`, { headers });
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ userId: user, projectId: new URL(config.url).hostname });
  expect(response.headers.get('cache-control')).toContain('no-store'); expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
});
it('blocks cross-origin requests, missing origin, missing marker, and preflight', async () => {
  const { base, headers, db } = await setup();
  for (const custom of [{ ...headers, Origin: 'https://untrusted.invalid' }, { ...headers, Origin: '' }, { ...headers, 'X-Noi-Client': '' }]) {
    const response = await fetch(`${base}/api/auth?action=logout`, { method: 'POST', headers: custom });
    expect(response.status).toBe(403); expect(response.headers.get('access-control-allow-origin')).toBeNull();
  }
  expect((await fetch(`${base}/api/auth?action=start`, { method: 'OPTIONS' })).status).toBe(405);
  expect(db.remove).not.toHaveBeenCalled();
});
it('only allowlisted business RPCs reach a user-scoped backend', async () => {
  const { base, headers, db } = await setup();
  const payload = { name: 'get_workspace', args: {}, userId: user, projectId: new URL(config.url).hostname };
  const response = await fetch(`${base}/api/rpc`, { method: 'POST', headers, body: JSON.stringify(payload) });
  expect(response.status).toBe(200); expect(db.rpc).toHaveBeenCalledOnce(); expect(db.rpc.mock.calls[0][1]).toBe('get_workspace');
  for (const override of [{ name: 'bff_session_read' }, { name: 'unlisted' }, { userId: undefined }, { projectId: 'wrong' }, { args: [] }]) {
    const result = await fetch(`${base}/api/rpc`, { method: 'POST', headers, body: JSON.stringify({ ...payload, ...override }) });
    expect(result.status).toBe(400);
  }
  expect(db.rpc).toHaveBeenCalledOnce();
});
it('rejects an account change before forwarding a pending mutation', async () => {
  const { base, headers, db } = await setup();
  const response = await fetch(`${base}/api/rpc`, { method: 'POST', headers,
    body: JSON.stringify({ name: 'apply_event', args: {}, userId: '22222222-2222-4222-8222-222222222222', projectId: new URL(config.url).hostname }) });
  expect(response.status).toBe(409); expect(db.rpc).not.toHaveBeenCalled();
});
it('callback consumes code then redirects to a clean path with HttpOnly session cookie', async () => {
  const { base, sessions } = await setup(); const start = sessions.start();
  const response = await fetch(`${base}/api/auth?action=callback&code=TEST_ONLY_NOT_A_CODE`, { redirect: 'manual', headers: { Cookie: start.cookie.split(';')[0] } });
  expect(response.status).toBe(303); expect(response.headers.get('location')).toBe('/');
  expect(response.headers.get('set-cookie')).toContain('__Host-noi_session=');
  expect(response.headers.get('set-cookie')).toContain('HttpOnly'); expect(await response.text()).toBe('');
});
it('callback failure never forwards provider messages or codes', async () => {
  const { base, db } = await setup();
  const response = await fetch(`${base}/api/auth?action=callback&code=TEST_ONLY_NOT_A_CODE`, { redirect: 'manual' });
  expect(response.status).toBe(303); expect(response.headers.get('location')).toBe('/?auth=failed');
  expect(db.exchange).not.toHaveBeenCalled(); expect(await response.text()).toBe('');
});
it('logout deletes the server row and expires the cookie only after confirmation', async () => {
  const { base, headers, db } = await setup();
  db.remove.mockRejectedValueOnce(new Error('TEST_ONLY_RAW_ERROR'));
  const failed = await fetch(`${base}/api/auth?action=logout`, { method: 'POST', headers });
  expect(failed.status).toBe(503); expect(await failed.json()).toEqual({ error: 'retry' }); expect(failed.headers.get('set-cookie')).toBeNull();
  const ok = await fetch(`${base}/api/auth?action=logout`, { method: 'POST', headers });
  expect(ok.status).toBe(200); expect(ok.headers.get('set-cookie')).toContain('Max-Age=0');
  expect((await fetch(`${base}/api/auth?action=session`, { headers })).status).toBe(401);
});
it('rejects oversized and malformed JSON without echoing the request', async () => {
  const { base, headers } = await setup();
  for (const [body, status] of [['not-json', 400], [JSON.stringify({ value: 'x'.repeat(100 * 1024) }), 413]] as const) {
    const response = await fetch(`${base}/api/rpc`, { method: 'POST', headers, body });
    expect(response.status).toBe(status); expect(await response.json()).toEqual({ error: 'invalid' });
  }
});
it('complete HTTP login, cookie-copy restore and shared logout flow', async () => {
  const { base, headers, db } = await setup();
  const start = await fetch(`${base}/api/auth?action=start`, { method: 'POST', headers });
  expect(start.status).toBe(200);
  const callback = await fetch(`${base}/api/auth?action=callback&code=TEST_ONLY_NOT_A_CODE`, {
    redirect: 'manual', headers: { Cookie: start.headers.get('set-cookie')!.split(';')[0] },
  });
  const sessionCookie = callback.headers.getSetCookie().find(value => value.startsWith('__Host-noi_session='))!.split(';')[0];
  for (let copy = 0; copy < 2; copy++) {
    const opened = await fetch(`${base}/api/auth?action=session`, { headers: { ...headers, Cookie: sessionCookie } });
    expect(opened.status).toBe(200); expect(await opened.json()).toEqual({ userId: user, projectId: new URL(config.url).hostname });
  }
  expect(db.exchange).toHaveBeenCalledOnce();
  await fetch(`${base}/api/auth?action=logout`, { method: 'POST', headers: { ...headers, Cookie: sessionCookie } });
  const copied = await fetch(`${base}/api/auth?action=session`, { headers: { ...headers, Cookie: sessionCookie } });
  expect(copied.status).toBe(401);
});
it('malformed request URLs are sanitized rather than escaping the HTTP error boundary', async () => {
  const req = { url: 'http://[', method: 'GET', headers: {} } as Parameters<ReturnType<typeof handler>>[0];
  const res = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
  await handler(() => config)(req, res as unknown as Parameters<ReturnType<typeof handler>>[1]);
  expect(res.statusCode).toBe(400); expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'invalid' }));
});