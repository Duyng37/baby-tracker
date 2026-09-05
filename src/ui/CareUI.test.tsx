import { Children, isValidElement, type ReactNode, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { CareEventType, LocalEvent } from '../domain/types';
import { CareActions } from './CareActions';
import { CareForm } from './CareForm';
import { MedicationSchedule, medicationEvents, type MedicationEvent } from './MedicationSchedule';

const timezone = 'Asia/Ho_Chi_Minh', now = Date.parse('2026-09-05T08:00:00Z');
const scope = { family_id: 'family', baby_id: 'baby' };
const plan: MedicationEvent = { ...scope, id: 'plan', server: null, version: 1,
  body: { type: 'medication', started_at: '2026-09-05T07:00:00Z', ended_at: null, note: '<script>note</script>', deleted: false,
    payload: { name: 'Thuốc thử', dose: 'Theo đơn', status: 'planned' } } };

it('renders labeled care forms with units, optional inputs and saving protection', () => {
  for (const [type, fields] of Object.entries({ medication: ['name', 'dose', 'status'], meal: ['food', 'amount'], growth: ['height', 'weight'], activity: ['kind', 'minutes'] })) {
    const html = renderToStaticMarkup(<CareForm type={type as CareEventType} timezone={timezone} saving onSave={() => {}} onDelete={() => {}} />);
    for (const field of fields) expect(html.match(new RegExp(`<(?:input|select)[^>]*name="${field}"[^>]*>`))?.[0]).toContain('disabled');
    expect(html).toContain('Múi giờ: Asia/Ho_Chi_Minh'); expect(html).toContain('Đang lưu…');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Xóa ghi nhận/);
    expect(html.match(/<input[^>]*name="time"[^>]*>/)?.[0]).toContain('required');
    expect(html).toContain('class="time-input-text"'); expect(html).toContain('Mở bộ chọn giờ: Giờ');
    expect(html).not.toContain('type="time"');
  }
});
it('prefills the selected activity and explicitly describes medication limitations', () => {
  const props = { timezone, saving: false, onSave: () => {} };
  const activity = renderToStaticMarkup(<CareForm {...props} type="activity" kind="tummy_time" />);
  expect(activity).toContain('value="tummy_time" selected="">Tummy time (nằm sấp)');
  const medicine = renderToStaticMarkup(<CareForm {...props} type="medication" body={plan.body} />);
  expect(medicine).toContain('value="Thuốc thử"'); expect(medicine).toContain('value="Theo đơn"');
  expect(medicine).toContain('chưa có thông báo nhắc tự động'); expect(medicine).not.toContain('<script>');
  expect(medicine).toContain('Đã uống'); expect(medicine).toContain('Lưu lịch uống thuốc');
});
it('wires every care row to its distinct action, including activity presets', () => {
  const onAction = vi.fn();
  const tree = CareActions({ babyName: 'Bông', running: [], saving: false, onAction });
  function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
    return Children.toArray(node).flatMap(child => isValidElement<Record<string, unknown>>(child) ? [child, ...elements(child.props.children as ReactNode)] : []);
  }
  const buttons = elements(tree).filter(node => node.type === 'button');
  expect(buttons).toHaveLength(12);
  for (const button of buttons) (button.props.onClick as () => void)();
  expect(onAction.mock.calls).toEqual([
    ['breast', undefined], ['bottle', undefined], ['diaper', undefined], ['sleep', undefined], ['meal', undefined],
    ['medication', undefined], ['growth', undefined], ['activity', 'bath'], ['activity', 'tummy_time'],
    ['activity', 'outdoor'], ['activity', 'indoor'], ['activity', 'brushing_teeth'],
  ]);
});
it('filters medication by baby/family/deletion and orders plans oldest first, completed newest first', () => {
  const later = { ...plan, id: 'later', body: { ...plan.body, started_at: '2026-10-05T08:00:00Z' } };
  const complete = { ...plan, id: 'complete', body: { ...plan.body, payload: { ...plan.body.payload, status: 'completed' as const } } };
  const completeLater = { ...complete, id: 'complete-later', body: { ...complete.body, started_at: '2026-09-05T08:00:00Z' } };
  const events: LocalEvent[] = [later, complete, completeLater, plan, { ...plan, baby_id: 'sibling' }, { ...plan, family_id: 'foreign' }, { ...plan, body: { ...plan.body, deleted: true } }];
  expect(medicationEvents(events, scope, 'planned').map(event => event.id)).toEqual(['plan', 'later']);
  expect(medicationEvents(events, scope, 'completed').map(event => event.id)).toEqual(['complete-later', 'complete']);
});
it('renders truthful empty/overdue states and disables edits during saving', () => {
  const props = { scope, timezone, babyName: 'Bông', now, saving: false, onAdd: () => {}, onEdit: () => {} };
  expect(renderToStaticMarkup(<MedicationSchedule {...props} events={[]} />)).toContain('Chưa có lịch uống thuốc dự kiến.');
  const html = renderToStaticMarkup(<MedicationSchedule {...props} events={[plan]} saving />);
  expect(html).toContain('Đã qua giờ dự kiến'); expect(html).toContain('Theo đơn'); expect(html).not.toContain('<script>');
  expect(html).toContain('data-overdue="true"'); expect(html).toMatch(/class="care-plan"[^>]*disabled/);
  expect(html).toContain('dateTime="2026-09-05T07:00:00Z"');
});