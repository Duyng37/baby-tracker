import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let stop: (() => void) | undefined;
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T09:00:00Z')); });
afterEach(() => { stop?.(); stop = undefined; vi.unstubAllGlobals(); vi.useRealTimers(); });

async function setup({ standalone = false, iosStandalone = false, saved = null as string | null, blocked = false } = {}) {
  const values = new Map<string, string>();
  if (saved !== null) values.set('noi:install-remind-after', saved);
  const localStorage = {
    getItem: vi.fn((key: string) => { if (blocked) throw new Error('blocked'); return values.get(key) ?? null; }),
    setItem: vi.fn((key: string, value: string) => { if (blocked) throw new Error('blocked'); values.set(key, value); }),
  };
  const media = Object.assign(new EventTarget(), { matches: standalone });
  const win = Object.assign(new EventTarget(), { localStorage, matchMedia: vi.fn(() => media) });
  vi.stubGlobal('window', win);
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36', maxTouchPoints: 5, standalone: iosStandalone });
  const api = await import('./install');
  stop = api.startInstallTracking();
  const offer = (outcome: 'accepted' | 'dismissed' = 'accepted') => {
    const prompt = vi.fn().mockResolvedValue({ outcome });
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome }) });
    win.dispatchEvent(event);
    return { event, prompt };
  };
  return { api, win, media, localStorage, values, offer };
}

