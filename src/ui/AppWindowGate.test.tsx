import { readFileSync } from 'node:fs';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

// Callback/lifecycle harness, not a real-browser dialog test.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, effects: [] as (() => void | (() => void))[] }));
const mode = vi.hoisted(() => ({ app: false }));
vi.mock('../pwa/app-window', () => ({ isAppWindow: () => mode.app, subscribeAppWindow: () => () => {} }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useId: () => 'install-title',
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (value: unknown) => { hooks.slots[index] = value; }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useLayoutEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
}));
import { AppWindowGate, InstallReminder } from './AppWindowGate';

type Props = Record<string, unknown>;
let tree: ReactNode;
const onClose = vi.fn();
function elements(node: ReactNode = tree): ReactElement<Props>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Props>(child)
    ? [child, ...elements((child.props.children as ReactNode) ?? null)] : []);
}
function element(tag: string) { return elements().find(node => node.type === tag)!.props; }
function render() { hooks.cursor = 0; tree = InstallReminder({ onClose }); }
function mount() {
  render();
  const focus = vi.fn();
  const closeButton = { tabIndex: 0, matches: () => false, getClientRects: () => [{}], focus: vi.fn() };
  const dialog = {
    open: false, showModal: vi.fn(() => { dialog.open = true; }), close: vi.fn(() => { dialog.open = false; }),
    querySelectorAll: () => [closeButton], ownerDocument: { activeElement: closeButton },
  };
  (element('dialog').ref as { current: unknown }).current = dialog;
  (element('h1').ref as { current: unknown }).current = { focus };
  const cleanup = hooks.effects[0]() as () => void;
  return { dialog, focus, closeButton, cleanup };
}
beforeEach(() => { hooks.slots = []; hooks.cursor = 0; hooks.effects = []; mode.app = false; onClose.mockClear(); });

