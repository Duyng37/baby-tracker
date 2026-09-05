import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CareBody, CareEventType } from '../domain/types';

// Callback/state tests; no DOM mounting or browser behavior is simulated.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.slots[index], (value: unknown) => { hooks.slots[index] = typeof value === 'function' ? value(hooks.slots[index]) : value; }];
  },
}));
import { CareForm } from './CareForm';

const timezone = 'Asia/Ho_Chi_Minh';
const onSave = vi.fn();
let tree: ReturnType<typeof CareForm>;
let type: CareEventType, body: CareBody | undefined;
function render() { hooks.cursor = 0; tree = CareForm({ type, body, timezone, saving: false, onSave }); }
function elements(node: ReactNode = tree): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, unknown>>(child) ? [child, ...elements((child.props.children as ReactNode) ?? null)] : []);
}
function field(name: string) { return elements().find(node => node.props.name === name)!.props; }
function change(name: string, value: string) {
  if (name === 'date' || name === 'time') (field(name).onChange as (value: string) => void)(value);
  else (field(name).onChange as (event: { target: { value: string } }) => void)({ target: { value } });
  render();
}
function submit() { tree.props.onSubmit({ preventDefault: vi.fn() }); render(); }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T08:00:00.000Z'));
  hooks.slots = []; onSave.mockReset(); type = 'medication'; body = undefined;
});
afterEach(() => vi.useRealTimers());

it('completes a future medication plan at the actual time without losing name or dose', () => {
  body = { type: 'medication', started_at: '2099-01-01T02:00:00Z', ended_at: null, deleted: false, note: 'Ghi chú',
    payload: { name: 'Thuốc thử', dose: 'Theo đơn', status: 'planned' } };
  render(); change('status', 'completed');
  expect(field('date').value).toBe('2026-09-05'); expect(field('time').value).toBe('15:00');
  submit();
  expect(onSave).toHaveBeenCalledWith({ ...body, started_at: '2026-09-05T08:00:00.000Z', payload: { ...body.payload, status: 'completed' } });
});
it('keeps validation errors visible without saving, then lets the user correct the form', () => {
  type = 'growth'; render(); submit();
  expect(onSave).not.toHaveBeenCalled();
  expect(elements().find(node => node.props.role === 'alert')!.props.children).toContain('Nhập chiều cao');
  change('weight', '7.25'); submit();
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ type: 'growth', payload: { height_cm: null, weight_kg: 7.25 } }));
  expect(elements().some(node => node.props.role === 'alert')).toBe(false);
});
it('accepts the shared time picker value and rejects invalid typed times without saving', () => {
  type = 'growth'; render(); change('weight', '7.25'); change('time', '25:00'); submit();
  expect(onSave).not.toHaveBeenCalled();
  change('time', '09:37'); submit();
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ started_at: '2026-09-05T02:37:00.000Z' }));
});
it('saves meal fields and activity selections rather than only notes', () => {
  type = 'meal'; render(); change('food', ' Cháo '); change('amount', ' Nửa bát '); submit();
  expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'meal', payload: { food: 'Cháo', amount: 'Nửa bát' } }));
  hooks.slots = []; type = 'activity'; render(); change('kind', 'brushing_teeth'); change('minutes', '2'); submit();
  expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'activity', payload: { kind: 'brushing_teeth', duration_minutes: 2 } }));
});