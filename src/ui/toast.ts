export const toastDuration = 3_000;

export function scheduleToastDismiss(onDismiss: () => void) {
  return setTimeout(onDismiss, toastDuration);
}