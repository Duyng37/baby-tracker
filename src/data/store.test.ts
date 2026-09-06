import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrackerDB } from './database';
import { LocalStore } from './store';
import type { EventBody, LocalEvent, ServerEvent, Workspace } from '../domain/types';
import { startTimer } from '../domain/events';

const scope = { family_id: 'family-a', baby_id: 'baby-a' };
const body: EventBody = { type: 'bottle', started_at: '2020-01-01T10:00:00Z', ended_at: null,
  payload: { amount_ml: 90, milk: 'formula' }, note: '', deleted: false };
const workspace: Workspace = { families: [{ id: scope.family_id, name: 'Test', timezone: 'Asia/Ho_Chi_Minh', sync_cursor: '99' }],
  babies: [{ id: scope.baby_id, family_id: scope.family_id, nickname: 'Test', birth_date: null }],
  memberships: [{ family_id: scope.family_id, user_id: 'user-a', role: 'owner' }] };
function server(local: LocalEvent, revision = '1'): ServerEvent {
  const { deleted, ...fields } = local.body;
  return { ...fields, id: local.id, ...scope, revision, deleted_at: deleted ? '2020-01-02T00:00:00Z' : null };
}
let db: TrackerDB;
let store: LocalStore;
const opened: TrackerDB[] = [];
beforeEach(async () => {
  db = new TrackerDB(crypto.randomUUID(), 'user-a'); opened.push(db);
  store = new LocalStore(db); await store.saveWorkspace(workspace);
});
afterEach(async () => { for (const item of opened.splice(0)) await item.delete(); });

