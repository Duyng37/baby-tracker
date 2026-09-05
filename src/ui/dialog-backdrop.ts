type Pointer = { target: EventTarget | null; currentTarget: HTMLDialogElement; clientX: number; clientY: number };

export function isDialogBackdrop(event: Pointer) {
  if (event.target !== event.currentTarget) return false;
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
}