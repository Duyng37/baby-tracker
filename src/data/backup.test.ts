import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { TrackerDB } from './database';
import { LocalStore } from './store';
import { exportBackup, previewRestore, restoreBackup } from './backup';
import { maxBackupBytes, parseBackup, type Backup } from './backup-format';
import type { EventBody, Workspace } from '../domain/types';

const project = 'backup-test.supabase.co', user = '11111111-1111-4111-8111-111111111111';
const family = '22222222-2222-4222-8222-222222222222', baby = '33333333-3333-4333-8333-333333333333';
const eventId = '44444444-4444-4444-8444-444444444444', secondId = '55555555-5555-4555-8555-555555555555';
const scope = { family_id: family, baby_id: baby };
const body: EventBody = { type: 'bottle', payload: { amount_ml: 90, milk: 'formula' }, note: 'Bản lưu',
  started_at: '2020-01-01T10:00:00Z', ended_at: null, deleted: false };
const workspace: Workspace = { families: [{ id: family, name: 'Nhà thử', timezone: 'Asia/Ho_Chi_Minh', sync_cursor: '0' }],
  babies: [{ id: baby, family_id: family, nickname: 'Bé thử', birth_date: null }], memberships: [{ family_id: family, user_id: user, role: 'owner' }] };
let db: TrackerDB, store: LocalStore;
function file(): Backup {
  return { format: 'noi-backup', version: 1, projectId: project, userId: user, exportedAt: '2020-01-02T00:00:00Z',
    families: [{ id: family, name: 'Nhà thử', timezone: 'Asia/Ho_Chi_Minh' }], babies: structuredClone(workspace.babies),
    events: [{ id: eventId, ...scope, body: structuredClone(body) }] };
}
beforeEach(async () => { db = new TrackerDB(crypto.randomUUID(), user); store = new LocalStore(db); await store.saveWorkspace(workspace); });
afterEach(async () => db.delete());

