import type { LocalStore } from './store';
import { DataError, isRunning, validateBody } from '../domain/events';
import { eventBodyKey } from '../domain/event-key';
import { parseBackup, type Backup, type BackupEvent } from './backup-format';

export async function exportBackup(store: LocalStore, projectId: string): Promise<Backup> {
  return store.db.transaction('r', store.db.state, store.db.events, async () => {
    const ws = await store.workspace();
    const permitted = new Set(ws.memberships.filter(member => member.user_id === store.db.userId).map(member => member.family_id));
    const families = ws.families.filter(family => permitted.has(family.id)).map(({ id, name, timezone }) => ({ id, name, timezone }));
    const babies = ws.babies.filter(baby => families.some(family => family.id === baby.family_id))
      .map(({ id, family_id, nickname, birth_date }) => ({ id, family_id, nickname, birth_date }));
    const scopes = new Map(babies.map(baby => [baby.id, baby.family_id]));
    const events = (await store.db.events.toArray()).filter(event => scopes.get(event.baby_id) === event.family_id)
      .map(({ id, family_id, baby_id, body }) => ({ id, family_id, baby_id, body }));
    // Allowlist only: no state dump, vault, outbox requests, members, revisions or invitation drafts.
    return parseBackup(JSON.stringify({ format: 'noi-backup', version: 1, projectId, userId: store.db.userId,
      exportedAt: new Date().toISOString(), families, babies, events }));
  });
}
export type RestoreReport = { added: number; identical: number; different: number; unavailable: number; deleted: number; running: number };
type Plan = { report: RestoreReport; additions: BackupEvent[] };

async function plan(store: LocalStore, backup: Backup, projectId: string): Promise<Plan> {
  if (backup.projectId !== projectId || backup.userId !== store.db.userId) {
    throw new DataError('Hãy đăng nhập đúng tài khoản và project đã tạo bản sao lưu.');
  }
  const ws = await store.workspace();
  const permitted = new Set(ws.memberships.filter(member => member.user_id === store.db.userId).map(member => member.family_id));
  const scopes = new Map(ws.babies.filter(baby => permitted.has(baby.family_id)
    && ws.families.some(family => family.id === baby.family_id)).map(baby => [baby.id, baby.family_id]));
  const existing = new Map((await store.db.events.toArray()).map(event => [event.id, event]));
  const report: RestoreReport = { added: 0, identical: 0, different: 0, unavailable: 0, deleted: 0, running: 0 };
  const additions: BackupEvent[] = [];
  for (const event of backup.events) {
    if (scopes.get(event.baby_id) !== event.family_id) { report.unavailable++; continue; }
    const old = existing.get(event.id);
    if (old) {
      if (old.family_id !== event.family_id || old.baby_id !== event.baby_id) throw new DataError('Định danh ghi nhận trùng với hồ sơ khác. Không nhập tệp này.');
      if (eventBodyKey(old.body) === eventBodyKey(event.body)) report.identical++;
      else report.different++;
    } else if (event.body.deleted) report.deleted++;
    else if (isRunning(event.body)) report.running++;
    else { validateBody(event.body); report.added++; additions.push(event); }
  }
  return { report, additions };
}
export async function previewRestore(store: LocalStore, backup: Backup, projectId: string): Promise<RestoreReport> {
  const snapshot = parseBackup(JSON.stringify(backup));
  return store.db.transaction('r', store.db.state, store.db.events, async () => (await plan(store, snapshot, projectId)).report);
}
/** Caller refreshes cloud membership/history before this atomic, insert-only transaction. */
export async function restoreBackup(store: LocalStore, backup: Backup, projectId: string, signal?: AbortSignal): Promise<RestoreReport> {
  signal?.throwIfAborted();
  const snapshot = parseBackup(JSON.stringify(backup));
  return store.db.transaction('rw', store.db.state, store.db.events, store.db.outbox, async () => {
    const { report, additions } = await plan(store, snapshot, projectId);
    for (const event of additions) {
      signal?.throwIfAborted();
      await store.save({ family_id: event.family_id, baby_id: event.baby_id }, event.id, event.body);
    }
    signal?.throwIfAborted();
    return report;
  });
}