import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { scheduleToastDismiss, toastDuration } from './toast';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('dismisses a toast after its configured duration', () => {
  const dismiss = vi.fn();
  scheduleToastDismiss(dismiss);

  vi.advanceTimersByTime(toastDuration - 1);
  expect(dismiss).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(dismiss).toHaveBeenCalledOnce();
});