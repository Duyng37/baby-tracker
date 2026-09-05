import type { LocalStore } from '../data/store';
import { DataError } from '../domain/events';
import type { EventBody, LocalEvent } from '../domain/types';
import { eventBodyKey } from '../domain/event-key';
export { eventBodyKey } from '../domain/event-key';

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