import { Children, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DeviceSessionState } from '../cloud/device-access';

const harness = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0, effects: [] as (() => void)[],
  session: undefined as undefined | ((state: DeviceSessionState) => void),
  account: vi.fn(),
}));
// Drive the real App session callback and gate, substituting only the account's data side effects.
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = initial;
    return [harness.slots[index], (value: unknown) => { harness.slots[index] = value; }];
  },
  useEffect: (effect: () => void) => { harness.effects.push(effect); },
  lazy: () => (props: unknown) => { harness.account(props); return <p>account journal</p>; },
}));
vi.mock('../cloud/supabase', () => ({ configured: true, projectId: 'test-project', signIn: vi.fn(), authEvents: new EventTarget() }));
vi.mock('../cloud/device-access', () => ({
  deviceMemory: vi.fn(), watchDeviceSession: (callback: (state: DeviceSessionState) => void) => { harness.session = callback; },
}));
vi.mock('./theme', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }));
vi.mock('./invitation-link', () => ({ capturePendingInvitation: vi.fn() }));
import { App } from '../App';
import { AppWindowGate, InstallReminder } from './AppWindowGate';

let standalone = false;
let tree: ReactNode;
function render() {
  harness.cursor = 0; tree = App();
  if (isValidElement<{ children: ReactNode }>(tree) && tree.type === AppWindowGate) tree = AppWindowGate(tree.props);
  return renderToStaticMarkup(tree);
}
function dismissReminder() {
  expect(isValidElement(tree) && tree.type).toBe(InstallReminder);
  if (isValidElement<{ onClose: () => void }>(tree)) tree.props.onClose();
  return render();
}
function session(state: Partial<DeviceSessionState>) {
  harness.session!({ message: '', localOnly: false, candidate: null, ...state });
  return render();
}
function clickLocalAccount(node: ReactNode = tree): boolean {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child)) continue;
    if (child.type === 'button' && child.props.children === 'Mở nhật ký trên thiết bị') {
      child.props.onClick!(); return true;
    }
    if (clickLocalAccount(child.props.children ?? null)) return true;
  }
  return false;
}
function openPage() {
  harness.slots = []; harness.cursor = 0; harness.effects = []; harness.session = undefined; harness.account.mockClear();
  standalone = false;
  vi.stubGlobal('window', {
    navigator: {}, matchMedia: () => ({ matches: standalone }),
    location: { href: 'https://example.test/', search: '', hash: '', pathname: '/' },
  });
  render(); harness.effects[0]();
}
beforeEach(openPage);
afterEach(() => vi.unstubAllGlobals());

it('does not show the installation gate during session restore or on the login screen', () => {
  const loading = render();
  expect(loading).toContain('Đang mở nhật ký'); expect(loading).not.toContain('install-reminder');
  const login = session({ userId: null });
  expect(login).toContain('Tiếp tục với Google'); expect(login).not.toContain('install-reminder');
  expect(harness.account).not.toHaveBeenCalled();
});
it('shows the reminder after browser login and permits Account after dismissal without prompting again on session refresh', () => {
  session({ userId: null });
  const html = session({ userId: 'test-user' });
  expect(html).toContain('install-reminder'); expect(html).not.toContain('account journal');
  expect(html).not.toContain('Tiếp tục với Google'); expect(harness.account).not.toHaveBeenCalled();
  expect(session({ userId: 'test-user' })).toContain('install-reminder');
  expect(harness.account).not.toHaveBeenCalled();
  expect(dismissReminder()).toContain('account journal');
  expect(harness.account).toHaveBeenCalledWith({ userId: 'test-user', localOnly: false });
  expect(session({ userId: 'test-user' })).not.toContain('install-reminder');
});
it('shows the reminder on the next page load even when restoring the same signed-in account', () => {
  session({ userId: 'test-user' }); dismissReminder();
  openPage();
  expect(session({ userId: 'test-user' })).toContain('install-reminder');
  expect(harness.account).not.toHaveBeenCalled();
});
it('allows the signed-in account in standalone mode, but still requires authentication', () => {
  standalone = true;
  expect(session({ userId: null })).toContain('Tiếp tục với Google');
  expect(harness.account).not.toHaveBeenCalled();
  const html = session({ userId: 'test-user' });
  expect(html).toContain('account journal'); expect(html).not.toContain('install-reminder');
  expect(harness.account).toHaveBeenCalledWith({ userId: 'test-user', localOnly: false });
});
it.each([false, true])('also allows local-only access, dismissing the reminder in browser mode (standalone: %s)', appMode => {
  standalone = appMode;
  expect(session({ localOnly: true, candidate: 'test-user' })).toContain('Mở nhật ký trên thiết bị');
  expect(harness.account).not.toHaveBeenCalled(); expect(clickLocalAccount()).toBe(true);
  const html = render();
  if (appMode) {
    expect(html).toContain('account journal');
    expect(harness.account).toHaveBeenCalledWith({ userId: 'test-user', localOnly: true });
  } else {
    expect(html).toContain('install-reminder'); expect(harness.account).not.toHaveBeenCalled();
    expect(dismissReminder()).toContain('account journal');
    expect(harness.account).toHaveBeenCalledWith({ userId: 'test-user', localOnly: true });
  }
});
it('returns to login when a gated browser session is signed out elsewhere', () => {
  expect(session({ userId: 'test-user' })).toContain('install-reminder');
  const html = session({ userId: null });
  expect(html).toContain('Tiếp tục với Google'); expect(html).not.toContain('install-reminder');
  expect(harness.account).not.toHaveBeenCalled();
});