it('exports current local content including unsynced notes, but never auth/draft/outbox metadata', async () => {
  await store.save(scope, eventId, body);
  await db.state.put({ key: 'draft', value: { privateMarker: 'DO_NOT_EXPORT' } });
  await store.nextOperation();
  const backup = await exportBackup(store, project), text = JSON.stringify(backup);
  expect(backup.events[0].body).toEqual(body);
  expect(backup.families[0]).not.toHaveProperty('sync_cursor');
  for (const marker of ['DO_NOT_EXPORT', 'operation_id', 'base_revision', 'memberships', 'server', 'request']) expect(text).not.toContain(marker);
  expect(Object.keys(backup.events[0]).sort()).toEqual(['baby_id', 'body', 'family_id', 'id']);
  expect(parseBackup(text)).toEqual(backup);
});
it('does not export a revoked family even when its local events remain on disk', async () => {
  await store.save(scope, eventId, body); await store.quarantine(family);
  const backup = await exportBackup(store, project);
  expect(backup.events).toEqual([]); expect(backup.families).toEqual([]); expect(await db.events.count()).toBe(1);
});
it('previews without writes and restores missing IDs through the outbox', async () => {
  expect((await previewRestore(store, file(), project)).added).toBe(1);
  expect(await db.events.count()).toBe(0); expect(await db.outbox.count()).toBe(0);
  expect((await restoreBackup(store, file(), project)).added).toBe(1);
  const operation = (await store.nextOperation())!;
  expect(operation.event_id).toBe(eventId); expect(operation.request!.p_base_revision).toBe('0');
  const count = await db.outbox.count();
  const again = await restoreBackup(store, file(), project);
  expect(again.added).toBe(0); expect(again.identical).toBe(1); expect(await db.outbox.count()).toBe(count);
  expect((await store.nextOperation())!.request).toEqual(operation.request);
});
it('never overwrites an existing note, deletion or pending conflict', async () => {
  await store.save(scope, eventId, { ...body, note: 'Hiện tại', deleted: true });
  const op = (await store.nextOperation())!;
  await db.outbox.update(op.sequence!, { blocked: true });
  const report = await restoreBackup(store, file(), project);
  expect(report.different).toBe(1); expect(report.added).toBe(0);
  expect((await store.list(scope))[0].body).toEqual({ ...body, note: 'Hiện tại', deleted: true });
  expect(await db.outbox.count()).toBe(1);
});
it('compares normalized timestamps without treating identical content as different', async () => {
  await store.save(scope, eventId, { ...body, started_at: '2020-01-01T10:00:00.000Z' });
  expect((await previewRestore(store, file(), project)).identical).toBe(1);
});
it.each(['account', 'project'])('rejects a different %s before inserting', async kind => {
  const backup = file(); if (kind === 'account') backup.userId = secondId; else backup.projectId = 'another.supabase.co';
  await expect(restoreBackup(store, backup, project)).rejects.toThrow('đúng tài khoản');
  expect(await db.events.count()).toBe(0); expect(await db.outbox.count()).toBe(0);
});
it('does not grant membership or recreate missing babies from file metadata', async () => {
  await store.saveWorkspace({ families: [], babies: [], memberships: [] });
  expect((await restoreBackup(store, file(), project)).unavailable).toBe(1);
  expect(await store.workspace()).toEqual({ families: [], babies: [], memberships: [] });
  expect(await db.events.count()).toBe(0);
});
it('does not reactivate old running timers or import tombstones as new data', async () => {
  const backup = file(); backup.events[0].body.deleted = true;
  backup.events.push({ id: secondId, ...scope, body: { ...body, type: 'sleep', payload: {} } });
  const report = await restoreBackup(store, backup, project);
  expect(report.deleted).toBe(1); expect(report.running).toBe(1); expect(report.added).toBe(0);
  expect(await db.outbox.count()).toBe(0);
});
it('rolls back the whole import if an outbox write fails', async () => {
  const backup = file(); backup.events.push({ ...backup.events[0], id: secondId });
  let writes = 0;
  const fail = () => { if (++writes === 2) throw new Error('simulated quota'); };
  db.outbox.hook('creating', fail);
  await expect(restoreBackup(store, backup, project)).rejects.toThrow();
  db.outbox.hook('creating').unsubscribe(fail);
  expect(await db.events.count()).toBe(0); expect(await db.outbox.count()).toBe(0);
});
it('serializes two imports, preserving IDs without duplicate operations', async () => {
  const reports = await Promise.all([restoreBackup(store, file(), project), restoreBackup(store, file(), project)]);
  expect(reports.reduce((count, report) => count + report.added, 0)).toBe(1);
  expect(await db.events.count()).toBe(1); expect(await db.outbox.count()).toBe(1);
});
it('rolls back every inserted event if cancelled during local writes', async () => {
  const backup = file(); backup.events.push({ ...backup.events[0], id: secondId });
  const controller = new AbortController();
  const cancel = () => { controller.abort(); };
  db.outbox.hook('creating', cancel);
  await expect(restoreBackup(store, backup, project, controller.signal)).rejects.toThrow();
  db.outbox.hook('creating').unsubscribe(cancel);
  expect(await db.events.count()).toBe(0); expect(await db.outbox.count()).toBe(0);
});
it('restores the 20,000-record limit atomically and re-imports without duplicates', { timeout: 60_000 }, async () => {
  const backup = file();
  backup.events = Array.from({ length: 20_000 }, (_, index) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-${index.toString(16).padStart(12, '0')}`, ...scope, body }));
  expect(new TextEncoder().encode(JSON.stringify(backup)).byteLength).toBeLessThan(maxBackupBytes);
  expect((await restoreBackup(store, backup, project)).added).toBe(20_000);
  expect(await db.events.count()).toBe(20_000); expect(await db.outbox.count()).toBe(20_000);
  const again = await restoreBackup(store, backup, project);
  expect(again.added).toBe(0); expect(again.identical).toBe(20_000);
  expect(await db.outbox.count()).toBe(20_000);
});
it('fails closed on an event ID belonging to a different scope', async () => {
  await db.events.put({ ...scope, baby_id: secondId, id: eventId, body, server: null, version: 1 });
  await expect(restoreBackup(store, file(), project)).rejects.toThrow('hồ sơ khác');
  expect(await db.outbox.count()).toBe(0);
});
it.each(['version', 'duplicate', 'extra', 'body', 'scope', 'uuid', 'timezone', 'date'])('rejects malformed %s without changing storage', async kind => {
  const backup = file();
  if (kind === 'version') Object.assign(backup, { version: 999 });
  if (kind === 'duplicate') backup.events.push(backup.events[0]);
  if (kind === 'extra') Object.assign(backup, { session: 'unexpected-field' });
  if (kind === 'body') Object.assign(backup.events[0].body, { payload: { amount_ml: -1, milk: 'formula' } });
  if (kind === 'scope') backup.events[0].baby_id = secondId;
  if (kind === 'uuid') backup.events[0].id = 'not-an-id';
  if (kind === 'timezone') backup.families[0].timezone = 'not-a-timezone';
  if (kind === 'date') backup.babies[0].birth_date = '2020-02-31';
  await expect(restoreBackup(store, backup, project)).rejects.toThrow('không hợp lệ');
  expect(await db.events.count()).toBe(0); expect(await db.outbox.count()).toBe(0);
});
it('limits file size/count and never echoes malicious file content in errors', () => {
  expect(() => parseBackup(' '.repeat(maxBackupBytes + 1))).toThrow('10 MB');
  const backup = file(); backup.events = Array.from({ length: 20_001 }, () => backup.events[0]);
  expect(() => parseBackup(JSON.stringify(backup))).toThrow('không hợp lệ');
  try { parseBackup('USER_CONTENT_DO_NOT_ECHO'); } catch (error) { expect(String(error)).not.toContain('USER_CONTENT_DO_NOT_ECHO'); }
});