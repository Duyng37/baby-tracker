import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { Sessions } from './session';
import { cookieName, digest, HttpError, readCookie, seal, unseal } from './security';
import { config, fixture, id, tokens, user } from './test-fixture';

it('PKCE keeps its verifier in an encrypted HttpOnly cookie, not localStorage', () => {
  const start = new Sessions(config, fixture()).start(); const url = new URL(start.url);
  const value = readCookie(start.cookie, cookieName(config, 'oauth'));
  const proof = unseal(value, config.encryptionKey, 'oauth') as { verifier: string; expires: number };
  expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(proof.verifier).digest('base64url'));
  expect(url.searchParams.get('redirect_to')).toBe(`${config.origin}/api/auth?action=callback`);
  expect(url.searchParams.get('prompt')).toBeNull(); expect(start.cookie).not.toContain(proof.verifier);
});
it('successful callback creates a hashed opaque session and encrypted token vault', async () => {
  const db = fixture(); const sessions = new Sessions(config, db); const start = sessions.start();
  const pending = readCookie(start.cookie, cookieName(config, 'oauth'));
  const result = await sessions.callback('TEST_ONLY_NOT_A_CODE', pending);
  const sessionId = readCookie(result, cookieName(config, 'session'));
  expect(db.create.mock.calls[0][0]).toBe(digest(sessionId)); expect(db.create.mock.calls[0][1]).toBe(user);
  expect(result).not.toContain(tokens().access_token);
  expect(unseal(db.create.mock.calls[0][2], config.encryptionKey, digest(sessionId))).toMatchObject({ user: { id: user } });
});
it('rejects missing, tampered and expired OAuth cookies before code exchange', async () => {
  const db = fixture(); const sessions = new Sessions(config, db);
  const expired = seal({ verifier: id, expires: 1 }, config.encryptionKey, 'oauth');
  for (const pending of ['', 'invalid', expired]) await expect(sessions.callback('TEST_ONLY', pending)).rejects.toMatchObject({ status: 401 });
  expect(db.exchange).not.toHaveBeenCalled();
});
it('copied cookies restore the same account without provider login', async () => {
  const db = fixture(); const browser = new Sessions(config, db); const pwa = new Sessions(config, db);
  expect((await browser.load(id)).userId).toBe(user); expect((await pwa.load(id)).userId).toBe(user);
  expect(db.exchange).not.toHaveBeenCalled(); expect(db.refresh).not.toHaveBeenCalled();
});
it('rejects an account mismatch before refresh or any data RPC', async () => {
  const db = fixture(1); const sessions = new Sessions(config, db);
  await expect(sessions.load(id, 'other-account')).rejects.toMatchObject({ status: 409 });
  expect(db.refresh).not.toHaveBeenCalled(); expect(db.rpc).not.toHaveBeenCalled();
});
it('concurrent browser/PWA requests refresh once; a peer retries instead of logging out', async () => {
  const db = fixture(1); const one = new Sessions(config, db); const two = new Sessions(config, db);
  const results = await Promise.allSettled([one.load(id), two.load(id)]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 503 } });
  expect(db.refresh).toHaveBeenCalledOnce(); expect((await two.load(id)).userId).toBe(user);
});
it('refresh outages do not delete a session but a revoked refresh token does', async () => {
  const transient = fixture(1); transient.refresh.mockRejectedValueOnce(new HttpError(503));
  await expect(new Sessions(config, transient).load(id)).rejects.toMatchObject({ status: 503 });
  expect(transient.remove).not.toHaveBeenCalled();
  const revoked = fixture(1); revoked.refresh.mockRejectedValueOnce(new HttpError(401, 'auth'));
  await expect(new Sessions(config, revoked).load(id)).rejects.toMatchObject({ status: 401 });
  expect(revoked.remove).toHaveBeenCalledOnce();
});
it('logout during refresh cannot resurrect a vault row; all copied cookies are revoked', async () => {
  const db = fixture(1); const sessions = new Sessions(config, db);
  db.refresh.mockImplementationOnce(async () => { await sessions.logout(id); return tokens(); });
  await expect(sessions.load(id)).rejects.toMatchObject({ status: 503 });
  await expect(sessions.load(id)).rejects.toMatchObject({ status: 401 });
});
it('absolute session expiry and malformed IDs fail closed', async () => {
  const db = fixture(); const sessions = new Sessions(config, db);
  await expect(sessions.load('invalid')).rejects.toMatchObject({ status: 401 }); expect(db.read).not.toHaveBeenCalled();
  const row = (await db.read(digest(id)))!; db.read.mockResolvedValue({ ...row, expires_at: new Date(1).toISOString() });
  await expect(sessions.load(id)).rejects.toMatchObject({ status: 401 });
});