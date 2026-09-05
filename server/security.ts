import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export class HttpError extends Error {
  constructor(readonly status: number, readonly kind = 'retry') { super(kind); }
}
export type Config = { origin: string; url: string; publishable: string; secret: string; encryptionKey: Buffer };
export function configuration(env = process.env): Config {
  try {
    const origin = new URL(env.APP_ORIGIN ?? '');
    const url = new URL(env.SUPABASE_URL ?? '');
    const publishable = env.SUPABASE_PUBLISHABLE_KEY ?? '';
    const secret = env.SUPABASE_SECRET_KEY ?? '';
    const key = env.SESSION_ENCRYPTION_KEY ?? '';
    const local = env.NODE_ENV !== 'production' && ['127.0.0.1', 'localhost'].includes(origin.hostname);
    if ((!local && origin.protocol !== 'https:') || !['http:', 'https:'].includes(origin.protocol)
      || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/'
      || url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.pathname !== '/'
      || url.username || url.password || url.search || url.hash || url.port
      || !publishable.startsWith('sb_publishable_') || !secret.startsWith('sb_secret_')
      || !/^[a-f0-9]{64}$/i.test(key)
      || (env.VITE_SUPABASE_URL && new URL(env.VITE_SUPABASE_URL).origin !== url.origin)) throw new Error();
    return { origin: origin.origin, url: url.origin, publishable, secret, encryptionKey: Buffer.from(key, 'hex') };
  } catch { throw new HttpError(503, 'configuration'); }
}
export const randomId = () => randomBytes(32).toString('base64url');
export const digest = (text: string) => createHash('sha256').update(text).digest('hex');
export const validId = (text: unknown): text is string => typeof text === 'string' && /^[A-Za-z0-9_-]{43}$/.test(text);
export function seal(value: unknown, key: Buffer, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}
export function unseal(value: string, key: Buffer, context: string): unknown {
  try {
    const bytes = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
  } catch { throw new HttpError(401, 'auth'); }
}
export function cookieName(config: Config, purpose: 'session' | 'oauth') {
  return `${config.origin.startsWith('https:') ? '__Host-' : ''}noi_${purpose}`;
}
export function cookie(config: Config, purpose: 'session' | 'oauth', value: string, maxAge: number) {
  return `${cookieName(config, purpose)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.origin.startsWith('https:') ? '; Secure' : ''}`;
}
export function readCookie(header: string | undefined, name: string) {
  const matches = (header ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  // Duplicate cookie names are ambiguous; fail closed rather than accept cookie tossing.
  return matches.length === 1 ? matches[0].slice(name.length + 1) : '';
}
export function requireMutation(origin: string | undefined, marker: string | undefined, config: Config) {
  if (origin !== config.origin || marker !== '1') throw new HttpError(403, 'forbidden');
}