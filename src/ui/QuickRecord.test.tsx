import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startTimer } from '../domain/events';
import type { EventBody, QuickEventType } from '../domain/types';
import { QuickRecord } from './QuickRecord';

const render = (type: QuickEventType, running?: EventBody, saving = false) => renderToStaticMarkup(
  <QuickRecord type={type} running={running} timezone="Asia/Ho_Chi_Minh" saving={saving} milk="formula" onMilkChange={() => {}} onSave={() => {}} />);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T18:23:45.678Z')); });
afterEach(() => vi.useRealTimers());

it.each(['bottle', 'diaper', 'breast', 'sleep'] as const)('provides separate optional day and time fields before %s choices', type => {
  const html = render(type);
  expect(html).toMatch(/<label>Ngày<div class="date-input"><div class="date-input-control"><input[^>]*type="text"[^>]*name="date"/);
  expect(html).toMatch(/<label>Giờ<div class="time-input"><div class="time-input-control"><input[^>]*type="text"/);
  expect(html).toContain('Mở bộ chọn giờ: Giờ');
  expect(html).not.toContain('type="time"');
  expect(html).not.toContain('datetime-local');
  expect(html).toContain('Điền sẵn ngày/giờ hiện tại khi mở');
  expect(html).toContain('Asia/Ho_Chi_Minh');
  expect(html.indexOf('class="time-input"')).toBeLessThan(html.indexOf('sheet-intro'));
  expect(html).toMatch(/name="date"[^>]*value="06\/09\/2026"/);
  expect(html).toMatch(/name="time"[^>]*value="01:23"/);
});
it.each(['breast', 'sleep'] as const)('offers optional end time and a confirmation for an active %s timer', type => {
  const html = render(type, startTimer(type));
  expect(html).toContain('Thời điểm kết thúc');
  expect(html).toContain(type === 'sleep' ? 'Đã thức' : 'Kết thúc bú');
  expect(html).not.toContain('Bên trái');
  expect(html).toMatch(/name="date"[^>]*value="06\/09\/2026"/);
  expect(html).toMatch(/name="time"[^>]*value="01:23"/);
});
it('disables timestamp editing and saving actions while a write is pending', () => {
  const html = render('sleep', undefined, true);
  expect(html).toMatch(/<fieldset[^>]*disabled/);
  expect(html).toMatch(/<button[^>]*disabled/);
});
it('offers separate optional wake date/time fields only when recording a new sleep', () => {
  const html = render('sleep');
  expect(html).toContain('Thời điểm bắt đầu ngủ');
  expect(html).toMatch(/<label>Ngày thức giấc<div class="date-input"><div class="date-input-control"><input[^>]*type="text"[^>]*name="wakeDate"/);
  expect(html).toMatch(/<label>Giờ thức giấc<div class="time-input"><div class="time-input-control"><input[^>]*type="text"/);
  expect(html).toContain('<option value="sleeping" selected="">Bé vẫn đang ngủ</option>');
  expect(html).toMatch(/name="wakeDate"[^>]*value="06\/09\/2026"/);
  expect(html).toMatch(/name="wakeTime"[^>]*value="01:23"/);
  expect(html).toMatch(/<fieldset[^>]*disabled=""[^>]*><legend>Thời điểm thức giấc/);
  expect(html).toContain('Lưu giấc ngủ');
  expect(html.match(/class="date-input"/g)).toHaveLength(2);
  expect(html.match(/class="time-input"/g)).toHaveLength(2);
  expect(render('sleep', startTimer('sleep'))).not.toContain('name="wakeTime"');
  for (const type of ['bottle', 'diaper', 'breast'] as const) expect(render(type)).not.toContain('name="wakeTime"');
});