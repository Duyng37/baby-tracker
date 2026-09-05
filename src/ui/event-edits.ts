import type { LocalStore } from '../data/store';
import { DataError } from '../domain/events';
import type { EventBody, LocalEvent } from '../domain/types';

/** Compare content, not object-key order, timestamp spelling, or ACK-only local versions. */
export function eventBodyKey(body: EventBody) {
  const time = (value: string | null) => value === null ? null : Date.parse(value);
  const payload = body.type === 'bottle' ? [body.payload.amount_ml, body.payload.milk]
    : body.type === 'diaper' ? [body.payload.kind]
    : body.type === 'breast' ? body.payload.segments.map(segment => [segment.side, time(segment.started_at), time(segment.ended_at)]) : [];
  return JSON.stringify([body.type, time(body.started_at), time(body.ended_at), body.note, body.deleted, payload]);
}

export async function saveUnchangedEvent(store: LocalStore, before: LocalEvent, after: EventBody) {
  // Check and save atomically. A genuine edit, deletion, revoked scope or conflict still blocks the write.
  return store.db.transaction('rw', store.db.state, store.db.events, store.db.outbox, async () => {
    const latest = (await store.list(before)).find(event => event.id === before.id);
    if (!latest || eventBodyKey(latest.body) !== eventBodyKey(before.body)) {
      throw new DataError('Bản ghi đã thay đổi. Hãy mở lại trước khi sửa.');
    }
    return store.save(latest, latest.id, after, latest.version);
  });
}