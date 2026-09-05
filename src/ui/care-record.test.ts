import { expect, it } from 'vitest';
import { isRunning, validateBody } from '../domain/events';
import { eventBodyKey } from '../domain/event-key';
import { summarize } from '../domain/summary';
import type { CareBody, CareEventType, EventBody, LocalEvent } from '../domain/types';
import { parseEvent } from '../sync/protocol';
import { careDateTime, careDraft, careRecord } from './care-record';
import { eventDetail, journalEvents } from './Journal';

const now = Date.parse('2026-09-05T08:00:00Z'), timezone = 'Asia/Ho_Chi_Minh';
const draft = { ...careDraft('meal', timezone, undefined, 'bath', now), name: ' Thuốc thử ', dose: ' Theo đơn ',
  food: ' Cháo ', amount: ' Nửa bát ', height: '65.5', weight: '7.25', minutes: '10', note: ' Ghi chú ' };
const types: CareEventType[] = ['medication', 'meal', 'growth', 'activity'];
const local = (body: CareBody, id: string = body.type): LocalEvent => ({ id, family_id: 'family', baby_id: 'baby', body, server: null, version: 1 });

it.each(types)('creates, validates, roundtrips and describes %s without treating it as a timer', type => {
  const body = careRecord(type, draft, timezone, now);
  expect(body.started_at).toBe('2026-09-05T08:00:00.000Z'); expect(body.note).toBe('Ghi chú');
  expect(isRunning(body)).toBe(false); expect(eventDetail(body)).not.toBe('Đang diễn ra');
  expect(() => validateBody(body, now)).not.toThrow();
  const { deleted: _, ...fields } = body;
  expect(parseEvent({ ...fields, id: 'event', family_id: 'family', baby_id: 'baby', revision: '1', deleted_at: null }).payload).toEqual(body.payload);
  expect(careRecord(type, careDraft(type, timezone, body), timezone, now)).toEqual(body);
  expect(eventBodyKey(body)).not.toBe(eventBodyKey({ ...body, note: 'Changed' }));
});
it('starts medication plans with blank dates and preserves old plans while editing', () => {
  expect(careDraft('medication', timezone, undefined, 'bath', now)).toMatchObject({ status: 'planned', date: '', time: '' });
  const body = careRecord('medication', { ...draft, date: '2099-01-01' }, timezone, now);
  expect(careDraft('medication', timezone, body)).toMatchObject({ date: '2099-01-01', time: '15:00' });
  expect(careDateTime(timezone, now)).toEqual({ date: '2026-09-05', time: '15:00' });
});
it.each(['meal', 'growth', 'activity'] as const)('prefills new %s fields with today and now in the family timezone', type => {
  const at = Date.parse('2026-09-05T18:23:45Z');
  expect(careDraft(type, timezone, undefined, 'bath', at)).toMatchObject({ date: '2026-09-06', time: '01:23' });
});
it.each(types)('preserves the stored date/time when editing a completed %s record', type => {
  const body = careRecord(type, { ...draft, status: 'completed', date: '2026-09-03', time: '09:15' }, timezone, now);
  expect(careDraft(type, timezone, body, 'bath', now)).toMatchObject({ date: '2026-09-03', time: '09:15' });
});
it.each(types)('rejects future completed %s and missing/invalid timestamps', type => {
  expect(() => careRecord(type, { ...draft, status: 'completed', date: '2099-01-01' }, timezone, now)).toThrow();
  for (const change of [{ date: '' }, { time: '' }, { date: '2026-02-30' }]) {
    expect(() => careRecord(type, { ...draft, ...change }, timezone, now)).toThrow();
  }
});
it.each([
  ['medication', { name: '' }], ['medication', { name: 'x'.repeat(121) }], ['medication', { dose: 'x'.repeat(81) }],
  ['meal', { food: '  ' }], ['meal', { food: 'x'.repeat(161) }], ['meal', { amount: 'x'.repeat(81) }],
  ['growth', { height: '', weight: '' }], ['growth', { height: '-1' }], ['growth', { height: '251' }],
  ['growth', { weight: 'NaN' }], ['growth', { weight: '301' }], ['growth', { weight: '0' }],
  ['activity', { minutes: '-1' }], ['activity', { minutes: '1441' }], ['activity', { minutes: 'Infinity' }],
] as const)('rejects invalid %s input %j', (type, changes) => {
  expect(() => careRecord(type, { ...draft, ...changes }, timezone, now)).toThrow();
});
it.each(types)('rejects extra/missing payload fields and ended_at on %s', type => {
  const body = careRecord(type, draft, timezone, now);
  expect(() => validateBody({ ...body, ended_at: body.started_at }, now)).toThrow();
  expect(() => validateBody({ ...body, payload: { ...body.payload, extra: true } } as unknown as EventBody, now)).toThrow();
  for (const key of Object.keys(body.payload)) {
    const payload = { ...body.payload } as Record<string, unknown>; delete payload[key];
    expect(() => validateBody({ ...body, payload } as EventBody, now)).toThrow();
  }
});
it('allows one growth measurement, optional durations and all five activities', () => {
  expect(careRecord('growth', { ...draft, height: '' }, timezone, now).payload).toEqual({ height_cm: null, weight_kg: 7.25 });
  expect(careRecord('growth', { ...draft, weight: '' }, timezone, now).payload).toEqual({ height_cm: 65.5, weight_kg: null });
  for (const kind of ['bath', 'tummy_time', 'outdoor', 'indoor', 'brushing_teeth'] as const) {
    expect(careRecord('activity', { ...draft, kind, minutes: '' }, timezone, now).payload).toEqual({ kind, duration_minutes: null });
  }
});
it('shows only completed medication in the journal, includes other care types and leaves quick metrics unchanged', () => {
  const events = types.map(type => local(careRecord(type, draft, timezone, now)));
  const completed = local(careRecord('medication', { ...draft, status: 'completed' }, timezone, now), 'completed');
  events.push(completed, { ...completed, id: 'deleted', body: { ...completed.body, deleted: true } });
  expect(journalEvents(events, '2026-09-05', timezone).map(event => event.id)).toEqual(['meal', 'growth', 'activity', 'completed']);
  expect(journalEvents(events, '2026-09-05', timezone, 'medication')).toEqual([completed]);
  expect(summarize(events, now - 86400000, now + 1)).toEqual({ bottle: 0, diapers: 0, sleep: 0, breast: 0 });
});