import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { startTimer } from '../domain/events';
import type { EventBody, QuickEventType } from '../domain/types';
import { QuickRecord } from './QuickRecord';

const render = (type: QuickEventType, running?: EventBody, saving = false) => renderToStaticMarkup(
  <QuickRecord type={type} running={running} timezone="Asia/Ho_Chi_Minh" saving={saving} milk="formula" onMilkChange={() => {}} onSave={() => {}} />);

it.each(['bottle', 'diaper', 'breast', 'sleep'] as const)('provides separate optional day and time fields before %s choices', type => {
  const html = render(type);
  expect(html).toMatch(/<label>Ngày<div class="date-input"><div class="date-input-control"><input[^>]*type="text"[^>]*name="date"/);
  expect(html).toMatch(/<label>Giờ<input[^>]*type="time"/);
  expect(html).not.toContain('datetime-local');
  expect(html).toContain('Ô để trống dùng ngày/giờ hiện tại lúc lưu');
  expect(html).toContain('Asia/Ho_Chi_Minh');
  expect(html.indexOf('type="time"')).toBeLessThan(html.indexOf('sheet-intro'));
  expect(html).toMatch(/name="date"[^>]*value=""/);
  expect(html).toMatch(/type="time"[^>]*value=""/);
});
it.each(['breast', 'sleep'] as const)('offers optional end time and a confirmation for an active %s timer', type => {
  const html = render(type, startTimer(type));
  expect(html).toContain('Thời điểm kết thúc');
  expect(html).toContain(type === 'sleep' ? 'Đã thức' : 'Kết thúc bú');
  expect(html).not.toContain('Bên trái');
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
  expect(html).toMatch(/<label>Giờ thức giấc<input[^>]*type="time"/);
  expect(html).toContain('nếu bé vẫn đang ngủ');
  expect(html).toContain('Lưu giấc ngủ');
  expect(html.match(/class="date-input"/g)).toHaveLength(2);
  expect(html.match(/type="time"/g)).toHaveLength(2);
  expect(render('sleep', startTimer('sleep'))).not.toContain('name="wakeTime"');
  for (const type of ['bottle', 'diaper', 'breast'] as const) expect(render(type)).not.toContain('name="wakeTime"');
});