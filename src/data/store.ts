import { DataError, decimal, isRunning, serverBody, validateBody } from '../domain/events';
import { emptyWorkspace, type ApplyResult, type ChangePage, type EventBody, type LocalEvent,
  type Operation, type Scope, type ServerEvent, type Workspace } from '../domain/types';
import { TrackerDB } from './database';

export class LocalStore {
  constructor(readonly db: TrackerDB) {}

  async workspace(): Promise<Workspace> {
    return (await this.db.state.get('workspace'))?.value as Workspace ?? emptyWorkspace();
  }

  async saveWorkspace(workspace: Workspace) {
    // RLS remains the security boundary. This check also avoids exposing stale local scopes.
    const allowed = new Set(workspace.memberships.filter(m => m.user_id === this.db.userId).map(m => m.family_id));
    const filtered: Workspace = {
      families: workspace.families.filter(f => allowed.has(f.id)),
      babies: workspace.babies.filter(b => allowed.has(b.family_id)),
      memberships: workspace.memberships.filter(m => allowed.has(m.family_id)),
    };
    await this.db.state.put({ key: 'workspace', value: filtered });
    // Revoked scopes are hidden/quarantined, NEVER deleted or silently retried.
  }

  async assertScope(scope: Scope) {
    const workspace = await this.workspace();
    if (!workspace.families.some(f => f.id === scope.family_id)
      || !workspace.babies.some(b => b.id === scope.baby_id && b.family_id === scope.family_id)) {
      throw new DataError('Phạm vi gia đình/bé không còn khả dụng trên thiết bị.');
    }
  }

  async list(scope: Scope): Promise<LocalEvent[]> {
    return this.db.transaction('r', this.db.state, this.db.events, async () => {
      await this.assertScope(scope);
      return this.db.events.where('[family_id+baby_id]').equals([scope.family_id, scope.baby_id]).toArray();
    });
  }

  async save(scope: Scope, id: string, body: EventBody, expectedVersion = 0) {
    const snapshot = structuredClone(body);
    validateBody(snapshot);
    return this.db.transaction('rw', this.db.events, this.db.outbox, this.db.state, async () => {
      await this.assertScope(scope);
      const old = await this.db.events.get(id);
      if ((old?.version ?? 0) !== expectedVersion || (old && (old.family_id !== scope.family_id || old.baby_id !== scope.baby_id))) {
        throw new DataError('Bản ghi đã thay đổi. Hãy mở lại trước khi sửa.');
      }
      if (old && old.body.type !== snapshot.type) throw new DataError();
      const pending = await this.db.outbox.where('event_id').equals(id).sortBy('sequence');
      if (pending.some(op => op.conflict || op.blocked)) throw new DataError('Bản ghi đang chờ xử lý xung đột/lỗi; dữ liệu vẫn được giữ.');
      if (isRunning(snapshot)) {
        const siblings = await this.db.events.where('[family_id+baby_id]').equals([scope.family_id, scope.baby_id]).toArray();
        if (siblings.some(e => e.id !== id && e.body.type === snapshot.type && isRunning(e.body))) throw new DataError('Bé đã có timer loại này đang chạy.');
      }
      const previous = pending.at(-1);
      const event: LocalEvent = { ...scope, id, body: snapshot, server: old?.server ?? null, version: expectedVersion + 1 };
      await this.db.events.put(event);
      await this.db.outbox.add({ ...scope, event_id: id, operation_id: crypto.randomUUID(), body: snapshot,
        depends_on: previous?.operation_id ?? null, base_revision: previous ? null : old?.server?.revision ?? '0' });
      return event;
    });
  }

  async nextOperation(): Promise<Operation | undefined> {
    return this.db.transaction('rw', this.db.state, this.db.outbox, async () => {
      const workspace = await this.workspace();
      const allowed = new Set(workspace.families.map(f => f.id));
      const op = (await this.db.outbox.orderBy('sequence').toArray())
        .find(op => allowed.has(op.family_id) && !op.depends_on && !op.conflict && !op.blocked);
      if (!op) return;
      await this.assertScope(op);
      if (!op.request) {
        let device = (await this.db.state.get('device'))?.value as string | undefined;
        if (!device) { device = crypto.randomUUID(); await this.db.state.put({ key: 'device', value: device }); }
        if (op.base_revision === null) throw new DataError();
        op.request = { p_operation_id: op.operation_id, p_device_id: device, p_family_id: op.family_id,
          p_baby_id: op.baby_id, p_event_id: op.event_id, p_base_revision: op.base_revision, p_event: op.body };
        // Persist the EXACT request before I/O. Retry never reconstructs it from the live event.
        await this.db.outbox.put(op);
      }
      return op;
    });
  }

