import { authenticatedTransport } from './supabase';
import { synchronize } from '../sync/engine';
import { DataError } from '../domain/events';
import { restoreBackup } from '../data/backup';
import { parseBackup, type Backup } from '../data/backup-format';
import type { LocalStore } from '../data/store';

export async function restoreWithCloud(store: LocalStore, backup: Backup, projectId: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const snapshot = parseBackup(JSON.stringify(backup));
  if (snapshot.projectId !== projectId || snapshot.userId !== store.db.userId) throw new DataError('Hãy đăng nhập đúng tài khoản và project đã tạo bản sao lưu.');
  if (!navigator.onLine || !navigator.locks) throw new DataError('Khôi phục cần mạng và trình duyệt hỗ trợ Web Locks để đối chiếu cloud an toàn.');
  // Same lock as normal sync: never import against a partial pull or another worker's ACK.
  return navigator.locks.request(`${store.db.name}:sync`, { signal }, async () => {
    signal.throwIfAborted();
    const api = await authenticatedTransport(store.db.userId);
    signal.throwIfAborted();
    await synchronize(store, api, signal);
    signal.throwIfAborted();
    return restoreBackup(store, snapshot, projectId, signal);
  });
}