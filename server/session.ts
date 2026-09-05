import { createHash, randomUUID } from 'node:crypto';
import { cookie, digest, HttpError, randomId, seal, unseal, validId, type Config } from './security.ts';
import { parseTokens, type Backend } from './supabase.ts';

const lifetime = 30 * 24 * 60 * 60;
export class Sessions {
  constructor(readonly config: Config, readonly db: Backend) {}
  start() {
    const verifier = randomId();
    const value = seal({ verifier, expires: Date.now() + 600_000 }, this.config.encryptionKey, 'oauth');
    const url = new URL(`${this.config.url}/auth/v1/authorize`);
    url.search = new URLSearchParams({ provider: 'google', redirect_to: `${this.config.origin}/api/auth?action=callback`,
      scopes: 'openid email profile', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 's256' }).toString();
    return { url: url.href, cookie: cookie(this.config, 'oauth', value, 600) };
  }
  async callback(code: string, pending: string) {
    if (!pending || !code || code.length > 2048) throw new HttpError(401, 'auth');
    const proof = unseal(pending, this.config.encryptionKey, 'oauth') as { verifier: string; expires: number };
    if (!proof || !validId(proof.verifier) || !Number.isFinite(proof.expires) || proof.expires <= Date.now()) throw new HttpError(401, 'auth');
    const tokens = await this.db.exchange(code, proof.verifier);
    const id = randomId();
    const hash = digest(id);
    await this.db.create(hash, tokens.user.id, seal(tokens, this.config.encryptionKey, hash), tokens.expires_at);
    return cookie(this.config, 'session', id, lifetime);
  }
  async load(id: string, expectedUser?: string) {
    if (!validId(id)) throw new HttpError(401, 'auth');
    const hash = digest(id);
    const row = await this.db.read(hash);
    if (!row || Date.parse(row.expires_at) <= Date.now()) throw new HttpError(401, 'auth');
    // Check BEFORE refresh or RPC: old account A's outbox must never be sent as B.
    if (expectedUser && row.user_id !== expectedUser) throw new HttpError(409, 'account_changed');
    let tokens = parseTokens(unseal(row.encrypted_tokens, this.config.encryptionKey, hash));
    if (tokens.user.id !== row.user_id) throw new HttpError(401, 'auth');
    if (tokens.expires_at * 1000 <= Date.now() + 60_000) {
      const owner = randomUUID();
      if (!await this.db.claim(hash, owner, row.encrypted_tokens)) throw new HttpError(503); // Peer refreshed/in flight; retry, don't log out.
      try {
        tokens = await this.db.refresh(tokens.refresh_token);
      } catch (error) {
        if (error instanceof HttpError && error.status === 401) await this.db.remove(hash);
        // Network/rate-limit failures preserve vault/outbox; lease expires on its own.
        throw error;
      }
      if (tokens.user.id !== row.user_id) throw new HttpError(401, 'auth');
      if (!await this.db.save(hash, owner, seal(tokens, this.config.encryptionKey, hash), tokens.expires_at)) throw new HttpError(503);
    }
    return { userId: row.user_id, access: tokens.access_token };
  }
  async logout(id: string) {
    // Delete first, without needing to refresh an expired token. All copies become
    // unusable immediately; a refresh already in flight cannot recreate the row.
    if (validId(id)) await this.db.remove(digest(id));
    return cookie(this.config, 'session', '', 0);
  }
}