it('defers account mounting in a browser until the reminder is dismissed', () => {
  const child = vi.fn(() => <p>private journal</p>);
  const Child = child;
  const html = renderToStaticMarkup(<AppWindowGate><Child /></AppWindowGate>);
  expect(child).not.toHaveBeenCalled(); expect(html).not.toContain('private journal');
  expect(html).toContain('Thêm Nôi vào màn hình chính để mở nhanh hơn, không cần tìm lại trang web');
  expect(html).toContain('aria-modal="true"'); expect(html).toContain('aria-labelledby="install-title"');
  expect(html).toContain('aria-describedby="install-title-next"');
  expect(html).toContain('aria-label="Đóng hướng dẫn cài Nôi"'); expect(html).not.toContain('Để sau');
});
it('skips the reminder in app mode but shows it in a browser if not yet dismissed', () => {
  mode.app = true;
  expect(renderToStaticMarkup(<AppWindowGate><p>private journal</p></AppWindowGate>)).toBe('<p>private journal</p>');
  mode.app = false;
  expect(renderToStaticMarkup(<AppWindowGate><p>private journal</p></AppWindowGate>)).not.toContain('private journal');
});
it('allows browser use after dismissal and stays dismissed through normal re-renders', () => {
  const children = <p>private journal</p>;
  const gate = () => { hooks.cursor = 0; return AppWindowGate({ children }); };
  const reminder = gate() as ReactElement<{ onClose: () => void }>;
  expect(reminder.type).toBe(InstallReminder); reminder.props.onClose();
  expect(gate()).toBe(children); expect(gate()).toBe(children);
  mode.app = true; expect(gate()).toBe(children);
  mode.app = false; expect(gate()).toBe(children);
});
it('shows the reminder again on a fresh page mount rather than persisting dismissal', () => {
  const gate = () => { hooks.cursor = 0; return AppWindowGate({ children: <p>journal</p> }); };
  (gate() as ReactElement<{ onClose: () => void }>).props.onClose();
  expect(renderToStaticMarkup(gate())).toBe('<p>journal</p>');
  hooks.slots = []; // A reload/new tab creates fresh component state.
  expect((gate() as ReactElement).type).toBe(InstallReminder);
});
it('uses local GIF assets, reduced-motion fallback and instructions to open the app icon', () => {
  render();
  expect(element('img')).toMatchObject({ src: '/install-guide-v1.gif', width: '240', height: '490' });
  expect(element('source')).toMatchObject({ media: '(prefers-reduced-motion: reduce)', srcSet: '/install-guide-still-v1.gif' });
  expect(renderToStaticMarkup(tree)).toContain('hãy mở Nôi từ biểu tượng ứng dụng');
});
it('opens modally and focuses the title before paint', () => {
  const { dialog, focus, cleanup } = mount();
  expect(dialog.showModal).toHaveBeenCalledOnce(); expect(dialog.open).toBe(true);
  expect(focus).toHaveBeenCalledWith({ preventScroll: true }); cleanup();
});
it('dismisses with the accessible close button', () => {
  const { cleanup } = mount();
  expect(element('button')['aria-label']).toBe('Đóng hướng dẫn cài Nôi');
  (element('button').onClick as () => void)(); expect(onClose).toHaveBeenCalledOnce(); cleanup();
});
it('overlays the close button in the corner without reserving a full row above the title', () => {
  render();
  const content = Children.toArray(element('dialog').children as ReactNode)
    .filter((child): child is ReactElement<Props> => isValidElement<Props>(child));
  expect(content[0].type).toBe('button');
  expect(content[0].props.className).toContain('install-reminder-close');
  expect(content[1].type).toBe('h1');
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const closeRule = css.match(/\.install-reminder-close \{([^}]+)\}/)?.[1];
  expect(closeRule).toContain('position: absolute');
  expect(closeRule).toContain('top: 6px'); expect(closeRule).toContain('right: 6px');
  expect(closeRule).toContain('height: 44px');
  expect(css.match(/\.install-reminder \{([^}]+)\}/)?.[1]).toContain('padding: 40px 24px 24px');
});
it('dismisses on Escape/back cancel, leaving unmount to close the native dialog', () => {
  const { dialog, cleanup } = mount();
  const event = new Event('cancel', { cancelable: true });
  (element('dialog').onCancel as (event: Event) => void)(event);
  expect(event.defaultPrevented).toBe(true); expect(dialog.open).toBe(true);
  expect(onClose).toHaveBeenCalledOnce();
  expect(element('dialog').onClick).toBeUndefined(); expect(element('dialog').onPointerDown).toBeUndefined();
  expect(dialog.close).not.toHaveBeenCalled(); cleanup();
});
it.each([false, true])('keeps Tab on the close button at either focus boundary (shift: %s)', shiftKey => {
  const { dialog, closeButton, cleanup } = mount(); const preventDefault = vi.fn();
  (element('dialog').onKeyDown as (event: unknown) => void)({ key: 'Tab', shiftKey, currentTarget: dialog, preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce(); expect(closeButton.focus).toHaveBeenCalledOnce(); cleanup();
});
it('honors a native close without reopening and ignores cleanup/StrictMode close events', () => {
  const { dialog, cleanup } = mount();
  const closeEvent = () => (element('dialog').onClose as () => void)();
  closeEvent(); expect(onClose).not.toHaveBeenCalled();
  dialog.open = false; closeEvent(); expect(onClose).toHaveBeenCalledOnce();
  expect(dialog.showModal).toHaveBeenCalledTimes(1);
  cleanup(); closeEvent(); expect(onClose).toHaveBeenCalledOnce();
  const nextCleanup = hooks.effects[0]() as () => void;
  expect(dialog.open).toBe(true); expect(dialog.showModal).toHaveBeenCalledTimes(2);
  closeEvent(); expect(onClose).toHaveBeenCalledOnce();
  nextCleanup(); closeEvent(); expect(dialog.open).toBe(false);
  expect(onClose).toHaveBeenCalledOnce();
});
it('shows text instructions and still allows closing when the image cannot load', () => {
  const { dialog, cleanup } = mount();
  (element('img').onError as () => void)(); render();
  const html = renderToStaticMarkup(tree);
  expect(html).toContain('Chưa tải được hình hướng dẫn'); expect(html).toContain('Safari'); expect(html).toContain('Chrome/Edge');
  expect(html).toContain('role="alert"'); expect(html).not.toContain('<img'); expect(html).toContain('<button');
  expect(dialog.open).toBe(true);
  (element('button').onClick as () => void)(); expect(onClose).toHaveBeenCalledOnce(); cleanup();
});