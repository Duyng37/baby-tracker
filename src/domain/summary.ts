import type { LocalEvent } from './types';

export const labels = { bottle: 'Bình sữa', diaper: 'Thay tã', sleep: 'Ngủ', breast: 'Bú mẹ', vaccination: 'Tiêm chủng' };
export function dayKey(time: number, timezone: string) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(time);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
}
export function duration(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút` : `${minutes} phút`;
}
export function summarize(events: LocalEvent[], from: number, to: number) {
  const result = { bottle: 0, diapers: 0, sleep: 0, breast: 0 };
  for (const { body } of events) {
    if (body.deleted) continue;
    const start = Date.parse(body.started_at);
    if (body.type === 'bottle' && start >= from && start < to) result.bottle += body.payload.amount_ml;
    if (body.type === 'diaper' && start >= from && start < to) result.diapers++;
    const overlap = Math.max(0, Math.min(to, body.ended_at ? Date.parse(body.ended_at) : to) - Math.max(from, start));
    if (body.type === 'sleep') result.sleep += overlap;
    if (body.type === 'breast') result.breast += overlap;
  }
  return result;
}