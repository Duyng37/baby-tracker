import { afterEach, expect, it, vi } from 'vitest';
import { deviceMemory, watchDeviceSession } from './device-access';

const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const stops: (() => void)[] = [];
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.useRealTimers(); });
function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(read: () => Promise<string | null>, initial: string | null = null) {
  const port = storage(), memory = deviceMemory('test.supabase.co', () => port);
  memory.remember(initial);
  const onState = vi.fn(), events = new EventTarget(), foreground = new EventTarget(), network = new EventTarget();
  const stop = watchDeviceSession(onState, memory, read, events, foreground, network); stops.push(stop);
  return { memory, port, onState, events, foreground, network };
}
it('stores only a project-bound account hint, not a credential', () => {
  const port = storage(), memory = deviceMemory('one.supabase.co', () => port);
  memory.remember(user);
  expect(memory.read()).toBe(user);
  expect(Object.keys(JSON.parse(port.getItem(memory.key)!)).sort()).toEqual(['userId', 'verifiedAt', 'version']);
  expect(deviceMemory('two.supabase.co', () => port).read()).toBeNull();
  memory.remember(null); expect(memory.read()).toBeNull();
});
it('rejects malformed hints, stale hints and timestamps far in the future', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T00:00:00Z'));
  const port = storage(), memory = deviceMemory('test.supabase.co', () => port);
  for (const value of ['not json', JSON.stringify({ version: 1, userId: 'not-uuid', verifiedAt: Date.now() }),
    JSON.stringify({ version: 1, userId: user, verifiedAt: Date.now() - 31 * 86_400_000 }),
    JSON.stringify({ version: 1, userId: user, verifiedAt: Date.now() + 600_000 })]) {
    port.setItem(memory.key, value); expect(memory.read()).toBeNull();
  }
});
it('survives blocked storage without affecting online login', async () => {
  const memory = deviceMemory('test.supabase.co', () => { throw new Error('blocked'); });
  expect(memory.read()).toBeNull(); expect(() => memory.remember(user)).not.toThrow();
  const onState = vi.fn(); stops.push(watchDeviceSession(onState, memory, async () => user, new EventTarget(), new EventTarget(), new EventTarget()));
  await tick(); expect(onState).toHaveBeenLastCalledWith({ userId: user, message: '', localOnly: false, candidate: null });
});
it('offers a local candidate on cold-start failure, without authenticating it', async () => {
  const app = setup(async () => { throw new Error('offline'); }, user); await tick();
  expect(app.onState).toHaveBeenLastCalledWith({ message: expect.any(String), localOnly: true, candidate: user });
  expect(app.onState.mock.calls[0][0].userId).toBeUndefined();
});
it('never offers a first-use account while offline', async () => {
  const app = setup(async () => { throw new Error('offline'); }); await tick();
  expect(app.onState.mock.calls[0][0].candidate).toBeNull();
});
it('confirmed anonymous responses and explicit logout clear the offline hint', async () => {
  const app = setup(async () => null, user); await tick(); expect(app.memory.read()).toBeNull();
  app.memory.remember(user); app.events.dispatchEvent(new Event('signed-out'));
  expect(app.memory.read()).toBeNull();
  expect(app.onState).toHaveBeenLastCalledWith({ userId: null, message: '', localOnly: false, candidate: null });
});
it('reconnect authenticates the returned account, not the cached candidate', async () => {
  const read = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(other);
  const app = setup(read, user); await tick(); app.network.dispatchEvent(new Event('online')); await tick();
  expect(app.memory.read()).toBe(other);
  expect(app.onState).toHaveBeenLastCalledWith({ userId: other, message: '', localOnly: false, candidate: null });
});
it('cross-tab logout hides local data and invalidates an older in-flight response', async () => {
  const replies: ((id: string | null) => void)[] = [];
  const app = setup(() => new Promise(resolve => replies.push(resolve)), user);
  app.memory.remember(null);
  app.network.dispatchEvent(Object.assign(new Event('storage'), { key: app.memory.key }));
  expect(app.onState.mock.calls[0][0].userId).toBeNull();
  replies[0](user); replies[1](null); await tick();
  expect(app.memory.read()).toBeNull();
  expect(app.onState.mock.calls.some(([state]) => state.userId === user)).toBe(false);
});
it('same-account hint refreshes do not create cross-tab recheck loops', async () => {
  const read = vi.fn().mockResolvedValue(user), app = setup(read); await tick();
  app.network.dispatchEvent(Object.assign(new Event('storage'), { key: app.memory.key }));
  expect(read).toHaveBeenCalledOnce();
});