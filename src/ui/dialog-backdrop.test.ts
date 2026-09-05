import { expect, it } from 'vitest';
import { isDialogBackdrop } from './dialog-backdrop';

const dialog = { getBoundingClientRect: () => ({ left: 100, right: 500, top: 200, bottom: 800 }) } as HTMLDialogElement;
it.each([[99, 400], [501, 400], [300, 199], [300, 801]])('recognizes clicks outside the sheet at %s,%s', (clientX, clientY) => {
  expect(isDialogBackdrop({ target: dialog, currentTarget: dialog, clientX, clientY })).toBe(true);
});
it.each([[100, 200], [500, 800], [110, 210], [300, 400]])('does not dismiss clicks in the sheet or its padding at %s,%s', (clientX, clientY) => {
  expect(isDialogBackdrop({ target: dialog, currentTarget: dialog, clientX, clientY })).toBe(false);
});
it('never treats a click on sheet content as a backdrop click', () => {
  expect(isDialogBackdrop({ target: {} as EventTarget, currentTarget: dialog, clientX: 0, clientY: 0 })).toBe(false);
});