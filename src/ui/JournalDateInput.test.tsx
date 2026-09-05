import { Children, isValidElement, type ChangeEvent, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { DateInput } from './DateInput';

// Callback/state contracts only; these checks do not replace a browser layout test.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useId: () => 'journal-date',
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = next; }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useEffect: vi.fn(),
}));
import { JournalDateInput, parseJournalDate } from './JournalDateInput';

let value: string;
let tree: ReactNode;
const onChange = vi.fn((next: string) => { value = next; });
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as ReactNode)] : []);
}
const input = (type: string) => elements(tree).find(node => node.type === 'input' && node.props.type === type)!.props;
function render() {
  hooks.cursor = 0;
  tree = DateInput({ value, onChange, ariaLabel: 'Chọn ngày xem nhật ký', className: 'journal-date-text' });
}
function change(type: string, next: string) {
  (input(type).onChange as (event: ChangeEvent<HTMLInputElement>) => void)({ currentTarget: { value: next } } as ChangeEvent<HTMLInputElement>);
  render();
}
function calendarAction(label: string) {
  return elements(tree).find(node => node.type === 'button' && node.props['aria-label'] === label)!.props.onClick as () => void;
}
beforeEach(() => {
  vi.clearAllMocks(); hooks.slots = []; value = '2026-09-05'; render();
});

it.each([
  ['05/09/2026', '2026-09-05'], ['29/02/2024', '2024-02-29'], ['01/01/0001', '0001-01-01'],
  ['31/12/2026', '2026-12-31'],
])('parses %s without changing the calendar day or timezone', (text, iso) => {
  expect(parseJournalDate(text)).toBe(iso);
});
it.each(['', '5/9/2026', '05/09/26', '2026-09-05', '29/02/2026', '31/04/2026', '00/09/2026', '05/13/2026', '01/01/0000'])('rejects invalid or incomplete date %s', text => {
  expect(parseJournalDate(text)).toBeNull();
});
it('renders a labelled fixed-format text field and a calendar trigger', () => {
  expect(input('text').value).toBe('05/09/2026');
  expect(input('text').placeholder).toBe('dd/mm/yyyy');
  expect(input('text')['aria-label']).toBe('Chọn ngày xem nhật ký');
  expect(renderToStaticMarkup(<JournalDateInput value={value} onChange={onChange} />)).toContain('<label for="journal-date">Ngày</label>');
});
it('converts a typed date to ISO before updating the filter', () => {
  change('text', '04/09/2026');
  expect(onChange).toHaveBeenCalledWith('2026-09-04');
  expect(input('text').value).toBe('04/09/2026');
});
it('keeps an incomplete draft without changing the current journal filter', () => {
  change('text', '04/09/');
  expect(onChange).not.toHaveBeenCalled();
  expect(input('text').value).toBe('04/09/');
  expect(value).toBe('2026-09-05');
});
it('selects a calendar day immediately and closes the calendar', () => {
  calendarAction('Mở lịch')(); render();
  calendarAction('Chọn ngày 06/09/2026')(); render();
  expect(onChange).toHaveBeenLastCalledWith('2026-09-06');
  expect(input('text').value).toBe('06/09/2026');
  expect(elements(tree).some(node => node.props.className === 'date-input-calendar')).toBe(false);
});
it('marks invalid typed dates without changing the selected day', () => {
  change('text', 'incomplete');
  expect(onChange).not.toHaveBeenCalled();
  expect(input('text')['aria-invalid']).toBe(true);
});