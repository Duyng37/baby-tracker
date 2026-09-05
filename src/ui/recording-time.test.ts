import { afterEach, expect, it, vi } from 'vitest';
import { recordingTime } from './recording-time';

const timezone = 'Asia/Ho_Chi_Minh';
const now = Date.parse('2026-09-05T18:23:45.678Z'); // Sep 6, 01:23 in the family timezone.
afterEach(() => vi.useRealTimers());
const iso = (date: string, time: string, zone = timezone, at = now) => new Date(recordingTime(date, time, zone, at)).toISOString();

it('uses the actual save time when neither optional field is selected', () => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  expect(recordingTime('', '', timezone)).toBe(now);
  vi.setSystemTime(now + 120_000);
  expect(recordingTime('', '', timezone)).toBe(now + 120_000);
});
it('resolves separate date/time fields in the family timezone, including crossing UTC midnight', () => {
  expect(iso('2026-09-06', '00:30')).toBe('2026-09-05T17:30:00.000Z');
  expect(iso('2026-09-04', '14:15')).toBe('2026-09-04T07:15:00.000Z');
});
it('defaults a missing date to today in the family timezone', () => {
  expect(iso('', '00:15')).toBe('2026-09-05T17:15:00.000Z');
});
it('defaults a missing time to the current clock time, preserving seconds', () => {
  expect(iso('2026-09-04', '')).toBe('2026-09-03T18:23:45.678Z');
});
it.each([['2026-02-30', '10:00'], ['2026-13-01', '10:00'], ['2026-00-01', '10:00'], ['2026-9-01', '10:00'],
  ['2026-09-04', '24:00'], ['2026-09-04', '10:60'], ['2026-09-04', 'nope'], ['bad-date', '10:00']])('rejects invalid fields %s %s', (date, time) => {
  expect(() => recordingTime(date, time, timezone, now)).toThrow('không hợp lệ');
});
it('rejects future entries without rolling a time-only value back to yesterday', () => {
  expect(() => recordingTime('', '03:00', timezone, now)).toThrow('tương lai');
  expect(() => recordingTime('2026-09-07', '01:00', timezone, now)).toThrow('tương lai');
});
it('handles non-whole-hour offsets without relying on the host timezone', () => {
  expect(iso('2026-09-04', '08:30', 'Asia/Kathmandu')).toBe('2026-09-04T02:45:00.000Z');
});
it('uses the offset at the selected date rather than the current DST offset', () => {
  expect(iso('2026-01-05', '08:30', 'America/New_York')).toBe('2026-01-05T13:30:00.000Z');
  expect(iso('2026-07-05', '08:30', 'America/New_York')).toBe('2026-07-05T12:30:00.000Z');
});
it('rejects a nonexistent DST time instead of silently shifting it', () => {
  expect(() => recordingTime('2026-03-08', '02:30', 'America/New_York', now)).toThrow('không tồn tại');
});
it('resolves repeated DST wall times deterministically to the earlier occurrence', () => {
  expect(iso('2025-11-02', '01:30', 'America/New_York')).toBe('2025-11-02T05:30:00.000Z');
});