describe('IndexedDB/outbox invariants', () => {
  it('persists local event and outbox across close/reopen without network', async () => {
    await store.save(scope, 'event-a', body); db.close(); await db.open();
    expect((await store.list(scope))[0].body).toEqual(body);
    expect(await db.outbox.count()).toBe(1);
    expect(await store.cursor(scope.family_id)).toBe('0'); // Never metadata cursor 99.
  });
  it('rolls back the event when outbox storage fails', async () => {
    const fail = () => { throw new Error('simulated quota'); };
    db.outbox.hook('creating', fail);
    await expect(store.save(scope, 'event-a', body)).rejects.toThrow();
    db.outbox.hook('creating').unsubscribe(fail);
    expect(await db.events.count()).toBe(0); expect(await db.outbox.count()).toBe(0);
  });
  it('validates before mutation and rejects injected identity fields', async () => {
    await expect(store.save(scope, 'event-a', { ...body, created_by: 'other' } as EventBody)).rejects.toThrow();
    await expect(store.save(scope, 'event-a', { ...body, payload: { amount_ml: -1, milk: 'formula' } } as EventBody)).rejects.toThrow();
    expect(await db.events.count()).toBe(0);
  });
  it('blocks wrong baby/family and stale edits', async () => {
    await expect(store.save({ ...scope, baby_id: 'baby-b' }, 'event-a', body)).rejects.toThrow();
    await store.save(scope, 'event-a', body);
    await expect(store.save(scope, 'event-a', body, 0)).rejects.toThrow();
    expect(await db.outbox.count()).toBe(1);
  });
  it('isolates accounts and project origins', async () => {
    await store.save(scope, 'event-a', body);
    const other = new TrackerDB('other-project', 'user-b'); opened.push(other);
    const otherStore = new LocalStore(other); await otherStore.saveWorkspace(workspace);
    expect((await otherStore.workspace()).families).toEqual([]);
    expect(await other.events.count()).toBe(0);
    await expect(otherStore.list(scope)).rejects.toThrow();
  });
  it('serializes two simultaneous timer starts; other babies can run independently', async () => {
    const timer = startTimer('sleep');
    const results = await Promise.allSettled([store.save(scope, 'one', timer), store.save(scope, 'two', timer)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    await store.saveWorkspace({ ...workspace, babies: [...workspace.babies, { ...workspace.babies[0], id: 'baby-b' }] });
    await store.save({ ...scope, baby_id: 'baby-b' }, 'three', timer);
    expect(await db.outbox.count()).toBe(2);
  });
  it('freezes requests and preserves later local edits across ACK', async () => {
    const first = await store.save(scope, 'event-a', body);
    const op = (await store.nextOperation())!;
    const frozen = structuredClone(op.request);
    await store.save(scope, first.id, { ...body, note: 'later' }, first.version);
    expect((await store.nextOperation())!.request).toEqual(frozen);
    await store.acknowledge(op, { operation_id: op.operation_id, status: 'accepted', event: server(first), cursor: '10' });
    expect((await store.list(scope))[0].body.note).toBe('later');
    const next = (await store.nextOperation())!;
    expect(next.request!.p_base_revision).toBe('1');
    expect(next.operation_id).not.toBe(op.operation_id);
    expect(await store.cursor(scope.family_id)).toBe('0');
  });
  it('dependent edits use parent ACK, never automatically rebase onto a remote edit', async () => {
    const first = await store.save(scope, 'event-a', body);
    const op = (await store.nextOperation())!;
    await store.save(scope, first.id, { ...body, note: 'local' }, first.version);
    await store.applyPage(scope.family_id, '0', { changes: [{ cursor: '2', event: { ...server(first, '2'), note: 'remote' } }], next_cursor: '2', has_more: false });
    await store.acknowledge(op, { operation_id: op.operation_id, status: 'accepted', event: server(first), cursor: '1' });
    expect((await store.nextOperation())!.request!.p_base_revision).toBe('1');
    expect((await store.list(scope))[0].server!.revision).toBe('2');
    expect((await store.list(scope))[0].body.note).toBe('local');
  });
  it('old/duplicate ACK cannot downgrade newer server data', async () => {
    const first = await store.save(scope, 'event-a', body); const op = (await store.nextOperation())!;
    await store.applyPage(scope.family_id, '0', { changes: [{ cursor: '3', event: { ...server(first, '3'), note: 'newest' } }], next_cursor: '3', has_more: false });
    const ack = { operation_id: op.operation_id, status: 'accepted' as const, event: server(first), cursor: '1' };
    await store.acknowledge(op, ack); await store.acknowledge(op, ack);
    expect((await store.list(scope))[0].body.note).toBe('newest');
    expect(await db.outbox.count()).toBe(0);
  });
  it('keeps conflict and descendants, while independent events can sync', async () => {
    const first = await store.save(scope, 'event-a', body); const op = (await store.nextOperation())!;
    await store.save(scope, first.id, { ...body, note: 'later' }, first.version);
    await store.save(scope, 'event-b', body);
    await store.acknowledge(op, { operation_id: op.operation_id, status: 'conflict', reason: 'revision', event: server(first, '2') });
    expect((await store.nextOperation())!.event_id).toBe('event-b');
    expect((await store.list(scope)).find(e => e.id === first.id)!.body.note).toBe('later');
    expect(await db.outbox.count()).toBe(3);
  });
  it('quarantines revoked scope without deleting pending data', async () => {
    await store.save(scope, 'event-a', body); await store.quarantine(scope.family_id);
    expect(await store.nextOperation()).toBeUndefined();
    await expect(store.list(scope)).rejects.toThrow();
    expect(await db.outbox.count()).toBe(1); expect(await db.events.count()).toBe(1);
  });
  it('requeues blocked cloud failures without changing their frozen request', async () => {
    await store.save(scope, 'event-a', body);
    const op = (await store.nextOperation())!;
    await db.outbox.update(op.sequence!, { blocked: true });
    expect(await store.nextOperation()).toBeUndefined();
    expect(await store.retryBlocked(scope.family_id)).toBe(1);
    const retry = (await store.nextOperation())!;
    expect(retry.operation_id).toBe(op.operation_id);
    expect(retry.request).toEqual(op.request);
    expect(retry.blocked).toBeUndefined();
  });
  it('applies pages atomically, rejects cross-scope payload and stale cursor', async () => {
    const first = await store.save(scope, 'event-a', body);
    const wrong = { ...server(first), id: 'wrong', baby_id: 'not-in-family' };
    await expect(store.applyPage(scope.family_id, '0', { changes: [{ cursor: '1', event: server(first) }, { cursor: '2', event: wrong }], next_cursor: '2', has_more: false })).rejects.toThrow();
    expect(await store.cursor(scope.family_id)).toBe('0'); expect((await db.events.get(first.id))!.server).toBeNull();
    await store.applyPage(scope.family_id, '0', { changes: [{ cursor: '1', event: server(first) }], next_cursor: '1', has_more: false });
    expect(await store.applyPage(scope.family_id, '0', { changes: [], next_cursor: '0', has_more: false })).toBe(false);
    expect(await store.cursor(scope.family_id)).toBe('1');
  });
  it('retains tombstones and decimal cursors beyond Number precision', async () => {
    const local: LocalEvent = { ...scope, id: 'event-a', body, server: null, version: 0 };
    const tombstone = { ...server(local, '9007199254740993'), deleted_at: '2020-01-02T00:00:00Z' };
    await store.applyPage(scope.family_id, '0', { changes: [{ cursor: '9007199254740993', event: tombstone }], next_cursor: '9007199254740993', has_more: false });
    expect((await store.list(scope))[0].body.deleted).toBe(true);
    expect(await store.cursor(scope.family_id)).toBe('9007199254740993');
  });
  it('rejects mismatched ACK operation, scope and revision', async () => {
    const first = await store.save(scope, 'event-a', body); const op = (await store.nextOperation())!;
    const ack = { operation_id: op.operation_id, status: 'accepted' as const, event: server(first), cursor: '1' };
    await expect(store.acknowledge(op, { ...ack, operation_id: 'other' })).rejects.toThrow();
    await expect(store.acknowledge(op, { ...ack, event: { ...ack.event, family_id: 'other' } })).rejects.toThrow();
    await expect(store.acknowledge(op, { ...ack, event: server(first, '3') })).rejects.toThrow();
    expect(await db.outbox.count()).toBe(1);
  });
});
