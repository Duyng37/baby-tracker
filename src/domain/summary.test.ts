import { expect, it } from 'vitest';
import { dayBounds, dayKey, summarize, summarizeDay } from './summary';
import type { EventBody, LocalEvent } from './types';

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

const timezone = 'Asia/Ho_Chi_Minh';
const local = (body: EventBody): LocalEvent => ({ id: 'event', family_id: 'family', baby_id: 'baby', version: 1, server: null, body });
const bottle = (started_at: string, amount_ml = 90) => local({ type: 'bottle', started_at, ended_at: null,
  deleted: false, note: '', payload: { amount_ml, milk: 'formula' } });
const timer = (type: 'sleep' | 'breast', started_at: string, ended_at: string | null = null) => local({
  started_at, ended_at, deleted: false, note: '', ...(type === 'sleep' ? { type, payload: {} }
    : { type, payload: { segments: [{ side: 'left', started_at, ended_at }] } }),
});

it.each([
  ['2026-09-05', timezone, '2026-09-04T17:00:00.000Z', '2026-09-05T17:00:00.000Z'],
  ['2026-03-08', 'America/New_York', '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z'],
  ['2026-11-01', 'America/New_York', '2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z'],
  ['2018-11-04', 'America/Sao_Paulo', '2018-11-04T03:00:00.000Z', '2018-11-05T02:00:00.000Z'],
])('resolves calendar boundaries for %s in %s', (day, zone, start, end) => {
  expect(dayBounds(day, zone).map(at => new Date(at).toISOString())).toEqual([start, end]);
});

it('today includes local midnight but excludes yesterday, deleted records and future records', () => {
  const now = Date.parse('2026-09-05T02:00:00Z'); // 09:00 in the family timezone.
  const deleted = bottle('2026-09-05T00:00:00Z', 200);
  deleted.body.deleted = true;
  const events = [bottle('2026-09-04T16:59:59.999Z', 120), bottle('2026-09-04T17:00:00Z'),
    bottle('2026-09-05T01:00:00Z', 60), bottle('2026-09-05T03:00:00Z', 300), deleted];
  const diaper = (event: LocalEvent) => local({ ...event.body, type: 'diaper', payload: { kind: 'wet' } });
  expect(summarizeDay([...events, ...events.map(diaper)], '2026-09-05', timezone, now))
    .toEqual({ bottle: 150, diapers: 2, sleep: 0, breast: 0 });
});

it('a past day includes its final millisecond, not the next midnight', () => {
  const events = [bottle('2026-09-03T17:00:00Z'), bottle('2026-09-04T16:59:59.999Z', 60),
    bottle('2026-09-04T17:00:00Z', 120)];
  expect(summarizeDay(events, '2026-09-04', timezone, Date.parse('2026-09-05T02:00:00Z')).bottle).toBe(150);
});

it.each(['sleep', 'breast'] as const)('clips completed and running %s timers to the selected day and now', type => {
  const now = Date.parse('2026-09-05T02:00:00Z');
  const completed = timer(type, '2026-09-04T16:30:00Z', '2026-09-04T18:00:00Z');
  const running = timer(type, '2026-09-04T16:00:00Z');
  expect(summarizeDay([completed], '2026-09-04', timezone, now)[type]).toBe(30 * 60_000);
  expect(summarizeDay([completed], '2026-09-05', timezone, now)[type]).toBe(3_600_000);
  expect(summarizeDay([running], '2026-09-04', timezone, now)[type]).toBe(3_600_000);
  expect(summarizeDay([running], '2026-09-05', timezone, now)[type]).toBe(9 * 3_600_000);
  const futureEnd = timer(type, running.body.started_at, '2026-09-05T03:00:00Z');
  expect(summarizeDay([futureEnd], '2026-09-05', timezone, now)[type]).toBe(9 * 3_600_000);
});

it.each([['2026-03-08', 23], ['2026-11-01', 25]] as const)('counts actual timer hours on DST day %s', (day, hours) => {
  const events = [timer('sleep', `${day}T00:00:00Z`)];
  expect(summarizeDay(events, day, 'America/New_York', Date.parse('2026-11-03T00:00:00Z')).sleep).toBe(hours * 3_600_000);
});

it('returns zero for an empty day or a future day, even with an ongoing timer', () => {
  const now = Date.parse('2026-09-05T02:00:00Z');
  const empty = { bottle: 0, diapers: 0, sleep: 0, breast: 0 };
  expect(summarizeDay([], '2026-09-05', timezone, now)).toEqual(empty);
  expect(summarizeDay([timer('sleep', '2026-09-04T16:00:00Z'), bottle('2026-09-06T01:00:00Z')],
    '2026-09-06', timezone, now)).toEqual(empty);
});