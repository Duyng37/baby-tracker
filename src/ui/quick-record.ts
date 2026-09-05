import { changeTimer, DataError, startTimer, validateBody } from '../domain/events';
import type { EventBody, Side } from '../domain/types';
import { recordingTime } from './recording-time';
import { dayKey } from '../domain/summary';

export type Milk = Extract<EventBody, { type: 'bottle' }>['payload']['milk'];
export type DiaperKind = Extract<EventBody, { type: 'diaper' }>['payload']['kind'];
export type QuickChoice = { type: 'bottle'; amount: number; milk: Milk } | { type: 'diaper'; kind: DiaperKind }
  | { type: 'breast'; side: Side } | { type: 'sleep'; wakeDate?: string; wakeTime?: string } | { type: 'stop'; body: EventBody };

export function quickRecord(choice: QuickChoice, date: string, time: string, timezone: string, now = Date.now()): EventBody {
  const at = recordingTime(date, time, timezone, now);
  const common = { started_at: new Date(at).toISOString(), ended_at: null, note: '', deleted: false };
  let body: EventBody;
  switch (choice.type) {
    case 'bottle': body = { ...common, type: 'bottle', payload: { amount_ml: choice.amount, milk: choice.milk } }; break;
    case 'diaper': body = { ...common, type: 'diaper', payload: { kind: choice.kind } }; break;
    case 'breast': body = startTimer('breast', choice.side, at); break;
    case 'sleep': {
      body = startTimer('sleep', 'left', at);
      if (choice.wakeDate && !choice.wakeTime) throw new DataError('Vui lòng nhập giờ thức giấc, hoặc bỏ trống cả ngày và giờ thức nếu bé vẫn đang ngủ.');
      if (choice.wakeTime) {
        const end = recordingTime(choice.wakeDate || dayKey(at, timezone), choice.wakeTime, timezone, now);
        if (end < at) throw new DataError('Thời điểm thức giấc không thể trước lúc bắt đầu ngủ. Nếu ngủ qua đêm, hãy chọn ngày thức giấc.');
        body.ended_at = new Date(end).toISOString();
      }
      break;
    }
    case 'stop': {
      const start = choice.body.type === 'breast' ? choice.body.payload.segments.at(-1)!.started_at : choice.body.started_at;
      if ((date || time) && at < Date.parse(start)) throw new DataError('Giờ kết thúc không thể trước giờ bắt đầu hoặc lần đổi bên gần nhất.');
      body = changeTimer(choice.body, 'stop', at); break;
    }
  }
  validateBody(body, now);
  return body;
}