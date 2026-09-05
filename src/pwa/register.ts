export type OfflineStatus = 'unsupported' | 'preparing' | 'ready' | 'update' | 'error';
let current: OfflineStatus = 'preparing';
const listeners = new Set<(status: OfflineStatus) => void>();
export function offlineStatus() { return current; }
export function subscribeOfflineStatus(listener: (status: OfflineStatus) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(status: OfflineStatus) { current = status; listeners.forEach(listener => listener(status)); }

export async function registerOfflineShell() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) { publish('unsupported'); return; }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    const update = () => {
      if (registration.waiting) publish('update');
      else if (registration.active) publish('ready');
      else publish('preparing');
    };
    const installing = () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'redundant' && !registration.active) publish('error');
        else update();
      });
      update();
    };
    registration.addEventListener('updatefound', installing);
    installing();
    void navigator.serviceWorker.ready.then(update);
  } catch { publish('error'); } // Never log cache/network errors with URLs or app content.
}