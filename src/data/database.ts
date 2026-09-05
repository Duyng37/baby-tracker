import Dexie, { type Table } from 'dexie';
import type { LocalEvent, Operation } from '../domain/types';

export class TrackerDB extends Dexie {
  events!: Table<LocalEvent, string>;
  outbox!: Table<Operation, number>;
  state!: Table<{ key: string; value: unknown }, string>;

  constructor(project: string, readonly userId: string) {
    // Never include keys, sessions or invitation tokens in database names/content.
    super(`noi-v1:${encodeURIComponent(project)}:${encodeURIComponent(userId)}`);
    this.version(1).stores({
      events: '&id, family_id, [family_id+baby_id]',
      outbox: '++sequence, &operation_id, event_id, family_id, depends_on',
      state: '&key',
    });
  }
}