import { DataError, validateBody } from '../domain/events';
import type { EventBody, QuickEventType, Side } from '../domain/types';
import { recordingDateTime, recordingTime } from './recording-time';

export type QuickBody = Extract<EventBody, { type: QuickEventType }>;
type SegmentDraft = { side: Side; endDate: string; endTime: string };
export type JournalEntryDraft = {
  date: string; time: string; note: string; amount: string;
  milk: Extract<QuickBody, { type: 'bottle' }>['payload']['milk'];
  diaper: Extract<QuickBody, { type: 'diaper' }>['payload']['kind'];
  endDate: string; endTime: string; segments: SegmentDraft[];
};

export function isQuickBody(body: EventBody): body is QuickBody {
  return ['bottle', 'diaper', 'sleep', 'breast'].includes(body.type);
}

export function journalEntryDraft(body: QuickBody, timezone: string): JournalEntryDraft {
  const start = recordingDateTime(timezone, Date.parse(body.started_at));
  const end = body.ended_at ? recordingDateTime(timezone, Date.parse(body.ended_at)) : { date: '', time: '' };
  return { ...start, note: body.note,
    amount: body.type === 'bottle' ? String(body.payload.amount_ml) : '',
    milk: body.type === 'bottle' ? body.payload.milk : 'formula',
    diaper: body.type === 'diaper' ? body.payload.kind : 'wet',
    endDate: end.date, endTime: end.time,
    segments: body.type === 'breast' ? body.payload.segments.map(segment => {
      const segmentEnd = segment.ended_at ? recordingDateTime(timezone, Date.parse(segment.ended_at)) : { date: '', time: '' };
      return { side: segment.side, endDate: segmentEnd.date, endTime: segmentEnd.time };
    }) : [] };
}

export function journalEntryRecord(type: QuickEventType, draft: JournalEntryDraft, timezone: string, now = Date.now()): QuickBody {
  const readTime = (date: string, time: string, message: string) => {
    if (!date || !time) throw new DataError(message);
    return recordingTime(date, time, timezone, now);
  };
  const start = readTime(draft.date, draft.time, 'Vui lòng nhập ngày và giờ bắt đầu.');
  const common = { started_at: new Date(start).toISOString(), ended_at: null, note: draft.note.trim(), deleted: false };
  let body: QuickBody;
  if (type === 'bottle') body = { ...common, type, payload: { amount_ml: Number(draft.amount), milk: draft.milk } };
  else if (type === 'diaper') body = { ...common, type, payload: { kind: draft.diaper } };
  else if (type === 'sleep') {
    const end = readTime(draft.endDate, draft.endTime, 'Vui lòng nhập ngày và giờ thức giấc.');
    body = { ...common, type, ended_at: new Date(end).toISOString(), payload: {} };
  } else {
    if (!draft.segments.length) throw new DataError('Cần có ít nhất một chặng bú.');
    let segmentStart = start;
    const segments = draft.segments.map(segment => {
      const end = readTime(segment.endDate, segment.endTime, 'Vui lòng nhập thời điểm kết thúc cho từng chặng bú.');
      const result = { side: segment.side, started_at: new Date(segmentStart).toISOString(), ended_at: new Date(end).toISOString() };
      segmentStart = end; return result;
    });
    body = { ...common, type, ended_at: new Date(segmentStart).toISOString(), payload: { segments } };
  }
  validateBody(body, now);
  return body;
}