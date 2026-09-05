import { CloudError, type Transport } from '../sync/engine';
import { parsePage, parseResult, parseWorkspace } from '../sync/protocol';

// Only the public project origin is needed in the browser, for IndexedDB namespacing.
function configuration() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash
      || parsed.port || parsed.pathname !== '/' || !parsed.hostname.endsWith('.supabase.co')) return null;
    return { url: parsed.origin };
  } catch { return null; }
}

const config = configuration();
export const projectId = config ? new URL(config.url).hostname : 'unconfigured';
export const configured = config !== null;
export const authEvents = new EventTarget();

async function request(path: string, options: RequestInit = {}) {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000);
  const response = await fetch(path, { ...options, signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    headers: { 'X-Noi-Client': '1', 'Content-Type': 'application/json' } });
  if (!response.ok) {
    if (response.status === 401 || response.status === 409) throw new CloudError('auth');
    if (response.status === 403) throw new CloudError('forbidden');
    if (response.status === 400) throw new CloudError('invalid');
    throw new CloudError('retry');
  }
  return response.json(); // Do not read error bodies, log URLs, or expose response headers.
}
export async function getSession(): Promise<string | null> {
  if (!config) throw new CloudError('auth');
  let data;
  try { data = await request('/api/auth?action=session'); }
  catch (error) { if (error instanceof CloudError && error.kind === 'auth') return null; throw error; }
  if (data.projectId !== projectId || (data.userId !== null && typeof data.userId !== 'string')) throw new CloudError('retry');
  return data.userId;
}

export class SupabaseTransport implements Transport {
  constructor(readonly userId: string) {}
  async rpc(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    try {
      const result = await request('/api/rpc', { method: 'POST', signal, body: JSON.stringify({ name, args, userId: this.userId, projectId }) });
      return result.data;
    } catch (error) {
      if (error instanceof CloudError && error.kind === 'auth') authEvents.dispatchEvent(new Event('recheck'));
      throw error;
    }
  }
  async workspace(signal: AbortSignal) { return parseWorkspace(await this.rpc('get_workspace', {}, signal)); }
  async apply(request: Parameters<Transport['apply']>[0], signal: AbortSignal) {
    return parseResult(await this.rpc('apply_event', request, signal));
  }
  async pull(family: string, after: string, signal: AbortSignal) {
    return parsePage(await this.rpc('pull_changes', { p_family_id: family, p_after: after, p_limit: 200 }, signal));
  }
}

export async function authenticatedTransport(userId: string): Promise<SupabaseTransport> {
  if (await getSession() !== userId) throw new CloudError('auth');
  // The server checks this account binding again on EVERY RPC before using its JWT.
  return new SupabaseTransport(userId);
}

export async function signIn() {
  if (!config) throw new CloudError('auth');
  const result = await request('/api/auth?action=start', { method: 'POST' });
  const url = new URL(result.url);
  if (url.origin !== config.url || url.pathname !== '/auth/v1/authorize') throw new CloudError('auth');
  window.location.assign(url.href);
}
export async function signOut() {
  await request('/api/auth?action=logout', { method: 'POST' });
  authEvents.dispatchEvent(new Event('signed-out'));
}