import { Children, isValidElement, type ChangeEvent, type FocusEvent, type KeyboardEvent, type ReactElement, type ReactNode, type RefObject } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

// Callback/state contracts only; these checks do not replace a browser layout test.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useId: () => 'journal-date',
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
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
const field = { value: '', setCustomValidity: vi.fn(), reportValidity: vi.fn() };
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as ReactNode)] : []);
}
const input = (type: string) => elements(tree).find(node => node.type === 'input' && node.props.type === type)!.props;
function render() {
  hooks.cursor = 0;
  tree = JournalDateInput({ value, onChange });
  (input('text').ref as RefObject<unknown>).current = field;
}
function change(type: string, next: string) {
  field.value = next;
  (input(type).onChange as (event: ChangeEvent<HTMLInputElement>) => void)({ currentTarget: field } as unknown as ChangeEvent<HTMLInputElement>);
  render();
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
it('renders a labelled fixed-format text field and a separate accessible native calendar', () => {
  expect(input('text').value).toBe('05/09/2026');
  expect(input('text').placeholder).toBe('dd/mm/yyyy');
  expect(input('date').value).toBe('2026-09-05');
  expect(input('date')['aria-label']).toBe('Chọn ngày xem nhật ký');
  expect(renderToStaticMarkup(tree)).toContain('<label for="journal-date">Ngày</label>');
});
it('converts a typed date to ISO before updating the filter', () => {
  change('text', '04/09/2026');
  expect(onChange).toHaveBeenCalledWith('2026-09-04');
  expect(input('text').value).toBe('04/09/2026');
  expect(input('date').value).toBe('2026-09-04');
});
it('keeps an incomplete draft without changing the current journal filter', () => {
  change('text', '04/09/');
  expect(onChange).not.toHaveBeenCalled();
  expect(input('text').value).toBe('04/09/');
  expect(input('date').value).toBe('2026-09-05');
});
it('reports invalid dates on blur and lets Escape restore the last selected day', () => {
  change('text', '31/02/2026');
  (input('text').onBlur as (event: FocusEvent<HTMLInputElement>) => void)({ currentTarget: field } as unknown as FocusEvent<HTMLInputElement>);
  render();
  expect(onChange).not.toHaveBeenCalled();
  expect(input('text')['aria-invalid']).toBe(true);
  expect(field.reportValidity).toHaveBeenCalledOnce();
  (input('text').onKeyDown as (event: KeyboardEvent<HTMLInputElement>) => void)({ key: 'Escape', currentTarget: field } as unknown as KeyboardEvent<HTMLInputElement>);
  render();
  expect(input('text').value).toBe('05/09/2026');
  expect(input('text')['aria-invalid']).toBe(false);
  expect(field.setCustomValidity).toHaveBeenLastCalledWith('');
});
it('replaces a draft with the native calendar selection, including the same date', () => {
  change('text', 'bad');
  change('date', '2026-09-05');
  expect(input('text').value).toBe('05/09/2026');
  expect(field.setCustomValidity).toHaveBeenLastCalledWith('');
  change('date', '2026-12-31');
  expect(input('text').value).toBe('31/12/2026');
  expect(onChange).toHaveBeenLastCalledWith('2026-12-31');
});
it('ignores an empty calendar selection and reflects external day changes', () => {
  change('date', '');
  expect(onChange).not.toHaveBeenCalled();
  change('text', 'incomplete');
  value = '2026-09-06'; render();
  expect(input('text').value).toBe('06/09/2026');
});