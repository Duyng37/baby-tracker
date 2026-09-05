import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { TrackerDB } from '../data/database';
import { LocalStore } from '../data/store';
import type { ApplyRequest, ApplyResult, ChangePage, EventBody, ServerEvent, Workspace } from '../domain/types';
import { CloudError, retryDelay, synchronize, type Transport } from './engine';

const scope = { family_id: 'family', baby_id: 'baby' };
const body: EventBody = { type: 'sleep', started_at: '2020-01-01T10:00:00Z', ended_at: '2020-01-01T11:00:00Z', payload: {}, note: '', deleted: false };
const ws: Workspace = { families: [{ id: 'family', name: 'Test', timezone: 'Asia/Ho_Chi_Minh', sync_cursor: '0' }],
  babies: [{ id: 'baby', family_id: 'family', nickname: 'Test', birth_date: null }],
  memberships: [{ family_id: 'family', user_id: 'user', role: 'owner' }] };
class FakeTransport implements Transport {
  userId = 'user'; requests: ApplyRequest[] = []; changes: ChangePage['changes'] = [];
  responses = new Map<string, ApplyResult>(); loseResponse = false; failure: CloudError | null = null;
  pullCount = 0; workspaceCount = 0;
  async workspace() { this.workspaceCount++; return ws; }
  async apply(request: ApplyRequest): Promise<ApplyResult> {
    this.requests.push(structuredClone(request));
    if (this.failure) throw this.failure;
    let result = this.responses.get(request.p_operation_id);
    if (!result) {
      const { deleted, ...fields } = request.p_event;
      const event: ServerEvent = { ...fields, ...scope, id: request.p_event_id,
        revision: String(BigInt(request.p_base_revision) + 1n), deleted_at: deleted ? '2020-01-02T00:00:00Z' : null };
      const cursor = String(this.changes.length + 1);
      this.changes.push({ cursor, event });
      result = { operation_id: request.p_operation_id, status: 'accepted', event, cursor };
      this.responses.set(request.p_operation_id, result);
    }
    if (this.loseResponse) { this.loseResponse = false; throw new CloudError('retry'); }
    return result;
  }
  async pull(_family: string, after: string): Promise<ChangePage> {
    this.pullCount++;
    const changes = this.changes.filter(c => BigInt(c.cursor) > BigInt(after)).slice(0, 1);
    return { changes, next_cursor: changes.at(-1)?.cursor ?? after, has_more: this.changes.filter(c => BigInt(c.cursor) > BigInt(after)).length > 1 };
  }
}
let db: TrackerDB; let store: LocalStore; let api: FakeTransport;
beforeEach(async () => { db = new TrackerDB(crypto.randomUUID(), 'user'); store = new LocalStore(db); api = new FakeTransport(); await store.saveWorkspace(ws); });
afterEach(async () => { await db.delete(); });
const run = () => synchronize(store, api, new AbortController().signal);

it('offline intent is sent and ACKed, then paginated pull catches every change', async () => {
  await store.save(scope, 'one', body); await store.save(scope, 'two', body);
  await run();
  expect(api.requests).toHaveLength(2); expect(await db.outbox.count()).toBe(0);
  expect(await store.cursor('family')).toBe('2'); expect(api.pullCount).toBe(3);
  expect((await db.state.get('lastContact'))?.value).toBeTypeOf('number');
});
it('lost response and reload retry the immutable request, without duplicate server event', async () => {
  const local = await store.save(scope, 'one', body); api.loseResponse = true;
  await expect(run()).rejects.toMatchObject({ kind: 'retry' });
  await store.save(scope, 'one', { ...body, note: 'later edit' }, local.version);
  db.close(); await db.open(); await run();
  expect(api.requests[1]).toEqual(api.requests[0]);
  expect(api.requests[2].p_base_revision).toBe('1'); expect(api.changes).toHaveLength(2);
  expect(await db.outbox.count()).toBe(0); expect((await store.list(scope))[0].body.note).toBe('later edit');
});
it('auth failure retains outbox and never claims cloud success', async () => {
  await store.save(scope, 'one', body); api.failure = new CloudError('auth');
  await expect(run()).rejects.toMatchObject({ kind: 'auth' });
  expect(await db.outbox.count()).toBe(1); expect(await db.state.get('lastContact')).toBeUndefined();
});
it('forbidden response quarantines family and pending data', async () => {
  await store.save(scope, 'one', body); api.failure = new CloudError('forbidden');
  await expect(run()).rejects.toMatchObject({ kind: 'forbidden' });
  expect((await store.workspace()).families).toHaveLength(0);
  expect(await db.outbox.count()).toBe(1); expect(await db.events.count()).toBe(1);
});
it('invalid operation stops automatic retries without discarding it', async () => {
  await store.save(scope, 'one', body); api.failure = new CloudError('invalid');
  await expect(run()).rejects.toMatchObject({ kind: 'invalid' });
  expect((await db.outbox.toArray())[0].blocked).toBe(true); expect(await store.nextOperation()).toBeUndefined();
});
it('does not make even a workspace request with a mismatched account', async () => {
  api.userId = 'other'; await store.save(scope, 'one', body);
  await expect(run()).rejects.toMatchObject({ kind: 'auth' });
  expect(api.workspaceCount).toBe(0); expect(api.requests).toHaveLength(0);
});
it('abort on account switch retains uncertain operation; next run recovers ACK', async () => {
  await store.save(scope, 'one', body);
  const controller = new AbortController();
  const apply = api.apply.bind(api);
  api.apply = async request => { const result = await apply(request); controller.abort(); return result; };
  await expect(synchronize(store, api, controller.signal)).rejects.toThrow();
  expect(await db.outbox.count()).toBe(1); expect(await db.state.get('lastContact')).toBeUndefined();
  api.apply = apply; await run();
  expect(api.changes).toHaveLength(1); expect(await db.outbox.count()).toBe(0);
});
it('bounded exponential backoff with jitter', () => {
  expect(retryDelay(0, () => 0)).toBe(750);
  expect(retryDelay(100, () => 1)).toBe(60_000);
});