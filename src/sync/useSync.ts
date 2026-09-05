import { useEffect, useRef, useState } from 'react';
import { authenticatedTransport } from '../cloud/supabase';
import type { LocalStore } from '../data/store';
import { CloudError, retryDelay, synchronize } from './engine';

export function useSync(store: LocalStore) {
  const [status, setStatus] = useState({ busy: false, message: '', online: navigator.onLine });
  const trigger = useRef<() => void>(() => {});
  useEffect(() => {
    const lifetime = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let running = false;
    let requested = false;
    let attempts = 0;
    async function run() {
      if (lifetime.signal.aborted) return;
      if (running) { requested = true; return; }
      clearTimeout(timer);
      setStatus(s => ({ ...s, online: navigator.onLine }));
      if (!navigator.onLine) { timer = setTimeout(run, 30_000); return; }
      if (!navigator.locks) {
        setStatus({ busy: false, online: true, message: 'Trình duyệt cần hỗ trợ Web Locks để đồng bộ an toàn nhiều tab. Ghi trên máy vẫn hoạt động.' });
        return;
      }
      running = true;
      setStatus({ busy: true, online: true, message: '' });
      try {
        await navigator.locks.request(`${store.db.name}:sync`, { ifAvailable: true }, async lock => {
          if (!lock) return;
          const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(60_000)]);
          const api = await authenticatedTransport(store.db.userId);
          signal.throwIfAborted();
          await synchronize(store, api, signal);
        });
        attempts = 0;
      } catch (error) {
        if (!lifetime.signal.aborted) setStatus(s => ({ ...s, message: error instanceof CloudError ? error.message : 'Chưa hoàn tất đồng bộ. Dữ liệu trên máy vẫn được giữ.' }));
        attempts++;
      } finally {
        running = false;
        if (!lifetime.signal.aborted) {
          setStatus(s => ({ ...s, busy: false }));
          timer = setTimeout(run, requested ? 300 : attempts ? retryDelay(attempts) : 30_000);
          requested = false;
        }
      }
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') void run(); };
    const onOffline = () => setStatus(s => ({ ...s, online: false }));
    trigger.current = () => { void run(); };
    window.addEventListener('online', run); window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    void run();
    return () => {
      lifetime.abort(); clearTimeout(timer); trigger.current = () => {};
      window.removeEventListener('online', run); window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [store]);
  return { ...status, kick: () => trigger.current() };
}