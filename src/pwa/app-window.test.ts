import { afterEach, expect, it, vi } from 'vitest';
import { isAppWindow, subscribeAppWindow } from './app-window';

afterEach(() => vi.unstubAllGlobals());

function setup(mode = 'browser', iosStandalone: unknown = false) {
  const display = Object.assign(new EventTarget(), { matches: false });
  const win = Object.assign(new EventTarget(), {
    navigator: { standalone: iosStandalone },
    matchMedia: vi.fn((query: string) => {
      display.matches = query.split(', ').includes(`(display-mode: ${mode})`);
      return display;
    }),
  });
  vi.stubGlobal('window', win);
  return { win, display, setMode: (next: string) => { mode = next; } };
}

it.each(['standalone', 'window-controls-overlay'])('allows the %s app display mode', mode => {
  setup(mode); expect(isAppWindow()).toBe(true);
});
it.each(['browser', 'fullscreen', 'minimal-ui'])('does not treat %s as an app window', mode => {
  setup(mode); expect(isAppWindow()).toBe(false);
});
it('recognizes iOS standalone even without matchMedia', () => {
  vi.stubGlobal('window', { navigator: { standalone: true } });
  expect(isAppWindow()).toBe(true);
});
it.each([false, undefined, 'true'])('rejects non-true iOS standalone: %s', value => {
  setup('browser', value); expect(isAppWindow()).toBe(false);
});
it('safely stays blocked without a window or media API', () => {
  vi.stubGlobal('window', undefined);
  expect(isAppWindow()).toBe(false); expect(subscribeAppWindow(vi.fn())).toBeTypeOf('function');
  vi.stubGlobal('window', Object.assign(new EventTarget(), { navigator: {} }));
  expect(isAppWindow()).toBe(false); subscribeAppWindow(vi.fn())();
});
it('does not unlock on appinstalled, storage flags or installation acceptance', () => {
  const { win } = setup();
  const storageRead = vi.fn(() => 'true');
  Object.assign(win, { localStorage: { getItem: storageRead } });
  const listener = vi.fn(), stop = subscribeAppWindow(listener);
  for (const name of ['appinstalled', 'beforeinstallprompt', 'storage']) win.dispatchEvent(new Event(name));
  expect(listener).not.toHaveBeenCalled(); expect(storageRead).not.toHaveBeenCalled();
  expect(isAppWindow()).toBe(false); stop();
});
it.each(['change', 'pageshow', 'focus'])('refreshes on %s and unsubscribes completely', name => {
  const { win, display, setMode } = setup();
  const snapshots: boolean[] = [], stop = subscribeAppWindow(() => snapshots.push(isAppWindow()));
  const target = name === 'change' ? display : win;
  setMode('standalone'); target.dispatchEvent(new Event(name));
  setMode('browser'); target.dispatchEvent(new Event(name));
  expect(snapshots).toEqual([true, false]);
  stop(); target.dispatchEvent(new Event(name)); expect(snapshots).toHaveLength(2);
});
it('supports the older Safari media listener API and removes the same callback', () => {
  const media = { matches: false, addListener: vi.fn(), removeListener: vi.fn() };
  vi.stubGlobal('window', Object.assign(new EventTarget(), { navigator: {}, matchMedia: () => media }));
  const listener = vi.fn(), stop = subscribeAppWindow(listener);
  expect(media.addListener).toHaveBeenCalledWith(listener);
  stop(); expect(media.removeListener).toHaveBeenCalledWith(listener);
});