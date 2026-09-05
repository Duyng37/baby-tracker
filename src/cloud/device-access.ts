import { authEvents, getSession } from './supabase';
import { watchSession } from './session-watch';

type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type DeviceMemory = ReturnType<typeof deviceMemory>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const maxAge = 30 * 86_400_000;

/** A device-local account hint, NOT a session or authorization credential. */
export function deviceMemory(project: string, storage: () => StoragePort = () => window.localStorage) {
  const key = `noi:offline-account:${project}`;
  return {
    key,
    read(): string | null {
      try {
        const value = JSON.parse(storage().getItem(key) || 'null');
        return value?.version === 1 && typeof value.userId === 'string' && uuid.test(value.userId)
          && Number.isFinite(value.verifiedAt) && value.verifiedAt <= Date.now() + 300_000
          && Date.now() - value.verifiedAt <= maxAge ? value.userId : null;
      } catch { return null; }
    },
    remember(userId: string | null) {
      try {
        if (userId && uuid.test(userId)) storage().setItem(key, JSON.stringify({ version: 1, userId, verifiedAt: Date.now() }));
        else storage().removeItem(key);
      } catch { /* Denied storage must not prevent online login. */ }
    },
  };
}
export type DeviceSessionState = { userId?: string | null; message: string; localOnly: boolean; candidate: string | null };

export function watchDeviceSession(onState: (state: DeviceSessionState) => void, memory: DeviceMemory,
  read = getSession, events = authEvents, foreground: EventTarget = document, network: EventTarget = window) {
  let account = memory.read();
  const stop = watchSession(state => {
    if (state.userId !== undefined) {
      account = state.userId;
      memory.remember(account); // Includes confirmed logout; no stale offline reopening after 401.
      onState({ ...state, localOnly: false, candidate: null });
    } else onState({ ...state, localOnly: true, candidate: memory.read() });
  }, read, events, foreground, network);
  const changed = (event: Event) => {
    const key = (event as StorageEvent).key;
    if (key !== memory.key && key !== null) return;
    const next = memory.read();
    if (next === account) return; // Do not loop across tabs when only verifiedAt is refreshed.
    account = next;
    onState({ userId: null, localOnly: true, candidate: null, message: 'Tài khoản trên thiết bị đã thay đổi. Đang kiểm tra lại phiên.' });
    events.dispatchEvent(new Event('recheck')); // Invalidates earlier in-flight responses.
  };
  network.addEventListener('storage', changed);
  return () => { stop(); network.removeEventListener('storage', changed); };
}