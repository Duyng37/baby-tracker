import { expect, it } from 'vitest';
import { parseEvent, parsePage, parseResult, parseWorkspace } from './protocol';

const event = { id: 'test', family_id: 'f', baby_id: 'b', type: 'sleep', payload: {}, note: '',
  started_at: '2020-01-01T10:00:00+00:00', ended_at: null, deleted_at: null, revision: '9007199254740993' };
it('accepts backend timestamps and preserves bigint strings', () => {
  expect(parseEvent(event).revision).toBe('9007199254740993');
  expect(parseResult({ operation_id: 'o', status: 'accepted', event, cursor: '10' }).status).toBe('accepted');
});
it('rejects malformed cloud data before it reaches local storage', () => {
  expect(() => parseEvent({ ...event, revision: 1 })).toThrow();
  expect(() => parseEvent({ ...event, type: 'bottle' })).toThrow();
  expect(() => parsePage({ changes: [], next_cursor: 1, has_more: false })).toThrow();
  expect(() => parseResult({ operation_id: 'o', status: 'conflict', reason: 'unknown', event })).toThrow();
  expect(() => parseWorkspace({ families: [], babies: [], memberships: [{ role: 'admin' }] })).toThrow();
});