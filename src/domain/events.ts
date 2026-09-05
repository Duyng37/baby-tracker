import type { EventBody, ServerEvent, Side } from './types';

export class DataError extends Error {
  constructor(message = 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.') { super(message); }
}

export function decimal(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw new DataError();
}

function time(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) throw new DataError('Giờ ghi nhận không hợp lệ.');
  return Date.parse(value);
}

function keys(value: object, allowed: string[]) {
  if (Object.keys(value).length !== allowed.length || Object.keys(value).some(key => !allowed.includes(key))) throw new DataError();
}

export function validateBody(body: EventBody, now = Date.now()) {
  keys(body, ['type', 'started_at', 'ended_at', 'payload', 'note', 'deleted']);
  const start = time(body.started_at);
  const end = body.ended_at === null ? null : time(body.ended_at);
  const planned = (body.type === 'vaccination' || body.type === 'medication') && body.payload?.status === 'planned';
  if ((!planned && start > now + 300_000) || (end !== null && (end < start || end > now + 300_000))) throw new DataError('Hãy kiểm tra giờ bắt đầu/kết thúc.');
  if (typeof body.note !== 'string' || [...body.note].length > 500 || typeof body.deleted !== 'boolean'
    || !body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) throw new DataError();
  switch (body.type) {
    case 'medication': {
      keys(body.payload, ['name', 'dose', 'status']);
      const { name, dose, status } = body.payload;
      if (end !== null || typeof name !== 'string' || !name.trim() || [...name].length > 120
        || typeof dose !== 'string' || [...dose].length > 80 || !['planned', 'completed'].includes(status)) throw new DataError('Thông tin uống thuốc chưa hợp lệ.');
      break;
    }
    case 'meal': {
      keys(body.payload, ['food', 'amount']);
      const { food, amount } = body.payload;
      if (end !== null || typeof food !== 'string' || !food.trim() || [...food].length > 160
        || typeof amount !== 'string' || [...amount].length > 80) throw new DataError('Thông tin ăn uống chưa hợp lệ.');
      break;
    }
    case 'growth': {
      keys(body.payload, ['height_cm', 'weight_kg']);
      const { height_cm, weight_kg } = body.payload;
      if (end !== null || (height_cm === null && weight_kg === null)
        || (height_cm !== null && (!Number.isFinite(height_cm) || height_cm <= 0 || height_cm > 250))
        || (weight_kg !== null && (!Number.isFinite(weight_kg) || weight_kg <= 0 || weight_kg > 300))) throw new DataError('Nhập chiều cao (cm) hoặc cân nặng (kg) hợp lệ.');
      break;
    }
    case 'activity': {
      keys(body.payload, ['kind', 'duration_minutes']);
      const { kind, duration_minutes } = body.payload;
      if (end !== null || !['bath', 'tummy_time', 'outdoor', 'indoor', 'brushing_teeth'].includes(kind)
        || (duration_minutes !== null && (!Number.isFinite(duration_minutes) || duration_minutes <= 0 || duration_minutes > 1440))) throw new DataError('Thông tin hoạt động chưa hợp lệ.');
      break;
    }
    case 'vaccination': {
      keys(body.payload, ['vaccine', 'dose', 'status', 'location']);
      const { vaccine, dose, status, location } = body.payload;
      if (end !== null || typeof vaccine !== 'string' || !vaccine.trim() || [...vaccine].length > 120
        || typeof dose !== 'string' || [...dose].length > 40 || typeof location !== 'string' || [...location].length > 160
        || !['planned', 'completed'].includes(status)) throw new DataError('Thông tin tiêm chủng chưa hợp lệ.');
      break;
    }
    case 'bottle':
      keys(body.payload, ['amount_ml', 'milk']);
      if (end !== null || !Number.isFinite(body.payload.amount_ml) || body.payload.amount_ml <= 0
        || body.payload.amount_ml > 2000 || !['breast_milk', 'formula', 'mixed'].includes(body.payload.milk)) throw new DataError();
      break;
    case 'diaper':
      keys(body.payload, ['kind']);
      if (end !== null || !['wet', 'dirty', 'mixed'].includes(body.payload.kind)) throw new DataError();
      break;
    case 'sleep': keys(body.payload, []); break;
    case 'breast': {
      keys(body.payload, ['segments']);
      const segments = body.payload.segments;
      if (!Array.isArray(segments) || segments.length < 1 || segments.length > 200) throw new DataError();
      let previous: number | null = start;
      segments.forEach((segment, index) => {
        keys(segment, ['side', 'started_at', 'ended_at']);
        const s = time(segment.started_at);
        const e = segment.ended_at === null ? null : time(segment.ended_at);
        if (!['left', 'right'].includes(segment.side) || s !== previous || (e !== null && e < s)
          || (e === null && index !== segments.length - 1)) throw new DataError();
        previous = e;
      });
      if (previous !== end) throw new DataError();
      break;
    }
    default: throw new DataError();
  }
}

export function serverBody(event: ServerEvent): EventBody {
  return { type: event.type, started_at: new Date(event.started_at).toISOString(),
    ended_at: event.ended_at === null ? null : new Date(event.ended_at).toISOString(),
    payload: structuredClone(event.payload), note: event.note, deleted: event.deleted_at !== null } as EventBody;
}

export function isRunning(body: EventBody) {
  return !body.deleted && body.ended_at === null && (body.type === 'sleep' || body.type === 'breast');
}

export function startTimer(type: 'sleep' | 'breast', side: Side = 'left', now = Date.now()): EventBody {
  const started_at = new Date(now).toISOString();
  const common = { started_at, ended_at: null, note: '', deleted: false };
  return type === 'sleep' ? { ...common, type, payload: {} }
    : { ...common, type, payload: { segments: [{ side, started_at, ended_at: null }] } };
}

export function changeTimer(body: EventBody, action: 'stop' | 'switch', now = Date.now()): EventBody {
  if (!isRunning(body)) throw new DataError('Timer đã kết thúc.');
  const next = structuredClone(body);
  const last = next.type === 'breast' ? next.payload.segments.at(-1)! : null;
  const end = new Date(Math.max(now, Date.parse(last?.started_at ?? next.started_at))).toISOString();
  if (last) last.ended_at = end;
  if (action === 'stop') next.ended_at = end;
  else if (next.type === 'breast' && last) next.payload.segments.push({ side: last.side === 'left' ? 'right' : 'left', started_at: end, ended_at: null });
  else throw new DataError();
  validateBody(next, now);
  return next;
}