  async retryBlocked(family: string): Promise<number> {
    return this.db.transaction('rw', this.db.state, this.db.outbox, async () => {
      const workspace = await this.workspace();
      if (!workspace.families.some(item => item.id === family)) throw new DataError('Gia đình không còn khả dụng trên thiết bị.');
      const blocked = (await this.db.outbox.where('family_id').equals(family).toArray())
        .filter(op => op.blocked && !op.conflict);
      for (const op of blocked) {
        const retry = { ...op };
        delete retry.blocked;
        await this.db.outbox.put(retry);
      }
      return blocked.length;
    });
  }

  private async mergeServer(event: ServerEvent) {
    decimal(event.revision);
    const old = await this.db.events.get(event.id);
    if (old && (old.family_id !== event.family_id || old.baby_id !== event.baby_id || old.body.type !== event.type)) throw new DataError();
    if (old?.server && BigInt(old.server.revision) >= BigInt(event.revision)) return;
    const pending = await this.db.outbox.where('event_id').equals(event.id).count();
    await this.db.events.put({ id: event.id, family_id: event.family_id, baby_id: event.baby_id,
      server: event, body: old && pending ? old.body : serverBody(event), version: (old?.version ?? 0) + 1 });
  }

  async acknowledge(operation: Operation, result: ApplyResult) {
    if (result.operation_id !== operation.operation_id) throw new DataError();
    for (const event of [result.event, result.status === 'conflict' ? result.active_event : null]) {
      if (event && (event.family_id !== operation.family_id || event.baby_id !== operation.baby_id)) throw new DataError();
    }
    if (result.event && result.event.id !== operation.event_id) throw new DataError();
    if (result.status === 'accepted' && BigInt(result.event.revision) !== BigInt(operation.request!.p_base_revision) + 1n) throw new DataError();
    await this.db.transaction('rw', this.db.state, this.db.outbox, this.db.events, async () => {
      const op = await this.db.outbox.where('operation_id').equals(operation.operation_id).first();
      if (!op || op.conflict) return; // Duplicate ACK from another tab is harmless.
      if (result.status === 'conflict') {
        await this.db.outbox.put({ ...op, conflict: result });
        if (result.event) await this.mergeServer(result.event);
        if (result.active_event) await this.mergeServer(result.active_event);
        return;
      }
      await this.db.outbox.delete(op.sequence!);
      const dependents = await this.db.outbox.where('depends_on').equals(op.operation_id).toArray();
      for (const child of dependents) {
        await this.db.outbox.put({ ...child, depends_on: null, base_revision: result.event.revision });
      }
      await this.mergeServer(result.event);
      const current = await this.db.events.get(op.event_id);
      if (current?.server && !(await this.db.outbox.where('event_id').equals(op.event_id).count())) {
        await this.db.events.put({ ...current, body: serverBody(current.server), version: current.version + 1 });
      }
      // ACK cursor is NOT the pull cursor; other devices' changes may be in between.
    });
  }

  async cursor(family: string): Promise<string> {
    return (await this.db.state.get(`cursor:${family}`))?.value as string ?? '0';
  }

  async applyPage(family: string, after: string, page: ChangePage) {
    decimal(after); decimal(page.next_cursor);
    let previous = BigInt(after);
    for (const change of page.changes) {
      decimal(change.cursor);
      if (BigInt(change.cursor) <= previous || change.event.family_id !== family) throw new DataError();
      previous = BigInt(change.cursor);
    }
    if (previous !== BigInt(page.next_cursor) || (page.has_more && !page.changes.length)) throw new DataError();
    return this.db.transaction('rw', this.db.state, this.db.events, this.db.outbox, async () => {
      if (await this.cursor(family) !== after) return false; // Stale page from another worker.
      for (const change of page.changes) {
        await this.assertScope(change.event);
        await this.mergeServer(change.event);
      }
      await this.db.state.put({ key: `cursor:${family}`, value: page.next_cursor });
      return true;
    });
  }

  async quarantine(family: string) {
    await this.db.transaction('rw', this.db.state, async () => {
      const ws = await this.workspace();
      await this.saveWorkspace({ families: ws.families.filter(f => f.id !== family), babies: ws.babies.filter(b => b.family_id !== family),
        memberships: ws.memberships.filter(m => m.family_id !== family) });
    });
  }
}