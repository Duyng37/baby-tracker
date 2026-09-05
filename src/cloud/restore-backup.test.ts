import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LocalStore } from '../data/store';
import type { Backup } from '../data/backup-format';
vi.mock('./supabase', () => ({ authenticatedTransport: vi.fn() }));
vi.mock('../sync/engine', () => ({ synchronize: vi.fn() }));
vi.mock('../data/backup', () => ({ restoreBackup: vi.fn() }));
import { authenticatedTransport } from './supabase';
import { synchronize } from '../sync/engine';
import { restoreBackup } from '../data/backup';
import { restoreWithCloud } from './restore-backup';

const user = '11111111-1111-4111-8111-111111111111', project = 'test.supabase.co';
const store = { db: { userId: user, name: 'fixture-db' } } as LocalStore;
const backup: Backup = { format: 'noi-backup', version: 1, projectId: project, userId: user,
  exportedAt: '2020-01-01T00:00:00Z', families: [], babies: [], events: [] };
const request = vi.fn(async (_name: string, _options: unknown, action: () => unknown) => action());
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('navigator', { onLine: true, locks: { request } }); });
afterEach(() => vi.unstubAllGlobals());
it('authenticates and completes cloud sync under the shared lock before restoring', async () => {
  const order: string[] = [];
  vi.mocked(authenticatedTransport).mockImplementationOnce(async () => { order.push('auth'); return {} as never; });
  vi.mocked(synchronize).mockImplementationOnce(async () => { order.push('sync'); });
  vi.mocked(restoreBackup).mockImplementationOnce(async () => { order.push('restore'); return {} as never; });
  const signal = new AbortController().signal;
  await restoreWithCloud(store, backup, project, signal);
  expect(request).toHaveBeenCalledWith('fixture-db:sync', { signal }, expect.any(Function));
  expect(order).toEqual(['auth', 'sync', 'restore']);
  expect(restoreBackup).toHaveBeenCalledWith(store, backup, project, signal);
});
it('does not import when the cloud refresh fails', async () => {
  vi.mocked(synchronize).mockRejectedValueOnce(new Error('offline'));
  await expect(restoreWithCloud(store, backup, project, new AbortController().signal)).rejects.toThrow();
  expect(restoreBackup).not.toHaveBeenCalled();
});
it('does not import after the sheet/account unmounts during sync', async () => {
  const controller = new AbortController();
  vi.mocked(synchronize).mockImplementationOnce(async () => controller.abort());
  await expect(restoreWithCloud(store, backup, project, controller.signal)).rejects.toThrow();
  expect(restoreBackup).not.toHaveBeenCalled();
});
it('rejects wrong-account files before any network or lock request', async () => {
  await expect(restoreWithCloud(store, { ...backup, userId: '22222222-2222-4222-8222-222222222222' }, project, new AbortController().signal)).rejects.toThrow('đúng tài khoản');
  expect(request).not.toHaveBeenCalled(); expect(authenticatedTransport).not.toHaveBeenCalled();
});
it.each([{ onLine: false, locks: { request } }, { onLine: true }])('requires online access and Web Locks', async navigator => {
  vi.stubGlobal('navigator', navigator);
  await expect(restoreWithCloud(store, backup, project, new AbortController().signal)).rejects.toThrow('cần mạng');
  expect(restoreBackup).not.toHaveBeenCalled();
});