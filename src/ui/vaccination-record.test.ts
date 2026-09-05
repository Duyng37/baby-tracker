import { expect, it } from 'vitest';
import { isRunning, validateBody } from '../domain/events';
import { eventBodyKey } from '../domain/event-key';
import type { EventBody, VaccinationBody } from '../domain/types';
import { parseEvent } from '../sync/protocol';
import { recordingTime } from './recording-time';
import { vaccinationDraft, vaccinationRecord, type VaccinationDraft } from './vaccination-record';

const now = Date.parse('2026-09-05T08:00:00Z');
const timezone = 'Asia/Ho_Chi_Minh';
const draft: VaccinationDraft = { vaccine: '  Vắc-xin thử  ', dose: ' Mũi 1 ', location: ' Phòng tiêm ', note: ' Ghi chú ',
  status: 'planned', date: '2026-10-05', time: '09:30' };
const planned = vaccinationRecord(draft, timezone, now);

it('builds a future appointment using the family timezone and trims text', () => {
  expect(planned).toEqual({ type: 'vaccination', started_at: '2026-10-05T02:30:00.000Z', ended_at: null, note: 'Ghi chú', deleted: false,
    payload: { vaccine: 'Vắc-xin thử', dose: 'Mũi 1', location: 'Phòng tiêm', status: 'planned' } });
  expect(isRunning(planned)).toBe(false);
  expect(() => validateBody(planned, now)).not.toThrow();
  expect(() => recordingTime(draft.date, draft.time, timezone, now)).toThrow('tương lai');
});
it('allows past completed doses and overdue plans, but never future completed doses', () => {
  expect(vaccinationRecord({ ...draft, date: '2025-01-01', status: 'completed' }, timezone, now).payload.status).toBe('completed');
  expect(() => vaccinationRecord({ ...draft, date: '2025-01-01' }, timezone, now)).not.toThrow();
  expect(() => vaccinationRecord({ ...draft, status: 'completed' }, timezone, now)).toThrow('tương lai');
  expect(() => validateBody({ ...planned, payload: { ...planned.payload, status: 'completed' } }, now)).toThrow();
  expect(() => validateBody({ ...planned, type: 'sleep', payload: {} }, now)).toThrow();
});
it.each([{ date: '' }, { time: '' }, { date: '2026-02-30' }, { time: '25:00' }, { vaccine: ' \t ' }])('rejects invalid required input %j', change => {
  expect(() => vaccinationRecord({ ...draft, ...change }, timezone, now)).toThrow();
});
it.each([
  { vaccine: '' }, { vaccine: 123 }, { vaccine: 'x'.repeat(121) }, { dose: 'x'.repeat(41) }, { dose: null },
  { location: 'x'.repeat(161) }, { location: [] }, { status: 'unknown' }, { status: null }, { extra: 'no' },
])('validates all vaccination payload fields %j', change => {
  expect(() => validateBody({ ...planned, payload: { ...planned.payload, ...change } } as EventBody, now)).toThrow();
});
it('rejects missing payload fields, non-null end times and oversized notes', () => {
  for (const field of ['vaccine', 'dose', 'status', 'location']) {
    const payload = { ...planned.payload } as Record<string, unknown>; delete payload[field];
    expect(() => validateBody({ ...planned, payload } as EventBody, now)).toThrow();
  }
  expect(() => validateBody({ ...planned, ended_at: planned.started_at }, now)).toThrow();
  expect(() => validateBody({ ...planned, note: 'x'.repeat(501) }, now)).toThrow();
});
it('initializes edits from the appointment but completion from the actual current local time', () => {
  const edit = vaccinationDraft(timezone, planned, undefined, now);
  expect(edit).toMatchObject({ date: '2026-10-05', time: '09:30', status: 'planned' });
  const completed = vaccinationDraft(timezone, planned, 'completed', now);
  expect(completed).toMatchObject({ date: '2026-09-05', time: '15:00', vaccine: planned.payload.vaccine, status: 'completed' });
  expect(vaccinationRecord(completed, timezone, now).started_at).toBe('2026-09-05T08:00:00.000Z');
  expect(vaccinationDraft(timezone, undefined, 'planned', now)).toMatchObject({ date: '', time: '' });
});
it('uses the correct date around midnight in the family timezone and rejects nonexistent DST times', () => {
  expect(vaccinationDraft(timezone, undefined, 'completed', Date.parse('2026-09-05T18:00:00Z'))).toMatchObject({ date: '2026-09-06', time: '01:00' });
  expect(() => vaccinationRecord({ ...draft, date: '2027-03-14', time: '02:30' }, 'America/New_York', now)).toThrow('không tồn tại');
});
it('preserves the recorded date/time when editing a completed vaccination', () => {
  const body = vaccinationRecord({ ...draft, status: 'completed', date: '2026-09-03', time: '09:15' }, timezone, now);
  expect(vaccinationDraft(timezone, body, undefined, now)).toMatchObject({ date: '2026-09-03', time: '09:15', status: 'completed' });
});
it.each([
  { vaccine: 'Another' }, { dose: 'Mũi 2' }, { location: 'Other' }, { status: 'completed' as const },
])('includes changed payload fields in conflict and backup comparisons %j', change => {
  expect(eventBodyKey(planned)).not.toBe(eventBodyKey({ ...planned, payload: { ...planned.payload, ...change } }));
});
it('parses future vaccination snapshots through the existing cloud protocol', () => {
  const { deleted: _, ...fields } = planned;
  const server = { ...fields, id: 'event', family_id: 'family', baby_id: 'baby', revision: '1', deleted_at: null };
  expect(parseEvent(server)).toEqual(server);
  const normalized: VaccinationBody = { ...planned, started_at: '2026-10-05T09:30:00+07:00' };
  expect(eventBodyKey(normalized)).toBe(eventBodyKey(planned));
});