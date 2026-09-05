import type { EventBody } from './types';

/** Compare content, not key order, equivalent timestamp spelling, or local ACK versions. */
export function eventBodyKey(body: EventBody) {
  const time = (value: string | null) => value === null ? null : Date.parse(value);
  const payload = body.type === 'bottle' ? [body.payload.amount_ml, body.payload.milk]
    : body.type === 'diaper' ? [body.payload.kind]
    : body.type === 'vaccination' ? [body.payload.vaccine, body.payload.dose, body.payload.status, body.payload.location]
    : body.type === 'breast' ? body.payload.segments.map(segment => [segment.side, time(segment.started_at), time(segment.ended_at)]) : [];
  return JSON.stringify([body.type, time(body.started_at), time(body.ended_at), body.note, body.deleted, payload]);
}