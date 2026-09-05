import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import type { LocalEvent, VaccinationStatus } from '../domain/types';
import { summarize } from '../domain/summary';
import { journalEvents } from './Journal';
import { VaccinationSchedule, vaccinationEvents, type VaccinationEvent } from './VaccinationSchedule';
import { VaccinationForm } from './VaccinationForm';

const scope = { family_id: 'family', baby_id: 'baby' };
const now = Date.parse('2026-09-05T08:00:00Z');
function entry(id: string, started_at: string, status: VaccinationStatus = 'planned'): VaccinationEvent {
  return { ...scope, id, server: null, version: 1, body: { type: 'vaccination', started_at, ended_at: null, deleted: false, note: '',
    payload: { vaccine: id, dose: 'Mũi 1', status, location: 'Phòng tiêm' } } };
}
const future = entry('Sắp tiêm', '2026-10-05T02:30:00Z');
const today = entry('Hẹn hôm nay', '2026-09-04T18:00:00Z');
const overdue = entry('Lịch cũ', '2026-09-01T02:30:00Z');
const done = entry('Đã ghi', '2026-09-05T07:30:00Z', 'completed');
const events = [future, today, overdue, done];
const render = (items: LocalEvent[] = events, saving = false) => renderToStaticMarkup(<VaccinationSchedule
  events={items} scope={scope} babyName="Bông" timezone="Asia/Ho_Chi_Minh" now={now} saving={saving}
  onAdd={() => {}} onEdit={() => {}} onComplete={() => {}} />);
afterEach(() => vi.useRealTimers());

it('scopes both groups by family AND baby, excludes deleted/non-vaccination records and does not mutate input', () => {
  const excluded: LocalEvent[] = [{ ...future, family_id: 'other' }, { ...future, baby_id: 'sibling' },
    { ...future, body: { ...future.body, deleted: true } }, { ...future, body: { ...future.body, type: 'sleep', payload: {} } }];
  const input = [...events, ...excluded];
  const before = [...input];
  expect(vaccinationEvents(input, scope, 'planned').map(event => event.id)).toEqual(['Lịch cũ', 'Hẹn hôm nay', 'Sắp tiêm']);
  expect(vaccinationEvents(input, scope, 'completed')).toEqual([done]);
  expect(input).toEqual(before);
  expect(vaccinationEvents([done, { ...overdue, body: { ...overdue.body, payload: { ...overdue.body.payload, status: 'completed' } } }], scope, 'completed')[0]).toEqual(done);
});
it('renders separate statuses, appointment dates, edit and completion actions', () => {
  const html = render();
  for (const text of ['Lịch tiêm chủng', 'Bông', 'Lên lịch tiêm', 'Ghi mũi đã tiêm', 'Dự kiến', 'Đã tiêm', 'Đã qua ngày hẹn', 'Hôm nay', 'Sắp tới', 'Phòng tiêm']) expect(html).toContain(text);
  expect(html).toContain('aria-label="Sửa lịch tiêm Sắp tiêm"');
  expect(html).toContain('aria-label="Ghi đã tiêm Sắp tiêm"');
  expect(html).not.toContain('aria-label="Ghi đã tiêm Đã ghi"');
  expect(html).toContain('09:30');
  expect(html).toContain('Chưa có thông báo nhắc tự động');
});
it('shows useful empty states and disables mutations while saving', () => {
  expect(render([])).toContain('Chưa có lịch tiêm dự kiến.');
  expect(render([])).toContain('Chưa ghi nhận mũi đã tiêm.');
  for (const button of render(events, true).matchAll(/<button[^>]*>/g)) expect(button[0]).toContain('disabled');
});
it('escapes user content and does not display another baby or family', () => {
  const unsafe = { ...future, body: { ...future.body, note: '<script>unsafe</script>' } };
  const foreign = entry('FOREIGN', future.body.started_at);
  const html = render([unsafe, { ...foreign, baby_id: 'other' }, { ...foreign, family_id: 'other' }]);
  expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>'); expect(html).not.toContain('FOREIGN');
});
it('keeps vaccinations out of daily activity journals and metrics', () => {
  expect(journalEvents(events, '2026-09-05', 'Asia/Ho_Chi_Minh')).toEqual([]);
  expect(summarize(events, now - 86_400_000, now)).toEqual({ bottle: 0, diapers: 0, sleep: 0, breast: 0 });
});
it('renders required, labelled fields for a new plan without a future-date cap', () => {
  const html = renderToStaticMarkup(<VaccinationForm timezone="Asia/Ho_Chi_Minh" saving={false} onSave={() => {}} />);
  const input = (name: string) => html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))![0];
  expect(input('vaccine')).toContain('required=""'); expect(input('vaccine')).toContain('maxLength="120"');
  expect(input('date')).toContain('type="text"'); expect(input('date')).toContain('required=""');
  expect(input('time')).toContain('type="time"'); expect(input('time')).toContain('required=""');
  expect(input('date')).not.toContain(' max=');
  expect(html).toContain('Lưu lịch dự kiến'); expect(html).not.toContain('Xóa lịch tiêm');
});
it('opens completion with actual time, retains vaccine details and caps completed dates', () => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  const html = renderToStaticMarkup(<VaccinationForm body={future.body} initialStatus="completed" timezone="Asia/Ho_Chi_Minh"
    saving onSave={() => {}} onDelete={() => {}} />);
  expect(html).toContain('value="Sắp tiêm"');
  const date = html.match(/<input[^>]*name="date"[^>]*>/)![0];
  expect(date).toContain('value="05/09/2026"');
  expect(html).toMatch(/name="time"[^>]*value="15:00"/);
  expect(html).toContain('Xóa lịch tiêm');
  for (const field of html.matchAll(/<(?:input|select|textarea|button)[^>]*>/g)) expect(field[0]).toContain('disabled');
});