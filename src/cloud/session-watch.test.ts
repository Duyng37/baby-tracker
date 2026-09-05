import { afterEach, expect, it, vi } from 'vitest';
import { watchSession } from './session-watch';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(stop => stop()); vi.useRealTimers(); });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(read: () => Promise<string | null>) {
  const onState = vi.fn(); const events = new EventTarget(); const foreground = new EventTarget(); const network = new EventTarget();
  const stop = watchSession(onState, read, events, foreground, network); cleanups.push(stop);
  return { onState, events, foreground, network, stop };
}
it('restores on boot, foreground and reconnect without Google', async () => {
  const read = vi.fn().mockResolvedValue('account-a'); const app = setup(read); await tick();
  expect(app.onState).toHaveBeenLastCalledWith({ userId: 'account-a', message: '' });
  app.foreground.dispatchEvent(new Event('visibilitychange')); await tick();
  app.network.dispatchEvent(new Event('online')); await tick(); expect(read).toHaveBeenCalledTimes(3);
});
it('ignores an old session response that arrives after logout', async () => {
  let resolve!: (value: string) => void;
  const app = setup(() => new Promise(done => { resolve = done; }));
  app.events.dispatchEvent(new Event('signed-out')); resolve('account-a'); await tick();
  expect(app.onState).toHaveBeenCalledExactlyOnceWith({ userId: null, message: '' });
});
it('out-of-order responses cannot reopen a previously selected account', async () => {
  const replies: ((value: string) => void)[] = [];
  const app = setup(() => new Promise(done => replies.push(done)));
  app.events.dispatchEvent(new Event('recheck')); replies[1]('account-b'); await tick();
  replies[0]('account-a'); await tick();
  expect(app.onState).toHaveBeenCalledExactlyOnceWith({ userId: 'account-b', message: '' });
});
it('network failures preserve the mounted account, and unmount stops listeners', async () => {
  const read = vi.fn().mockRejectedValue(new Error('offline')); const app = setup(read); await tick();
  expect(app.onState.mock.calls[0][0].userId).toBeUndefined(); expect(app.onState.mock.calls[0][0].message).toBeTruthy();
  app.stop(); app.events.dispatchEvent(new Event('recheck')); expect(read).toHaveBeenCalledOnce();
});
it('retries a refresh lease conflict without asking for another Google login', async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockRejectedValueOnce(new Error('retry')).mockResolvedValue('account-a');
  const app = setup(read); await vi.advanceTimersByTimeAsync(0);
  expect(app.onState.mock.calls[0][0].userId).toBeUndefined();
  await vi.advanceTimersByTimeAsync(2_000);
  expect(app.onState).toHaveBeenLastCalledWith({ userId: 'account-a', message: '' });
});