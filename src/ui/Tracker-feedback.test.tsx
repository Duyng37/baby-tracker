import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LocalStore } from '../data/store';
import type { StoreView } from '../data/useStore';
import type { LocalEvent } from '../domain/types';
import { DataError } from '../domain/events';

// Exercise Tracker callbacks/state without a browser. Child components and effects are not mounted.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.slots[index], (value: unknown) => {
      hooks.slots[index] = typeof value === 'function' ? value(hooks.slots[index]) : value;
    }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useEffect: vi.fn(), useLayoutEffect: vi.fn(),
}));
let current: StoreView;
let online = true;
const kick = vi.fn();
const save = vi.fn();
const edit = vi.fn();
vi.mock('../data/useStore', () => ({ useStore: () => current }));
vi.mock('../sync/useSync', () => ({ useSync: () => ({ online, busy: false, message: '', kick }) }));
vi.mock('../cloud/supabase', () => ({ signOut: vi.fn(), authenticatedTransport: vi.fn(), authEvents: new EventTarget() }));
vi.mock('./event-edits', () => ({ saveUnchangedEvent: (...args: unknown[]) => edit(...args) }));
vi.mock('./theme', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }));
import { Tracker } from './Tracker';
import { QuickActions } from './QuickActions';
import { QuickRecord } from './QuickRecord';
import { Journal } from './Journal';
import { JournalDateInput } from './JournalDateInput';
import { Metrics } from './Metrics';
import { Sheet } from './Sheet';
import { CareActions } from './CareActions';
import { CareForm } from './CareForm';
import { MedicationSchedule } from './MedicationSchedule';
import { VaccinationSchedule } from './VaccinationSchedule';
import { VaccinationForm } from './VaccinationForm';
import { JournalEntryForm } from './JournalEntryForm';

const store = { db: { userId: 'owner' }, save } as unknown as LocalStore;
const entry: LocalEvent = { id: 'event', family_id: 'family', baby_id: 'baby', server: null, version: 1,
  body: { type: 'bottle', started_at: '2026-09-05T08:00:00.000Z', ended_at: null, note: '', deleted: false,
    payload: { amount_ml: 90, milk: 'formula' } } };
