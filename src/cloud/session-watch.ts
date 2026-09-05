import { authEvents, getSession } from './supabase';

type State = { userId?: string | null; message: string };
export function watchSession(onState: (state: State) => void, read = getSession,
  events = authEvents, foreground: EventTarget = document, network: EventTarget = window) {
  let alive = true;
  let generation = 0;
  let failures = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    clearTimeout(retry);
    const current = ++generation;
    void read().then(userId => {
      if (alive && current === generation) { failures = 0; onState({ userId, message: '' }); }
    }).catch(() => {
      // An outage is not a logout. Keep the mounted account and unsent data.
      if (alive && current === generation) {
        onState({ message: 'Chưa kiểm tra được phiên. Kiểm tra mạng hoặc cấu hình máy chủ; dữ liệu trên máy vẫn được giữ.' });
        retry = setTimeout(refresh, Math.min(30_000, 2_000 * 2 ** Math.min(failures++, 4)));
      }
    });
  };
  const signedOut = () => { generation++; clearTimeout(retry); if (alive) onState({ userId: null, message: '' }); };
  foreground.addEventListener('visibilitychange', refresh);
  network.addEventListener('online', refresh);
  events.addEventListener('recheck', refresh);
  events.addEventListener('signed-out', signedOut);
  const timer = setInterval(refresh, 60_000);
  refresh();
  return () => {
    alive = false; generation++; clearInterval(timer); clearTimeout(retry);
    foreground.removeEventListener('visibilitychange', refresh);
    network.removeEventListener('online', refresh);
    events.removeEventListener('recheck', refresh);
    events.removeEventListener('signed-out', signedOut);
  };
}