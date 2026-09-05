import type { ActivityKind, EventBody, LocalEvent } from './types';

export const labels = { bottle: 'Bình sữa', diaper: 'Thay tã', sleep: 'Ngủ', breast: 'Bú mẹ', vaccination: 'Tiêm chủng',
  medication: 'Uống thuốc', meal: 'Ăn uống', growth: 'Chiều cao, cân nặng', activity: 'Hoạt động' } satisfies Record<EventBody['type'], string>;
export const activityLabels = { bath: 'Tắm', tummy_time: 'Tummy time (nằm sấp)', outdoor: 'Ngoài trời (Outdoor)',
  indoor: 'Trong nhà (Indoor)', brushing_teeth: 'Đánh răng' } satisfies Record<ActivityKind, string>;
function dateKey(parts: Intl.DateTimeFormatPart[]) {
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
}
export function dayKey(time: number, timezone: string) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(time);
  return dateKey(parts);
}
/** Calendar-day boundaries in the family timezone, including 23/25-hour DST days. */
export function dayBounds(day: string, timezone: string): [number, number] {
  const formatter = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const utc = Date.parse(`${day}T00:00:00Z`);
  function boundary(anchor: number) {
    const target = new Date(anchor).toISOString().slice(0, 10);
    let low = anchor - 86_400_000;
    let high = anchor + 86_400_000;
    // Find the first instant of the date, even where a DST change skips midnight.
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (dateKey(formatter.formatToParts(middle)) < target) low = middle + 1;
      else high = middle;
    }
    return low;
  }
  return [boundary(utc), boundary(utc + 86_400_000)];
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

export function summarizeDay(events: LocalEvent[], day: string, timezone: string, now: number) {
  const [from, end] = dayBounds(day, timezone);
  return summarize(events, from, Math.min(end, now));
}