import { expect, it } from 'vitest';
import { dayKey, summarize } from './summary';
import type { LocalEvent } from './types';

it('day filtering uses family timezone, not device timezone', () => {
  const now = Date.parse('2020-01-01T18:00:00Z');
  expect(dayKey(now, 'Asia/Ho_Chi_Minh')).toBe('2020-01-02');
  expect(dayKey(now, 'America/New_York')).toBe('2020-01-01');
});
it('sleep crossing the window is clipped; deleted events never contribute', () => {
  const from = Date.parse('2020-01-01T10:00:00Z');
  const event: LocalEvent = { id: 'e', family_id: 'f', baby_id: 'b', version: 1, server: null,
    body: { type: 'sleep', payload: {}, note: '', deleted: false, started_at: '2020-01-01T09:00:00Z', ended_at: null } };
  expect(summarize([event], from, from + 3_600_000).sleep).toBe(3_600_000);
  expect(summarize([{ ...event, body: { ...event.body, deleted: true } }], from, from + 3_600_000).sleep).toBe(0);
});