it('captures an early event before UI subscribes and never automatically opens the prompt', async () => {
  const { api, offer } = await setup();
  const { event, prompt } = offer();
  expect(event.defaultPrevented).toBe(true);
  expect(api.installSnapshot()).toMatchObject({ canPrompt: true, installed: false, platform: { kind: 'android' } });
  expect(prompt).not.toHaveBeenCalled();
  const listener = vi.fn(), unsubscribe = api.subscribeInstall(listener);
  api.postponeInstall(); expect(listener).toHaveBeenCalledOnce();
  unsubscribe(); api.postponeInstall(); expect(listener).toHaveBeenCalledOnce();
});
it('calls prompt synchronously, consumes it once and does not confuse acceptance with installation', async () => {
  const { api, offer, localStorage, win } = await setup();
  const { prompt } = offer();
  const result = api.promptInstall();
  expect(prompt).toHaveBeenCalledOnce(); // Before the first await, while click activation is available.
  expect(api.installSnapshot()).toMatchObject({ busy: true, canPrompt: false });
  expect(await api.promptInstall()).toBe('busy');
  expect(await result).toBe('accepted');
  expect(api.installSnapshot()).toMatchObject({ installed: false, busy: false });
  expect(localStorage.setItem).toHaveBeenCalledWith(api.installReminderKey, String(Date.now() + api.installReminderDelay));
  expect(await api.promptInstall()).toBe('unavailable');
  win.dispatchEvent(new Event('appinstalled'));
  expect(api.installSnapshot()).toMatchObject({ installed: true, canPrompt: false });
  expect(await api.promptInstall()).toBe('installed');
  const again = offer(); expect(again.event.defaultPrevented).toBe(false); expect(again.prompt).not.toHaveBeenCalled();
});
it('dismisses without claiming installation and accepts a fresh event later', async () => {
  const { api, offer } = await setup();
  offer('dismissed'); expect(await api.promptInstall()).toBe('dismissed');
  expect(api.installSnapshot()).toMatchObject({ installed: false, canPrompt: false, dismissedUntil: Date.now() + api.installReminderDelay });
  expect(await api.promptInstall()).toBe('unavailable');
  const next = offer(); expect(api.installSnapshot().canPrompt).toBe(true);
  expect(await api.promptInstall()).toBe('accepted'); expect(next.prompt).toHaveBeenCalledOnce();
});
it('supports browsers returning the outcome through userChoice', async () => {
  const { api, offer } = await setup();
  offer('dismissed').prompt.mockResolvedValueOnce(undefined);
  expect(await api.promptInstall()).toBe('dismissed');
});
it.each(['throw', 'reject', 'invalid'])('falls back safely after a %s without reusing the failed event', async failure => {
  const { api, offer } = await setup();
  const { prompt } = offer();
  if (failure === 'throw') prompt.mockImplementationOnce(() => { throw new Error('unavailable'); });
  else if (failure === 'reject') prompt.mockRejectedValueOnce(new Error('unavailable'));
  else prompt.mockResolvedValueOnce({ outcome: 'unknown' });
  expect(await api.promptInstall()).toBe('error');
  expect(api.installSnapshot()).toMatchObject({ busy: false, installed: false, canPrompt: false, dismissedUntil: 0 });
  expect(await api.promptInstall()).toBe('unavailable'); expect(prompt).toHaveBeenCalledOnce();
});
it('does not overwrite appinstalled while a prompt is pending', async () => {
  const { api, offer, win } = await setup();
  let finish!: (choice: { outcome: 'accepted' }) => void;
  offer().prompt.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const result = api.promptInstall();
  win.dispatchEvent(new Event('appinstalled')); finish({ outcome: 'accepted' });
  expect(await result).toBe('installed');
  expect(api.installSnapshot()).toMatchObject({ installed: true, busy: false, canPrompt: false });
});
it('uses help when no real install event is available, even for Chrome', async () => {
  const { api, win } = await setup();
  const invalid = new Event('beforeinstallprompt', { cancelable: true }); win.dispatchEvent(invalid);
  expect(invalid.defaultPrevented).toBe(false);
  expect(await api.promptInstall()).toBe('unavailable');
});
it.each([{ standalone: true }, { iosStandalone: true }])('hides installation in an app window: %j', async options => {
  const { api, offer } = await setup(options);
  expect(api.installSnapshot().installed).toBe(true);
  expect(offer().event.defaultPrevented).toBe(false);
  expect(await api.promptInstall()).toBe('installed');
});
it.each(['change', 'pageshow', 'focus'])('refreshes standalone mode on %s and discards stale prompts', async event => {
  const { api, media, win, offer } = await setup(); offer();
  media.matches = true;
  (event === 'change' ? media : win).dispatchEvent(new Event(event));
  expect(api.installSnapshot()).toMatchObject({ installed: true, canPrompt: false });
});
it('persists only a reminder timestamp, restores it on reload and expires after seven days', async () => {
  const { api, win, localStorage } = await setup({ saved: String(Date.now() + 1000) });
  expect(api.installSnapshot().dismissedUntil).toBe(Date.now() + 1000);
  api.postponeInstall();
  expect(localStorage.setItem).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(api.installReminderDelay);
  win.dispatchEvent(new Event('focus'));
  expect(api.installSnapshot()).toMatchObject({ dismissedUntil: 0, installed: false });
});
it.each(['', 'invalid', 'Infinity', '-1', '0', String(Number.MAX_SAFE_INTEGER)])('ignores invalid/expired reminder %s', async saved => {
  const { api } = await setup({ saved }); expect(api.installSnapshot().dismissedUntil).toBe(0);
});
it('shares reminder changes across tabs without treating unrelated storage as installation', async () => {
  const { api, win, values } = await setup();
  values.set(api.installReminderKey, String(Date.now() + 1000));
  win.dispatchEvent(Object.assign(new Event('storage'), { key: 'unrelated' }));
  expect(api.installSnapshot().dismissedUntil).toBe(0);
  win.dispatchEvent(Object.assign(new Event('storage'), { key: api.installReminderKey }));
  expect(api.installSnapshot().dismissedUntil).toBe(Date.now() + 1000);
  values.clear(); win.dispatchEvent(Object.assign(new Event('storage'), { key: null }));
  expect(api.installSnapshot()).toMatchObject({ dismissedUntil: 0, installed: false });
});
it('retains the in-memory reminder even when localStorage is blocked', async () => {
  const { api, win, offer } = await setup({ blocked: true });
  api.postponeInstall(); win.dispatchEvent(new Event('focus'));
  expect(api.installSnapshot().dismissedUntil).toBe(Date.now() + api.installReminderDelay);
  offer(); expect(await api.promptInstall()).toBe('accepted');
});
it('starts once and removes all listeners on disposal', async () => {
  const { api, win, media, offer } = await setup();
  expect(api.startInstallTracking()).toBe(stop);
  const listener = vi.fn(); api.subscribeInstall(listener); stop!();
  expect(offer().event.defaultPrevented).toBe(false);
  win.dispatchEvent(new Event('appinstalled')); win.dispatchEvent(new Event('focus'));
  win.dispatchEvent(new Event('pageshow')); win.dispatchEvent(Object.assign(new Event('storage'), { key: null }));
  media.matches = true; media.dispatchEvent(new Event('change'));
  expect(listener).not.toHaveBeenCalled();
});