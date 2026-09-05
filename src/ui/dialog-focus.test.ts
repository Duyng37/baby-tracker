import { describe, expect, it, vi } from 'vitest';
import { trapDialogTab } from './dialog-focus';

function fixture(active: number, options: { hidden?: number; disabled?: number } = {}) {
  const controls = [0, 1, 2].map(index => ({ tabIndex: 0, focus: vi.fn(),
    matches: () => options.disabled === index,
    getClientRects: () => options.hidden === index ? [] : [{}] }));
  const dialog = { querySelectorAll: () => controls, ownerDocument: { activeElement: controls[active] ?? {} } } as unknown as HTMLDialogElement;
  const event = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() };
  return { controls, dialog, event };
}

describe('sheet keyboard focus boundaries', () => {
  it('wraps Tab from the last control to the first', () => {
    const { controls, dialog, event } = fixture(2);
    trapDialogTab(dialog, event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(controls[0].focus).toHaveBeenCalledOnce();
  });
  it.each([0, -1])('wraps Shift+Tab from first control/heading (%s) to the last', active => {
    const { controls, dialog, event } = fixture(active);
    event.shiftKey = true;
    trapDialogTab(dialog, event);
    expect(controls[2].focus).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
  it('does not interfere with normal Tab or other keys', () => {
    const { controls, dialog, event } = fixture(1);
    trapDialogTab(dialog, event);
    event.key = 'Enter'; trapDialogTab(dialog, event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(controls.every(control => control.focus.mock.calls.length === 0)).toBe(true);
  });
  it('skips disabled controls at the start of the sheet', () => {
    const { controls, dialog, event } = fixture(2, { disabled: 0 });
    trapDialogTab(dialog, event);
    expect(controls[1].focus).toHaveBeenCalledOnce();
    expect(controls[0].focus).not.toHaveBeenCalled();
  });
  it('skips hidden controls at the end of the sheet', () => {
    const { controls, dialog, event } = fixture(0, { hidden: 2 });
    event.shiftKey = true; trapDialogTab(dialog, event);
    expect(controls[1].focus).toHaveBeenCalledOnce();
    expect(controls[2].focus).not.toHaveBeenCalled();
  });
});