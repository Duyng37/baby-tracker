import type { IncomingMessage, ServerResponse } from 'node:http';
import { configuration, cookie, cookieName, HttpError, readCookie, requireMutation, type Config } from './security.ts';
import { Sessions } from './session.ts';
import { backend } from './supabase.ts';

type Request = IncomingMessage & { body?: unknown };
const allowedRPCs = new Set(['create_family', 'add_baby', 'get_workspace', 'create_invitation', 'list_invitations',
  'revoke_invitation', 'accept_invitation', 'remove_family_member', 'apply_event', 'pull_changes', 'rename_family', 'rename_baby',
  'report_app_bug']);
const header = (req: Request, name: string) => typeof req.headers[name] === 'string' ? req.headers[name] : undefined;
const json = (res: ServerResponse, status: number, value: unknown) => {
  res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value));
};
function redirect(res: ServerResponse, path: string) {
  res.statusCode = 303; res.setHeader('Location', path); res.end();
}
async function body(req: Request): Promise<Record<string, unknown>> {
  if (header(req, 'content-type')?.split(';')[0] !== 'application/json') throw new HttpError(415, 'invalid');
  let value = req.body;
  const limit = 96 * 1024;
  if (value === undefined) {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.from(chunk); size += bytes.length;
      if (size > limit) throw new HttpError(413, 'invalid');
      chunks.push(bytes);
    }
    try { value = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new HttpError(400, 'invalid'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'invalid');
  if (Buffer.byteLength(JSON.stringify(value)) > limit) throw new HttpError(413, 'invalid');
  return value as Record<string, unknown>;
}
// Dependency injection makes security/HTTP tests independent of env files and live credentials.
export function handler(getConfig: () => Config = configuration, createSessions = (c: Config) => new Sessions(c, backend(c))) {
  return async (req: Request, res: ServerResponse) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    let callback = false;
    try {
      let url: URL;
      try { url = new URL(req.url ?? '/', 'http://internal.invalid'); }
      catch { throw new HttpError(400, 'invalid'); }
      callback = url.pathname === '/api/auth' && url.searchParams.get('action') === 'callback' && req.method === 'GET';
      const config = getConfig();
      const sessions = createSessions(config);
      const id = readCookie(header(req, 'cookie'), cookieName(config, 'session'));
      if (callback) {
        res.setHeader('Set-Cookie', cookie(config, 'oauth', '', 0));
        const pending = readCookie(header(req, 'cookie'), cookieName(config, 'oauth'));
        const sessionCookie = await sessions.callback(url.searchParams.get('code') ?? '', pending);
        res.setHeader('Set-Cookie', [sessionCookie, cookie(config, 'oauth', '', 0)]);
        redirect(res, '/'); return;
      }
      const action = url.searchParams.get('action');
      if (url.pathname === '/api/auth' && action === 'session' && req.method === 'GET') {
        if (header(req, 'x-noi-client') !== '1' || header(req, 'sec-fetch-site') === 'cross-site'
          || (header(req, 'origin') && header(req, 'origin') !== config.origin)) throw new HttpError(403, 'forbidden');
        if (!id) { json(res, 200, { userId: null, projectId: new URL(config.url).hostname }); return; }
        const session = await sessions.load(id);
        json(res, 200, { userId: session.userId, projectId: new URL(config.url).hostname }); return;
      }
      if (req.method !== 'POST') throw new HttpError(405, 'invalid');
      requireMutation(header(req, 'origin'), header(req, 'x-noi-client'), config);
      if (url.pathname === '/api/auth' && action === 'start') {
        const start = sessions.start(); res.setHeader('Set-Cookie', start.cookie);
        json(res, 200, { url: start.url }); return;
      }
      if (url.pathname === '/api/auth' && action === 'logout') {
        res.setHeader('Set-Cookie', await sessions.logout(id)); json(res, 200, { ok: true }); return;
      }
      if (url.pathname !== '/api/rpc') throw new HttpError(404, 'invalid');
      const input = await body(req);
      if (typeof input.name !== 'string' || !allowedRPCs.has(input.name) || typeof input.userId !== 'string'
        || !/^[a-f0-9-]{36}$/i.test(input.userId) || !input.args || typeof input.args !== 'object' || Array.isArray(input.args)
        || input.projectId !== new URL(config.url).hostname) throw new HttpError(400, 'invalid');
      const session = await sessions.load(id, input.userId);
      const result = await sessions.db.rpc(session.access, input.name, input.args as Record<string, unknown>);
      json(res, 200, { data: result });
    } catch (error) {
      // Raw exceptions can contain tokens, callback codes, RPC payloads and keys. Never log them.
      if (callback) { redirect(res, '/?auth=failed'); return; }
      const failure = error instanceof HttpError ? error : new HttpError(503);
      if (failure.status === 503) res.setHeader('Retry-After', '2');
      json(res, failure.status, { error: failure.kind });
    }
  };
}