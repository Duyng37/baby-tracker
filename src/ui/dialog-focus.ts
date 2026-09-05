type TabEvent = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'preventDefault'>;

/** Keep Tab at the boundaries inside the sheet, including its initial heading focus. */
export function trapDialogTab(dialog: HTMLDialogElement, event: TabEvent) {
  if (event.key !== 'Tab') return;
  const controls = [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
    .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
  const active = dialog.ownerDocument.activeElement;
  const first = controls[0];
  const last = controls.at(-1);
  if (!first) { event.preventDefault(); return; }
  if (event.shiftKey && (active === first || !controls.some(control => control === active))) {
    event.preventDefault(); last?.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault(); first.focus();
  }
}