let tree: ReactNode;
let localOnly = false;
function render() { hooks.cursor = 0; tree = Tracker({ store, localOnly }); }
function elements(node: ReactNode = tree): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements((child.props.children as ReactNode) ?? null)] : []);
}
function component<P>(type: (props: P) => ReactNode): P {
  const node = elements().find(element => element.type === type);
  expect(node, type.name).toBeDefined();
  return node!.props as P;
}
function button(label: string) {
  const node = elements().find(element => element.type === 'button' && Children.toArray(element.props.children as ReactNode).includes(label));
  expect(node, label).toBeDefined();
  return node!.props.onClick as () => void | Promise<void>;
}
const feedback = (className = 'notice') => renderToStaticMarkup(elements().find(node => node.props.className === className) ?? null);
async function perform(action: () => void | Promise<void>) {
  await action(); await vi.advanceTimersByTimeAsync(400); render();
}
async function openRecord() { await perform(() => component(QuickActions).onAction('bottle')); }
async function removeRecord() {
  await perform(() => component(Journal).onSelect(entry));
  await perform(() => component(JournalEntryForm).onDelete());
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T09:00:00.000Z')); vi.clearAllMocks();
  hooks.slots = []; online = true; localOnly = false;
  save.mockResolvedValue(entry); edit.mockResolvedValue(entry);
  current = { ready: true, error: false, events: [entry], operations: [], lastContact: null,
    workspace: { families: [{ id: 'family', name: 'Gia đình', timezone: 'Asia/Ho_Chi_Minh', sync_cursor: '0' }],
      babies: [{ id: 'baby', family_id: 'family', nickname: 'Bông', birth_date: null }],
      memberships: [{ family_id: 'family', user_id: 'owner', role: 'owner' }] } };
  render();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('updates journal entries, totals and heading together when selecting a date', async () => {
  const yesterday: LocalEvent = { ...entry, id: 'yesterday', body: { ...entry.body, type: 'bottle',
    started_at: '2026-09-04T08:00:00.000Z', payload: { amount_ml: 120, milk: 'formula' } } };
  const foreign = { ...yesterday, id: 'foreign', baby_id: 'sibling' };
  const heading = () => elements().filter(node => node.type === 'h2').map(node => node.props.children);
  current.events = [entry, yesterday, foreign]; render();
  await perform(button('Nhật ký'));
  expect(component(JournalDateInput).value).toBe('2026-09-05');
  expect(component(Journal).events.map(event => event.id)).toEqual(['event']);
  expect(component(Metrics).summary.bottle).toBe(90);
  expect(heading()).toContain('Ngày hôm nay');
  await perform(() => component(JournalDateInput).onChange('2026-09-04'));
  expect(component(JournalDateInput).value).toBe('2026-09-04');
  expect(component(Journal).events.map(event => event.id)).toEqual(['yesterday']);
  expect(component(Metrics).summary.bottle).toBe(120);
  expect(heading()).toContain('Tổng hợp ngày 04/09/2026');
  await perform(() => component(JournalDateInput).onChange('2026-09-03'));
  expect(component(Journal).events).toEqual([]);
  expect(component(Metrics).summary).toEqual({ bottle: 0, diapers: 0, sleep: 0, breast: 0 });
  expect(heading()).toContain('Tổng hợp ngày 03/09/2026');
  await perform(() => component(JournalDateInput).onChange('2026-09-05'));
  expect(component(Metrics).summary.bottle).toBe(90);
  expect(heading()).toContain('Ngày hôm nay');
});

it('keeps Today totals and entries on today after viewing a past journal date', async () => {
  const yesterday: LocalEvent = { ...entry, id: 'yesterday', body: { ...entry.body, type: 'bottle',
    started_at: '2026-09-04T16:30:00Z', payload: { amount_ml: 120, milk: 'formula' } } };
  const heading = () => elements().filter(node => node.type === 'h2').map(node => node.props.children);
  current.events = [entry, yesterday]; render();
  await perform(button('Nhật ký'));
  await perform(() => component(JournalDateInput).onChange('2026-09-04'));
  expect(component(Metrics).summary.bottle).toBe(120);
  await perform(button('Hôm nay'));
  expect(component(Metrics).summary.bottle).toBe(90);
  expect(component(Journal).events.map(event => event.id)).toEqual(['event']);
  expect(heading()).toContain('Ngày hôm nay');
  expect(heading()).not.toContain('Tổng hợp ngày 04/09/2026');
  await perform(button('Nhật ký'));
  expect(component(JournalDateInput).value).toBe('2026-09-04');
  expect(component(Metrics).summary.bottle).toBe(120);
  expect(component(Journal).events.map(event => event.id)).toEqual(['yesterday']);
});

it.each(['breast', 'bottle', 'diaper', 'sleep'] as const)('routes Care %s to the existing quick-record flow', async type => {
  await perform(button('Chăm con'));
  await perform(() => component(CareActions).onAction(type));
  expect(component(QuickRecord).type).toBe(type);
});
it.each(['bath', 'tummy_time', 'outdoor', 'indoor', 'brushing_teeth'] as const)('opens and saves Care activity %s for the selected baby', async kind => {
  localOnly = true; online = false; render();
  await perform(button('Chăm con'));
  await perform(() => component(CareActions).onAction('activity', kind));
  expect(component(CareForm).kind).toBe(kind);
  const body = { ...entry.body, type: 'activity' as const, payload: { kind, duration_minutes: 10 } };
  await perform(() => component(CareForm).onSave(body));
  expect(save).toHaveBeenCalledWith({ family_id: 'family', baby_id: 'baby' }, expect.any(String), body);
  expect(feedback()).toContain('Đã lưu ghi nhận.');
});
it.each(['meal', 'growth', 'medication'] as const)('opens the %s form from Care', async type => {
  await perform(button('Chăm con'));
  await perform(() => component(CareActions).onAction(type));
  expect(component(CareForm).type).toBe(type);
});
it('edits, deletes and undoes medication on the same event', async () => {
  const body = { ...entry.body, type: 'medication' as const, payload: { name: 'Thuốc thử', dose: '', status: 'planned' as const } };
  const medication = { ...entry, body }; current.events = [medication]; render();
  await perform(button('Chăm con'));
  await perform(() => component(MedicationSchedule).onEdit(medication));
  expect(component(CareForm).body).toEqual(body);
  await perform(() => component(CareForm).onSave({ ...body, payload: { ...body.payload, status: 'completed' } }));
  expect(edit).toHaveBeenCalledWith(store, medication, expect.objectContaining({ payload: { name: 'Thuốc thử', dose: '', status: 'completed' } }));
  expect(save).not.toHaveBeenCalled();
  await perform(() => component(MedicationSchedule).onEdit(medication));
  await perform(() => component(CareForm).onDelete!());
  expect(feedback()).toContain('Hoàn tác');
  await perform(button('Hoàn tác'));
  expect(edit).toHaveBeenLastCalledWith(store, { ...medication, body: { ...body, deleted: true } }, body);
});
it('opens vaccination recording from Care after moving it out of Family', async () => {
  await perform(button('Gia đình'));
  expect(elements().some(node => node.type === VaccinationSchedule)).toBe(false);
  await perform(button('Chăm con'));
  await perform(() => component(VaccinationSchedule).onAdd('planned'));
  expect(component(VaccinationForm).initialStatus).toBe('planned');
});

it.each(['online', 'offline', 'local-only'])('confirms a successful save in %s mode and triggers background sync', async mode => {
  online = mode === 'online'; localOnly = mode === 'local-only'; render();
  await openRecord(); await perform(() => component(QuickRecord).onSave(entry.body));
  expect(save).toHaveBeenCalledOnce(); expect(kick).toHaveBeenCalledOnce();
  expect(feedback()).toContain('Đã lưu ghi nhận.');
  expect(elements().some(node => node.type === Sheet)).toBe(false);
});
it('confirms a running-timer update', async () => {
  const sleep: LocalEvent = { ...entry, body: { ...entry.body, type: 'sleep', payload: {} } };
  current.events = [sleep]; render();
  await perform(button('Đã thức'));
  expect(edit).toHaveBeenCalledWith(store, sleep, expect.objectContaining({ ended_at: expect.any(String) }));
  expect(kick).toHaveBeenCalledOnce(); expect(feedback()).toContain('Đã cập nhật ghi nhận.');
});
it('keeps an explicit deletion notice and undo, then confirms restoration', async () => {
  await removeRecord();
  expect(edit).toHaveBeenCalledWith(store, entry, { ...entry.body, deleted: true });
  expect(feedback()).toContain('Đã xóa ghi nhận.'); expect(feedback()).toContain('Hoàn tác');
  expect(feedback()).not.toContain('cloud');
  await perform(button('Hoàn tác'));
  expect(edit).toHaveBeenLastCalledWith(store, { ...entry, body: { ...entry.body, deleted: true } }, entry.body);
  expect(kick).toHaveBeenCalledTimes(2); expect(feedback()).toContain('Đã khôi phục ghi nhận.');
});
it('opens a journal item with full editable details and saves it on the same event', async () => {
  await perform(() => component(Journal).onSelect(entry));
  expect(component(JournalEntryForm).body).toEqual(entry.body);
  const changed = { ...entry.body, type: 'bottle' as const, started_at: '2026-09-05T07:30:00.000Z', note: 'Sau khi ngủ dậy',
    payload: { amount_ml: 120, milk: 'breast_milk' as const } };
  await perform(() => component(JournalEntryForm).onSave(changed));
  expect(edit).toHaveBeenCalledWith(store, entry, changed);
  expect(feedback()).toContain('Đã cập nhật ghi nhận.');
});
it('places success feedback below the header and above the main content', async () => {
  await removeRecord();
  const html = renderToStaticMarkup(tree);
  expect(html.indexOf('class="notice"')).toBeGreaterThan(html.indexOf('</header>'));
  expect(html.indexOf('class="notice"')).toBeLessThan(html.indexOf('<main'));
});
it.each([new Error('disk full'), new DataError('Bản ghi chưa hợp lệ.')])('preserves save errors and leaves the form open: %s', async error => {
  save.mockRejectedValueOnce(error);
  await openRecord(); await perform(() => component(QuickRecord).onSave(entry.body));
  expect(feedback('form-feedback')).toContain(error instanceof DataError ? error.message : 'Chưa lưu được trên thiết bị.');
  expect(kick).not.toHaveBeenCalled();
  expect(elements().some(node => node.type === Sheet)).toBe(true);
});
it('does not offer undo or report deletion if the delete fails', async () => {
  edit.mockRejectedValueOnce(new DataError('Bản ghi đã thay đổi.'));
  await removeRecord();
  expect(feedback('form-feedback')).toContain('Bản ghi đã thay đổi.');
  expect(feedback('form-feedback')).not.toContain('Đã xóa');
  expect(feedback()).toBe(''); expect(kick).not.toHaveBeenCalled();
});
it('retains the error and undo action if restoring fails, allowing a retry', async () => {
  await removeRecord(); edit.mockRejectedValueOnce(new Error('disk full'));
  await perform(button('Hoàn tác'));
  expect(feedback()).toContain('Chưa lưu được trên thiết bị.'); expect(feedback()).toContain('Hoàn tác');
  expect(kick).toHaveBeenCalledOnce();
  await perform(button('Hoàn tác'));
  expect(feedback()).toContain('Đã khôi phục ghi nhận.'); expect(kick).toHaveBeenCalledTimes(2);
});