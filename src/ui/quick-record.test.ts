import { expect, it } from 'vitest';
import { changeTimer, isRunning, startTimer, validateBody } from '../domain/events';
import { quickRecord, type QuickChoice } from './quick-record';

const now = Date.parse('2026-09-05T09:00:00Z');
const timezone = 'Asia/Ho_Chi_Minh';
const choices: QuickChoice[] = [
  { type: 'bottle', amount: 90, milk: 'formula' }, { type: 'bottle', amount: 115.5, milk: 'breast_milk' },
  { type: 'diaper', kind: 'wet' }, { type: 'diaper', kind: 'dirty' }, { type: 'diaper', kind: 'mixed' },
  { type: 'breast', side: 'left' }, { type: 'breast', side: 'right' }, { type: 'sleep' },
];
it.each(choices)('defaults a $type entry to the save timestamp', choice => {
  const body = quickRecord(choice, '', '', timezone, now);
  expect(body.started_at).toBe(new Date(now).toISOString());
  expect(body.ended_at).toBeNull();
  expect(() => validateBody(body, now)).not.toThrow();
});
it.each(choices)('backdates a $type entry using the separate date/time values', choice => {
  const body = quickRecord(choice, '2026-09-04', '08:30', timezone, now);
  expect(body.started_at).toBe('2026-09-04T01:30:00.000Z');
  if (body.type === 'breast') expect(body.payload.segments[0].started_at).toBe(body.started_at);
  expect(() => validateBody(body, now)).not.toThrow();
});
it.each(['sleep', 'breast'] as const)('can stop a %s timer at an optional past time without changing its start', type => {
  const running = startTimer(type, 'left', now - 3_600_000);
  const stopped = quickRecord({ type: 'stop', body: running }, '2026-09-05', '15:30', timezone, now);
  expect(stopped.started_at).toBe(running.started_at);
  expect(stopped.ended_at).toBe('2026-09-05T08:30:00.000Z');
  expect(running.ended_at).toBeNull();
  if (stopped.type === 'breast') expect(stopped.payload.segments.at(-1)!.ended_at).toBe(stopped.ended_at);
});
it.each(['sleep', 'breast'] as const)('defaults stopping %s to now', type => {
  const stopped = quickRecord({ type: 'stop', body: startTimer(type, 'left', now - 3_600_000) }, '', '', timezone, now);
  expect(stopped.ended_at).toBe(new Date(now).toISOString());
});
it('rejects an explicit stop before the start or last nursing side switch', () => {
  const running = startTimer('breast', 'left', now - 3_600_000);
  const switched = changeTimer(running, 'switch', now - 600_000);
  expect(() => quickRecord({ type: 'stop', body: running }, '', '14:59', timezone, now)).toThrow('trước giờ bắt đầu');
  expect(() => quickRecord({ type: 'stop', body: switched }, '', '15:30', timezone, now)).toThrow('lần đổi bên');
});
it('keeps clock-rollback protection for default stop time and preserves payload validation', () => {
  const running = startTimer('sleep', 'left', now + 1000);
  expect(quickRecord({ type: 'stop', body: running }, '', '', timezone, now).ended_at).toBe(running.started_at);
  expect(() => quickRecord({ type: 'bottle', amount: 0, milk: 'formula' }, '', '', timezone, now)).toThrow();
});
it('keeps sleep running if neither wake field is entered', () => {
  const body = quickRecord({ type: 'sleep', wakeDate: '', wakeTime: '' }, '2026-09-04', '13:00', timezone, now);
  expect(body.ended_at).toBeNull();
  expect(isRunning(body)).toBe(true);
});
it('records a completed past sleep in one entry and does not start a timer', () => {
  const body = quickRecord({ type: 'sleep', wakeDate: '2026-09-04', wakeTime: '15:30' }, '2026-09-04', '13:00', timezone, now);
  expect(body.started_at).toBe('2026-09-04T06:00:00.000Z');
  expect(body.ended_at).toBe('2026-09-04T08:30:00.000Z');
  expect(isRunning(body)).toBe(false);
  expect(() => validateBody(body, now)).not.toThrow();
});
it('defaults a time-only wake field to the sleep date, not the recording date', () => {
  const body = quickRecord({ type: 'sleep', wakeTime: '15:00' }, '2026-09-03', '13:00', timezone, now);
  expect(body.ended_at).toBe('2026-09-03T08:00:00.000Z');
});
it('allows an explicitly selected next-day wake time for overnight sleep', () => {
  const body = quickRecord({ type: 'sleep', wakeDate: '2026-09-05', wakeTime: '06:00' }, '2026-09-04', '22:00', timezone, now);
  expect(Date.parse(body.ended_at!) - Date.parse(body.started_at)).toBe(8 * 3_600_000);
});
it('does not guess a wake time from a date-only selection', () => {
  expect(() => quickRecord({ type: 'sleep', wakeDate: '2026-09-05' }, '2026-09-04', '22:00', timezone, now)).toThrow('nhập giờ thức giấc');
});
it('rejects a wake time before the start rather than silently moving it to the next day', () => {
  expect(() => quickRecord({ type: 'sleep', wakeTime: '06:00' }, '2026-09-04', '22:00', timezone, now)).toThrow('ngày thức giấc');
});
it('rejects malformed and future wake timestamps', () => {
  expect(() => quickRecord({ type: 'sleep', wakeTime: 'bad' }, '2026-09-04', '22:00', timezone, now)).toThrow('không hợp lệ');
  expect(() => quickRecord({ type: 'sleep', wakeDate: '2026-02-30', wakeTime: '12:00' }, '2026-02-28', '22:00', timezone, now)).toThrow('không hợp lệ');
  expect(() => quickRecord({ type: 'sleep', wakeDate: '2026-09-06', wakeTime: '12:00' }, '2026-09-04', '22:00', timezone, now)).toThrow('tương lai');
});