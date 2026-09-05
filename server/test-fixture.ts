// Fabricated fixtures only. Tests never read .env files or contact Supabase.
import { vi } from 'vitest';
import { digest, seal, type Config } from './security';
import type { Backend, Tokens, VaultRow } from './supabase';

export const config: Config = { origin: 'https://app.example.test', url: 'https://unit-test-placeholder.supabase.co',
  publishable: 'sb_publishable_TEST_ONLY_NOT_A_KEY', secret: 'sb_secret_TEST_ONLY_NOT_A_KEY', encryptionKey: Buffer.alloc(32, 7) };
export const user = '11111111-1111-4111-8111-111111111111';
export const id = 'a'.repeat(43);
export const tokens = (expires = Date.now() / 1000 + 3600): Tokens => ({ access_token: 'TEST_ONLY_NOT_A_TOKEN',
  refresh_token: 'TEST_ONLY_NOT_A_REFRESH_TOKEN', expires_at: Math.floor(expires), user: { id: user } });
export function fixture(expiry?: number) {
  let vaultHash = digest(id);
  let row: VaultRow | null = { user_id: user, encrypted_tokens: seal(tokens(expiry), config.encryptionKey, digest(id)),
    access_expires_at: new Date(tokens(expiry).expires_at * 1000).toISOString(), expires_at: new Date(Date.now() + 86_400_000).toISOString() };
  let owner: string | null = null;
  const db = {
    create: vi.fn(async (hash: string, account: string, cipher: string, expiry: number) => {
      vaultHash = hash; owner = null;
      row = { user_id: account, encrypted_tokens: cipher, access_expires_at: new Date(expiry * 1000).toISOString(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString() };
    }),
    read: vi.fn(async (hash: string) => hash === vaultHash ? row : null),
    claim: vi.fn(async (hash: string, next: string, expected: string) => {
      if (hash !== vaultHash || owner || !row || row.encrypted_tokens !== expected) return false;
      owner = next; return true;
    }),
    save: vi.fn(async (hash: string, expected: string, encrypted: string, next: number) => {
      if (hash !== vaultHash || !row || owner !== expected) return false;
      row = { ...row, encrypted_tokens: encrypted, access_expires_at: new Date(next * 1000).toISOString() }; owner = null; return true;
    }),
    remove: vi.fn(async (hash: string) => { if (hash === vaultHash) row = null; }),
    exchange: vi.fn(async (_code: string, _proof: string) => tokens()),
    refresh: vi.fn(async (_refresh: string) => tokens()),
    rpc: vi.fn(async (_access: string, _name: string, _args: Record<string, unknown>) => ({ ok: true })),
  } satisfies Backend;
  return db;
}