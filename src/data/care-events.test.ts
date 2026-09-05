import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { TrackerDB } from './database';
import { LocalStore } from './store';
import { exportBackup, previewRestore, restoreBackup } from './backup';
import { parseBackup } from './backup-format';
import { parseEvent } from '../sync/protocol';
import { saveUnchangedEvent } from '../ui/event-edits';
import type { CareBody, LocalEvent } from '../domain/types';

const user = '11111111-1111-4111-8111-111111111111';
const scope = { family_id: '22222222-2222-4222-8222-222222222222', baby_id: '33333333-3333-4333-8333-333333333333' };
const project = 'care-test.supabase.co';
const common = { started_at: '2020-01-01T02:00:00.000Z', ended_at: null, deleted: false, note: '' };
const plan = { ...common, type: 'medication' as const, started_at: '2099-01-01T02:00:00.000Z', payload: { name: 'Thuốc thử', dose: 'Theo đơn', status: 'planned' as const } };
const bodies: CareBody[] = [plan, { ...common, type: 'meal', payload: { food: 'Cháo', amount: 'Nửa bát' } },
  { ...common, type: 'growth', payload: { height_cm: null, weight_kg: 7.25 } },
  { ...common, type: 'activity', payload: { kind: 'tummy_time', duration_minutes: 10 } }];
let db: TrackerDB, store: LocalStore;
beforeEach(async () => {
  db = new TrackerDB(crypto.randomUUID(), user); store = new LocalStore(db);
  await store.saveWorkspace({ families: [{ id: scope.family_id, name: 'Nhà thử', timezone: 'Asia/Ho_Chi_Minh', sync_cursor: '0' }],
    babies: [{ id: scope.baby_id, family_id: scope.family_id, nickname: 'Bé thử', birth_date: null }],
    memberships: [{ family_id: scope.family_id, user_id: user, role: 'caregiver' }] });
});
afterEach(async () => db.delete());
async function acknowledge(local: LocalEvent, revision: string) {
  const op = (await store.nextOperation())!;
  const { deleted, ...body } = local.body;
  const event = parseEvent({ ...body, ...scope, id: local.id, revision, deleted_at: deleted ? common.started_at : null });
  await store.acknowledge(op, { operation_id: op.operation_id, status: 'accepted', cursor: revision, event });
}
it.each(bodies)('persists and syncs care $type without network during recording', async body => {
  const local = await store.save(scope, crypto.randomUUID(), body); db.close(); await db.open();
  expect((await store.list(scope))[0].body).toEqual(body);
  expect((await store.nextOperation())!.request!.p_event).toEqual(body);
  await acknowledge(local, '1'); expect(await db.outbox.count()).toBe(0);
});
it('completes a medication plan on the same ID and keeps dependent changes across acknowledgements', async () => {
  const opened = await store.save(scope, crypto.randomUUID(), plan);
  const request = structuredClone((await store.nextOperation())!.request);
  const body: CareBody = { ...plan, started_at: common.started_at, payload: { ...plan.payload, status: 'completed' } };
  const completed = await saveUnchangedEvent(store, opened, body);
  expect(await db.events.count()).toBe(1); expect((await store.nextOperation())!.request).toEqual(request);
  await acknowledge(opened, '1'); expect((await store.list(scope))[0].body).toEqual(body);
  expect((await store.nextOperation())!.request!.p_base_revision).toBe('1');
  await acknowledge(completed, '2'); expect(await db.outbox.count()).toBe(0);
});
it.each(bodies)('protects stale edits and supports delete/undo for $type', async body => {
  const opened = await store.save(scope, crypto.randomUUID(), body); await acknowledge(opened, '1');
  const updated = await saveUnchangedEvent(store, opened, { ...body, note: 'Updated' });
  await expect(saveUnchangedEvent(store, opened, body)).rejects.toThrow('đã thay đổi');
  await acknowledge(updated, '2');
  const deleted = await saveUnchangedEvent(store, updated, { ...updated.body, deleted: true }); await acknowledge(deleted, '3');
  const restored = await saveUnchangedEvent(store, deleted, updated.body); await acknowledge(restored, '4');
  expect((await store.list(scope))[0].body).toEqual(updated.body);
});
it('rejects wrong scopes and invalid future completions without adding writes', async () => {
  await expect(store.save({ ...scope, baby_id: 'foreign' }, crypto.randomUUID(), plan)).rejects.toThrow();
  await expect(store.save(scope, crypto.randomUUID(), { ...plan, payload: { ...plan.payload, status: 'completed' } })).rejects.toThrow();
  expect(await db.outbox.count()).toBe(0);
});
it('backs up and restores all care types with the existing format without duplicates', async () => {
  const backup = parseBackup(JSON.stringify({ format: 'noi-backup', version: 1, projectId: project, userId: user, exportedAt: common.started_at,
    families: [{ id: scope.family_id, name: 'Nhà thử', timezone: 'Asia/Ho_Chi_Minh' }], babies: (await store.workspace()).babies,
    events: bodies.map(body => ({ ...scope, id: crypto.randomUUID(), body })) }));
  expect((await restoreBackup(store, backup, project)).added).toBe(4);
  expect((await exportBackup(store, project)).events).toEqual(expect.arrayContaining(backup.events));
  expect((await previewRestore(store, backup, project)).identical).toBe(4);
  expect((await restoreBackup(store, backup, project)).added).toBe(0); expect(await db.outbox.count()).toBe(4);
});