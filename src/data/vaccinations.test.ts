import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { TrackerDB } from './database';
import { LocalStore } from './store';
import { exportBackup, previewRestore, restoreBackup } from './backup';
import { parseBackup } from './backup-format';
import { parseEvent } from '../sync/protocol';
import { saveUnchangedEvent } from '../ui/event-edits';
import type { LocalEvent, VaccinationBody } from '../domain/types';

const user = '11111111-1111-4111-8111-111111111111';
const scope = { family_id: '22222222-2222-4222-8222-222222222222', baby_id: '33333333-3333-4333-8333-333333333333' };
const id = '44444444-4444-4444-8444-444444444444';
const project = 'vaccination-test.supabase.co';
const plan: VaccinationBody = { type: 'vaccination', started_at: '2099-01-01T02:00:00.000Z', ended_at: null, deleted: false, note: 'Lịch hẹn',
  payload: { vaccine: 'Vắc-xin thử', dose: 'Mũi 1', status: 'planned', location: 'Phòng tiêm' } };
const completed: VaccinationBody = { ...plan, started_at: '2020-01-01T02:00:00.000Z', payload: { ...plan.payload, status: 'completed' } };
let db: TrackerDB, store: LocalStore;
beforeEach(async () => {
  db = new TrackerDB(crypto.randomUUID(), user); store = new LocalStore(db);
  await store.saveWorkspace({ families: [{ id: scope.family_id, name: 'Nhà thử', timezone: 'Asia/Ho_Chi_Minh', sync_cursor: '0' }],
    babies: [{ id: scope.baby_id, family_id: scope.family_id, nickname: 'Bé thử', birth_date: null }],
    memberships: [{ family_id: scope.family_id, user_id: user, role: 'caregiver' }] });
});
afterEach(async () => db.delete());
async function acknowledge(local: LocalEvent, revision: string) {
  const operation = (await store.nextOperation())!;
  const { deleted, ...body } = local.body;
  const event = parseEvent({ ...body, ...scope, id: local.id, revision, deleted_at: deleted ? '2020-01-02T00:00:00Z' : null });
  await store.acknowledge(operation, { operation_id: operation.operation_id, status: 'accepted', cursor: revision, event });
}

it('persists multiple future appointments offline for caregivers and survives reopening', async () => {
  await store.save(scope, id, plan); await store.save(scope, crypto.randomUUID(), plan);
  db.close(); await db.open();
  expect((await store.list(scope)).map(event => event.body)).toEqual([plan, plan]);
  expect(await db.outbox.count()).toBe(2);
  expect((await store.nextOperation())!.request!.p_event).toEqual(plan);
});
it('completes an existing appointment without duplication and syncs dependent changes in order', async () => {
  const opened = await store.save(scope, id, plan);
  const request = structuredClone((await store.nextOperation())!.request);
  const updated = await saveUnchangedEvent(store, opened, completed);
  expect(await db.events.count()).toBe(1);
  expect((await store.nextOperation())!.request).toEqual(request);
  await acknowledge(opened, '1');
  expect((await store.list(scope))[0].body).toEqual(completed);
  expect((await store.nextOperation())!.request!.p_base_revision).toBe('1');
  await acknowledge(updated, '2');
  expect(await db.outbox.count()).toBe(0);
  expect((await store.list(scope))[0].body).toEqual(completed);
});
it.each([{ vaccine: 'Different' }, { dose: 'Mũi 2' }, { status: 'planned' as const }, { location: 'Other' }])('blocks stale vaccination edits after remote payload changes %j', async change => {
  const opened = await store.save(scope, id, completed); await acknowledge(opened, '1');
  const current = (await store.list(scope))[0];
  const payload = { ...completed.payload, ...change };
  await store.applyPage(scope.family_id, '0', { changes: [{ cursor: '2', event: { ...current.server!, revision: '2', payload } }], next_cursor: '2', has_more: false });
  await expect(saveUnchangedEvent(store, opened, { ...completed, note: 'Stale edit' })).rejects.toThrow('đã thay đổi');
  expect(await db.outbox.count()).toBe(0);
});
it('deletes and undoes a future plan without losing appointment fields', async () => {
  const opened = await store.save(scope, id, plan); await acknowledge(opened, '1');
  const deleted = await saveUnchangedEvent(store, opened, { ...plan, deleted: true }); await acknowledge(deleted, '2');
  const restored = await saveUnchangedEvent(store, deleted, plan); await acknowledge(restored, '3');
  expect((await store.list(scope))[0].body).toEqual(plan); expect(await db.events.count()).toBe(1);
});
it('rejects invalid completion and inaccessible scopes without adding outbox entries', async () => {
  await expect(store.save(scope, id, { ...plan, payload: { ...plan.payload, status: 'completed' } })).rejects.toThrow();
  await expect(store.save({ ...scope, baby_id: 'another-baby' }, id, plan)).rejects.toThrow();
  const opened = await store.save(scope, id, plan);
  await store.quarantine(scope.family_id);
  await expect(saveUnchangedEvent(store, opened, completed)).rejects.toThrow('Phạm vi');
  expect(await db.outbox.count()).toBe(1);
});
it('exports, parses and restores both statuses using the same backup format and detects changed payloads', async () => {
  const backup = parseBackup(JSON.stringify({ format: 'noi-backup', version: 1, projectId: project, userId: user, exportedAt: '2020-01-02T00:00:00Z',
    families: [{ id: scope.family_id, name: 'Nhà thử', timezone: 'Asia/Ho_Chi_Minh' }], babies: (await store.workspace()).babies,
    events: [{ ...scope, id, body: plan }, { ...scope, id: crypto.randomUUID(), body: completed }] }));
  expect((await restoreBackup(store, backup, project)).added).toBe(2);
  expect((await exportBackup(store, project)).events).toEqual(expect.arrayContaining(backup.events));
  expect((await previewRestore(store, backup, project)).identical).toBe(2);
  backup.events[0].body = { ...plan, payload: { ...plan.payload, dose: 'Mũi 2' } };
  expect((await previewRestore(store, backup, project)).different).toBe(1);
  expect((await restoreBackup(store, backup, project)).added).toBe(0);
  expect(await db.outbox.count()).toBe(2);
});