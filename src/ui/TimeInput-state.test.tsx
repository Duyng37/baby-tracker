import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

// Callback/state contracts only; these tests do not mount a DOM or check browser layout.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(), useId: () => 'time-popup', useEffect: vi.fn(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = typeof next === 'function' ? next(hooks.slots[index]) : next; }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
}));
import { TimeInput } from './TimeInput';

let tree: ReturnType<typeof TimeInput>, value: string, disabled: boolean;
const onChange = vi.fn((next: string) => { value = next; });
function render() { hooks.cursor = 0; tree = TimeInput({ value, disabled, onChange, ariaLabel: 'Giờ' }); }
function elements(node: ReactNode = tree): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements((child.props.children as ReactNode) ?? null)] : []);
}
const field = () => elements().find(node => node.type === 'input')!.props;
const button = (label: string) => elements().find(node => node.type === 'button' && (node.props['aria-label'] === label || node.props.children === label))!.props;
function click(label: string) { (button(label).onClick as () => void)(); render(); }
const expanded = () => button('Mở bộ chọn giờ: Giờ')['aria-expanded'];
function type(text: string) { (field().onChange as (event: unknown) => void)({ currentTarget: { value: text } }); render(); }
function key(props: Record<string, unknown>, key: string, extra = {}) {
  const event = { key, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra };
  (props.onKeyDown as (event: unknown) => void)(event); render(); return event;
}
beforeEach(() => { hooks.slots = []; value = '09:37'; disabled = false; onChange.mockClear(); render(); });

it('opens at the existing hour and exact minute without committing, including planned blanks', () => {
  click('Mở bộ chọn giờ: Giờ');
  expect(expanded()).toBe(true); expect(button('09 giờ')['aria-pressed']).toBe(true);
  expect(button('37 phút')['aria-pressed']).toBe(true);
  expect(elements().filter(node => node.type === 'button' && node.props['data-value'] !== undefined)).toHaveLength(84);
  expect(elements().filter(node => node.props.tabIndex === 0)).toHaveLength(2);
  expect(onChange).not.toHaveBeenCalled(); click('Hủy');
  value = ''; render(); click('Mở bộ chọn giờ: Giờ'); click('Hủy');
  expect(value).toBe(''); expect(onChange).not.toHaveBeenCalled();
});
it('commits a selected time only on confirmation and restores trigger focus', () => {
  const focus = vi.fn(); (button('Mở bộ chọn giờ: Giờ').ref as { current: unknown }).current = { focus };
  click('Mở bộ chọn giờ: Giờ'); click('23 giờ'); click('59 phút');
  expect(value).toBe('09:37'); expect(onChange).not.toHaveBeenCalled();
  click('Xong'); expect(onChange).toHaveBeenLastCalledWith('23:59'); expect(expanded()).toBe(false);
  expect(focus).toHaveBeenCalled(); expect(field().value).toBe('23:59');
});
it('commits the latest touch choices even before React renders them', () => {
  click('Mở bộ chọn giờ: Giờ');
  (button('23 giờ').onClick as () => void)();
  (button('59 phút').onClick as () => void)();
  (button('Xong').onClick as () => void)();
  expect(onChange).toHaveBeenLastCalledWith('23:59');
});
it('cancels tentative choices and reopens from the controlled value', () => {
  click('Mở bộ chọn giờ: Giờ'); click('22 giờ'); click('Hủy');
  click('Mở bộ chọn giờ: Giờ'); expect(button('09 giờ')['aria-pressed']).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
});
it('closes only the time popup on Escape, without dismissing the surrounding form', () => {
  click('Mở bộ chọn giờ: Giờ');
  const event = key(tree.props, 'Escape');
  expect(event.preventDefault).toHaveBeenCalled(); expect(event.stopPropagation).toHaveBeenCalled();
  expect(expanded()).toBe(false); expect(onChange).not.toHaveBeenCalled();
  expect(key(tree.props, 'Escape').preventDefault).not.toHaveBeenCalled();
});
it('opens from the keyboard and moves the roving selection with arrows, Home and End', () => {
  key(field(), 'ArrowDown'); expect(expanded()).toBe(true);
  const focus = vi.fn(), querySelector = vi.fn(() => ({ focus }));
  const currentTarget = { parentElement: { querySelector } };
  key(button('09 giờ'), 'ArrowDown', { currentTarget }); expect(button('10 giờ').tabIndex).toBe(0);
  expect(querySelector).toHaveBeenLastCalledWith('[data-value="10"]'); expect(focus).toHaveBeenCalled();
  key(button('10 giờ'), 'Home', { currentTarget }); expect(button('00 giờ').tabIndex).toBe(0);
  key(button('00 giờ'), 'ArrowUp', { currentTarget }); expect(button('23 giờ').tabIndex).toBe(0);
  key(button('37 phút'), 'End', { currentTarget }); expect(button('59 phút').tabIndex).toBe(0);
  key(button('59 phút'), 'ArrowDown', { currentTarget }); expect(button('00 phút').tabIndex).toBe(0);
  expect(key(button('00 phút'), 'Tab', { currentTarget }).preventDefault).not.toHaveBeenCalled();
  click('Xong'); expect(value).toBe('23:00');
});
it('closes without committing when focus leaves the control but not when moving inside it', () => {
  click('Mở bộ chọn giờ: Giờ');
  tree.props.onBlur({ currentTarget: { contains: () => true }, relatedTarget: {} } as never); render();
  expect(expanded()).toBe(true);
  tree.props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null } as never); render();
  expect(expanded()).toBe(false); expect(onChange).not.toHaveBeenCalled();
});
it('preserves typed changes, normalizes four digits and propagates invalid drafts for validation', () => {
  type('1234'); expect(value).toBe('12:34'); expect(field()['aria-invalid']).toBe(false);
  type('25:00'); expect(value).toBe('25:00'); expect(field()['aria-invalid']).toBe(true);
  type('12:'); expect(value).toBe('12:'); expect(field()['aria-invalid']).toBe(true);
  type(''); expect(value).toBe(''); expect(field()['aria-invalid']).toBe(false);
});
it('hides the popup and prevents reopening when disabled during saving', () => {
  click('Mở bộ chọn giờ: Giờ'); disabled = true; render();
  expect(field().disabled).toBe(true); expect(button('Mở bộ chọn giờ: Giờ').disabled).toBe(true);
  expect(elements().some(node => node.props.role === 'dialog')).toBe(false);
  click('Mở bộ chọn giờ: Giờ'); expect(expanded()).toBe(false);
});