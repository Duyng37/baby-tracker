import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { changeTimer, startTimer } from '../domain/events';
import type { EventBody, QuickEventType } from '../domain/types';

// Exercise callbacks and state without simulating DOM or browser behavior.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useId: () => 'record-time',
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = typeof next === 'function' ? next(hooks.slots[index]) : next; }];
  },
}));
import { QuickRecord } from './QuickRecord';

const now = Date.parse('2026-09-05T18:23:45.678Z');
const onSave = vi.fn();
let type: QuickEventType, running: EventBody | undefined, saving: boolean;
let tree: ReturnType<typeof QuickRecord>;
function render() {
  hooks.cursor = 0;
  tree = QuickRecord({ type, running, saving, timezone: 'Asia/Ho_Chi_Minh', milk: 'formula', onMilkChange: vi.fn(), onSave });
}
function elements(node: ReactNode = tree): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements((child.props.children as ReactNode) ?? null)] : []);
}
function field(name: string) { return elements().find(node => node.props.name === name)!.props; }
function change(name: string, value: string) {
  if (['date', 'wakeDate', 'time', 'wakeTime'].includes(name)) (field(name).onChange as (value: string) => void)(value);
  else (field(name).onChange as (event: { target: { value: string } }) => void)({ target: { value } });
  render();
}
function save() {
  (elements().find(node => node.type === 'button' && node.props.className === 'primary')!.props.onClick as () => void)(); render();
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); hooks.slots = []; onSave.mockReset();
  type = 'sleep'; running = undefined; saving = false;
});
afterEach(() => vi.useRealTimers());

it('keeps sleep running by default despite prefilling all four date/time fields', () => {
  render();
  expect(field('date').value).toBe('2026-09-06'); expect(field('time').value).toBe('01:23');
  expect(field('wakeDate').value).toBe('2026-09-06'); expect(field('wakeTime').value).toBe('01:23');
  save();
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ started_at: '2026-09-05T18:23:00.000Z', ended_at: null }));
});
it('uses the current wake time only after choosing that the baby has woken up', () => {
  render(); change('date', '2026-09-05'); change('time', '22:00');
  vi.setSystemTime(now + 120_000); change('sleepStatus', 'awake');
  expect(field('wakeDate').value).toBe('2026-09-06'); expect(field('wakeTime').value).toBe('01:25');
  expect(elements().filter(node => node.type === 'fieldset').every(node => node.props.disabled === false)).toBe(true);
  save();
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ started_at: '2026-09-05T15:00:00.000Z', ended_at: '2026-09-05T18:25:00.000Z' }));
});
it('ignores prefilled wake values after switching back to still sleeping', () => {
  render(); change('sleepStatus', 'awake'); change('sleepStatus', 'sleeping'); save();
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ ended_at: null }));
});
it('preserves edited fields across rerenders and refreshes defaults when reopened', () => {
  render(); change('sleepStatus', 'awake'); change('date', '2026-09-04'); change('time', '22:00');
  change('wakeDate', '2026-09-05'); change('wakeTime', '06:00');
  vi.setSystemTime(now + 86_400_000); saving = true; render();
  expect(field('date').value).toBe('2026-09-04'); expect(field('time').value).toBe('22:00');
  expect(field('wakeDate').value).toBe('2026-09-05'); expect(field('wakeTime').value).toBe('06:00');
  expect(field('sleepStatus').disabled).toBe(true);
  expect(elements().filter(node => node.type === 'fieldset').every(node => node.props.disabled === true)).toBe(true);
  hooks.slots = []; saving = false; render();
  expect(field('date').value).toBe('2026-09-07'); expect(field('time').value).toBe('01:23');
  expect(field('wakeDate').value).toBe('2026-09-07'); expect(field('sleepStatus').value).toBe('sleeping');
});
it.each(['sleep', 'breast'] as const)('stops a %s timer started within the current minute without losing seconds', timer => {
  type = timer; running = startTimer(timer, 'left', now - 1000); render(); save();
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ started_at: running.started_at, ended_at: new Date(now).toISOString() }));
});
it('stops nursing immediately after a side switch within the current minute', () => {
  type = 'breast'; running = changeTimer(startTimer('breast', 'left', now - 3_600_000), 'switch', now - 1000);
  render(); save();
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ ended_at: new Date(now).toISOString() }));
});
it('still accepts edited stop times and rejects stops before the start', () => {
  running = startTimer('sleep', 'left', now - 3_600_000); render(); change('time', '00:00'); save();
  expect(onSave).not.toHaveBeenCalled();
  expect(elements().some(node => node.props.role === 'alert')).toBe(true);
  change('time', '01:00'); save();
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ ended_at: '2026-09-05T18:00:00.000Z' }));
});
it('saves an explicitly backdated overnight sleep and rejects reversed times', () => {
  render(); change('sleepStatus', 'awake'); change('date', '2026-09-04'); change('time', '22:00');
  change('wakeDate', '2026-09-04'); change('wakeTime', '06:00'); save();
  expect(onSave).not.toHaveBeenCalled();
  change('wakeDate', '2026-09-05'); save();
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ started_at: '2026-09-04T15:00:00.000Z', ended_at: '2026-09-04T23:00:00.000Z' }));
});
it('rejects invalid text from either time picker instead of falling back to a previously valid time', () => {
  render(); change('time', '12:'); save();
  expect(onSave).not.toHaveBeenCalled();
  change('time', '01:00'); change('sleepStatus', 'awake'); change('wakeTime', '25:00'); save();
  expect(onSave).not.toHaveBeenCalled();
  change('wakeTime', '01:20'); save();
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ started_at: '2026-09-05T18:00:00.000Z', ended_at: '2026-09-05T18:20:00.000Z' }));
});