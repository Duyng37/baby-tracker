import { DataError, validateBody } from '../domain/events';
import { dayKey } from '../domain/summary';
import type { VaccinationBody, VaccinationStatus } from '../domain/types';
import { recordingTime } from './recording-time';

export type VaccinationDraft = { vaccine: string; dose: string; status: VaccinationStatus; date: string; time: string; location: string; note: string };

export function vaccinationDraft(timezone: string, body?: VaccinationBody, status: VaccinationStatus = body?.payload.status ?? 'planned', now = Date.now()): VaccinationDraft {
  // Marking a plan as completed asks for the actual administration time, not the appointment time.
  const at = body && status === body.payload.status ? Date.parse(body.started_at) : now;
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  return { vaccine: body?.payload.vaccine ?? '', dose: body?.payload.dose ?? '', status,
    date: !body && status === 'planned' ? '' : dayKey(at, timezone),
    time: !body && status === 'planned' ? '' : ['hour', 'minute'].map(type => parts.find(part => part.type === type)!.value).join(':'),
    location: body?.payload.location ?? '', note: body?.note ?? '' };
}

export function vaccinationRecord(draft: VaccinationDraft, timezone: string, now = Date.now()): VaccinationBody {
  if (!draft.date || !draft.time) throw new DataError('Vui lòng nhập ngày và giờ tiêm.');
  const at = recordingTime(draft.date, draft.time, timezone, now, { allowFuture: true });
  if (draft.status === 'completed' && at > now + 300_000) throw new DataError('Ngày/giờ đã tiêm không thể ở tương lai.');
  const body: VaccinationBody = { type: 'vaccination', started_at: new Date(at).toISOString(), ended_at: null,
    payload: { vaccine: draft.vaccine.trim(), dose: draft.dose.trim(), status: draft.status, location: draft.location.trim() },
    note: draft.note.trim(), deleted: false };
  validateBody(body, now);
  return body;
}