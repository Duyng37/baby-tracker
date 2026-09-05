import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { TrackerDB } from '../data/database';
import { LocalStore } from '../data/store';
import type { EventBody, LocalEvent, ServerEvent } from '../domain/types';
import { eventBodyKey, saveUnchangedEvent } from './event-edits';

const scope = { family_id: 'family-test', baby_id: 'baby-test' };
const body: EventBody = { started_at: '2020-01-01T10:00:00Z', ended_at: null, note: '', deleted: false,
  type: 'bottle', payload: { amount_ml: 90, milk: 'formula' } };
let db: TrackerDB, store: LocalStore;
beforeEach(async () => {
  db = new TrackerDB(crypto.randomUUID(), 'user-test'); store = new LocalStore(db);
  await store.saveWorkspace({ families: [{ id: scope.family_id, name: 'UI test', timezone: 'UTC', sync_cursor: '0' }],
    babies: [{ id: scope.baby_id, family_id: scope.family_id, nickname: 'Test', birth_date: null }],
    memberships: [{ family_id: scope.family_id, user_id: db.userId, role: 'owner' }] });
});
afterEach(async () => db.delete());

async function acknowledge(local: LocalEvent) {
  const op = (await store.nextOperation())!;
  const { deleted, ...fields } = local.body;
  const event: ServerEvent = { ...fields, id: local.id, ...scope,
    revision: String(BigInt(op.request!.p_base_revision) + 1n), deleted_at: deleted ? '2020-01-02T00:00:00Z' : null };
  await store.acknowledge(op, { operation_id: op.operation_id, status: 'accepted', cursor: '1', event });
}

it('allows a note edit after ACK changes metadata/version but not content', async () => {
  const opened = await store.save(scope, 'event', body);
  await acknowledge(opened);
  expect((await store.list(scope))[0].version).toBeGreaterThan(opened.version);
  const edited = await saveUnchangedEvent(store, opened, { ...body, note: 'Ghi chú mới' });
  expect(edited.body.note).toBe('Ghi chú mới');
  expect((await store.nextOperation())!.request!.p_base_revision).toBe('1');
});
it('can undo a deletion after ACK normalizes timestamps and key order', async () => {
  const opened = await store.save(scope, 'event', body); await acknowledge(opened);
  const deleted = await saveUnchangedEvent(store, opened, { ...body, deleted: true }); await acknowledge(deleted);
  const restored = await saveUnchangedEvent(store, deleted, body);
  expect(restored.body.deleted).toBe(false);
  expect(restored.body.note).toBe('');
});
it('does not overwrite a genuinely changed note or append a stale operation', async () => {
  const opened = await store.save(scope, 'event', body);
  await store.save(scope, 'event', { ...body, note: 'Người khác đã sửa' }, opened.version);
  const count = await db.outbox.count();
  await expect(saveUnchangedEvent(store, opened, { ...body, note: 'Bản cũ' })).rejects.toThrow('Bản ghi đã thay đổi');
  expect(await db.outbox.count()).toBe(count);
  expect((await store.list(scope))[0].body.note).toBe('Người khác đã sửa');
});
it('does not overwrite a remote change that arrives while the sheet is open', async () => {
  const opened = await store.save(scope, 'event', body); await acknowledge(opened);
  const current = (await store.list(scope))[0];
  await store.applyPage(scope.family_id, '0', { changes: [{ cursor: '2', event: { ...current.server!, revision: '2', note: 'Remote edit' } }], next_cursor: '2', has_more: false });
  await expect(saveUnchangedEvent(store, opened, { ...body, deleted: true })).rejects.toThrow('Bản ghi đã thay đổi');
  expect(await db.outbox.count()).toBe(0);
});
it('preserves scope checks when a family is revoked', async () => {
  const opened = await store.save(scope, 'event', body);
  await store.saveWorkspace({ families: [], babies: [], memberships: [] });
  await expect(saveUnchangedEvent(store, opened, { ...body, note: 'stale' })).rejects.toThrow('Phạm vi');
});
it('serializes concurrent edits against the same original content', async () => {
  const opened = await store.save(scope, 'event', body);
  const results = await Promise.allSettled([
    saveUnchangedEvent(store, opened, { ...body, note: 'one' }),
    saveUnchangedEvent(store, opened, { ...body, note: 'two' }),
  ]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(await db.outbox.count()).toBe(2);
});
it('compares every activity payload and normalizes equivalent timestamps', () => {
  expect(eventBodyKey(body)).toBe(eventBodyKey({ ...body, started_at: '2020-01-01T10:00:00.000Z' }));
  expect(eventBodyKey(body)).not.toBe(eventBodyKey({ ...body, type: 'bottle', payload: { amount_ml: 120, milk: 'formula' } }));
  expect(eventBodyKey(body)).not.toBe(eventBodyKey({ ...body, type: 'bottle', payload: { amount_ml: 90, milk: 'breast_milk' } }));
  expect(eventBodyKey({ ...body, type: 'diaper', payload: { kind: 'wet' } }))
    .not.toBe(eventBodyKey({ ...body, type: 'diaper', payload: { kind: 'dirty' } }));
  const segment = { side: 'left' as const, started_at: body.started_at, ended_at: null };
  expect(eventBodyKey({ ...body, type: 'breast', payload: { segments: [segment] } }))
    .not.toBe(eventBodyKey({ ...body, type: 'breast', payload: { segments: [{ ...segment, side: 'right' }] } }));
  expect(eventBodyKey({ ...body, type: 'sleep', payload: {} }))
    .not.toBe(eventBodyKey({ ...body, type: 'sleep', payload: {}, ended_at: '2020-01-01T11:00:00Z' }));
});