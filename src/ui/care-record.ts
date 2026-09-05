import { DataError, validateBody } from '../domain/events';
import { dayKey } from '../domain/summary';
import type { ActivityKind, CareBody, CareEventType, EventBody } from '../domain/types';
import { recordingTime } from './recording-time';

export function isCareType(type: string): type is CareEventType {
  return ['medication', 'meal', 'growth', 'activity'].includes(type);
}
export function isCareBody(body: EventBody): body is CareBody { return isCareType(body.type); }

export type CareDraft = {
  date: string; time: string; note: string; name: string; dose: string; status: 'planned' | 'completed';
  food: string; amount: string; height: string; weight: string; kind: ActivityKind; minutes: string;
};
export function careDateTime(timezone: string, at = Date.now()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  return { date: dayKey(at, timezone), time: ['hour', 'minute'].map(key => parts.find(part => part.type === key)!.value).join(':') };
}
export function careDraft(type: CareEventType, timezone: string, body?: CareBody, kind: ActivityKind = 'bath', now = Date.now()): CareDraft {
  const at = body ? Date.parse(body.started_at) : now;
  const planned = type === 'medication' && !body;
  return { ...(planned ? { date: '', time: '' } : careDateTime(timezone, at)),
    note: body?.note ?? '', name: body?.type === 'medication' ? body.payload.name : '',
    dose: body?.type === 'medication' ? body.payload.dose : '', status: body?.type === 'medication' ? body.payload.status : 'planned',
    food: body?.type === 'meal' ? body.payload.food : '', amount: body?.type === 'meal' ? body.payload.amount : '',
    height: body?.type === 'growth' && body.payload.height_cm !== null ? String(body.payload.height_cm) : '',
    weight: body?.type === 'growth' && body.payload.weight_kg !== null ? String(body.payload.weight_kg) : '',
    kind: body?.type === 'activity' ? body.payload.kind : kind,
    minutes: body?.type === 'activity' && body.payload.duration_minutes !== null ? String(body.payload.duration_minutes) : '' };
}

export function careRecord(type: CareEventType, draft: CareDraft, timezone: string, now = Date.now()): CareBody {
  if (!draft.date || !draft.time) throw new DataError('Vui lòng nhập ngày và giờ.');
  const at = recordingTime(draft.date, draft.time, timezone, now, { allowFuture: type === 'medication' && draft.status === 'planned' });
  const common = { started_at: new Date(at).toISOString(), ended_at: null, note: draft.note.trim(), deleted: false };
  const numeric = (value: string) => value.trim() ? Number(value) : null;
  let body: CareBody;
  switch (type) {
    case 'medication': body = { ...common, type, payload: { name: draft.name.trim(), dose: draft.dose.trim(), status: draft.status } }; break;
    case 'meal': body = { ...common, type, payload: { food: draft.food.trim(), amount: draft.amount.trim() } }; break;
    case 'growth': body = { ...common, type, payload: { height_cm: numeric(draft.height), weight_kg: numeric(draft.weight) } }; break;
    case 'activity': body = { ...common, type, payload: { kind: draft.kind, duration_minutes: numeric(draft.minutes) } }; break;
  }
  validateBody(body, now);
  return body;
}