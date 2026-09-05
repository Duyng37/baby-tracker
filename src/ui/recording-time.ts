import { DataError } from '../domain/events';

/** Resolve optional wall-clock fields in the family's timezone, never the device's. */
export function recordingTime(date: string, time: string, timezone: string, now = Date.now()): number {
  if (!date && !time) return now;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const parts = (at: number) => Object.fromEntries(formatter.formatToParts(at).map(part => [part.type, part.value]));
  const current = parts(now);
  const day = date || `${current.year}-${current.month}-${current.day}`;
  const clock = time || `${current.hour}:${current.minute}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) {
    throw new DataError('Ngày hoặc giờ ghi nhận không hợp lệ.');
  }
  const wall = `${day}T${clock}:${time ? '00' : current.second}`;
  const target = Date.parse(`${wall}Z`);
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 19) !== wall) {
    throw new DataError('Ngày hoặc giờ ghi nhận không hợp lệ.');
  }
  const wallTime = (at: number) => {
    const p = parts(at);
    return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  };
  // Nearby offsets cover DST transitions. Reject nonexistent times; pick the earlier repeated time.
  const candidates = [-86_400_000, 0, 86_400_000].map(delta => {
    const probe = target + delta;
    return target - (wallTime(probe) - probe);
  }).filter(at => wallTime(at) === target);
  if (!candidates.length) throw new DataError('Giờ này không tồn tại trong múi giờ gia đình. Vui lòng chọn giờ khác.');
  const result = Math.min(...candidates) + (time ? 0 : now % 1000);
  if (result > now + 300_000) throw new DataError('Không thể ghi nhận thời gian trong tương lai.');
  return result;
}