import { detectInstallPlatform, type InstallPlatform } from './install-platform';

type InstallChoice = { outcome: 'accepted' | 'dismissed' };
interface InstallPromptEvent extends Event {
  prompt(): Promise<InstallChoice | void>;
  userChoice: Promise<InstallChoice>;
}
export type InstallState = {
  platform: InstallPlatform; installed: boolean; canPrompt: boolean; busy: boolean; dismissedUntil: number;
};
export const installReminderKey = 'noi:install-remind-after';
export const installReminderDelay = 7 * 86_400_000;
let state: InstallState = { platform: detectInstallPlatform(''), installed: false, canPrompt: false, busy: false, dismissedUntil: 0 };
let deferred: InstallPromptEvent | null = null;
let stopTracking: (() => void) | undefined;
const listeners = new Set<() => void>();
export function installSnapshot() { return state; }
export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(next: Partial<InstallState>) {
  state = { ...state, ...next };
  listeners.forEach(listener => listener());
}
function readReminder() {
  try {
    const value = Number(window.localStorage.getItem(installReminderKey));
    return Number.isFinite(value) && value > Date.now() && value <= Date.now() + installReminderDelay ? value : 0;
  } catch { return null; } // Storage can be blocked; keep the in-memory preference.
}
export function postponeInstall() {
  const dismissedUntil = Date.now() + installReminderDelay;
  try { window.localStorage.setItem(installReminderKey, String(dismissedUntil)); } catch { /* Optional preference only. */ }
  publish({ dismissedUntil });
}

// Start before React/auth/lazy Account loading, not inside a component effect.
export function startInstallTracking() {
  if (stopTracking) return stopTracking;
  if (typeof window === 'undefined') return () => {};
  const display = window.matchMedia?.('(display-mode: standalone), (display-mode: window-controls-overlay)');
  const standalone = () => !!display?.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const refresh = () => {
    const installed = state.installed || standalone();
    if (installed) deferred = null;
    publish({ installed, canPrompt: !!deferred && !installed, dismissedUntil: readReminder() ?? state.dismissedUntil });
  };
  const beforeInstall = (event: Event) => {
    if (typeof (event as InstallPromptEvent).prompt !== 'function' || state.installed) return;
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    publish({ canPrompt: true });
  };
  const installed = () => {
    deferred = null;
    publish({ installed: true, canPrompt: false });
  };
  const storage = (event: StorageEvent) => { if (event.key === installReminderKey || event.key === null) refresh(); };
  publish({ platform: detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints) });
  refresh();
  window.addEventListener('beforeinstallprompt', beforeInstall);
  window.addEventListener('appinstalled', installed);
  window.addEventListener('pageshow', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('storage', storage);
  if (display?.addEventListener) display.addEventListener('change', refresh);
  else display?.addListener?.(refresh);
  stopTracking = () => {
    window.removeEventListener('beforeinstallprompt', beforeInstall);
    window.removeEventListener('appinstalled', installed);
    window.removeEventListener('pageshow', refresh);
    window.removeEventListener('focus', refresh);
    window.removeEventListener('storage', storage);
    if (display?.removeEventListener) display.removeEventListener('change', refresh);
    else display?.removeListener?.(refresh);
    deferred = null; stopTracking = undefined;
  };
  return stopTracking;
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable' | 'error' | 'busy' | 'installed'> {
  if (state.installed) return 'installed';
  if (state.busy) return 'busy';
  const event = deferred;
  if (!event) return 'unavailable';
  // An event is single-use. Consume it before awaiting; call prompt in the click's user activation.
  deferred = null;
  publish({ busy: true, canPrompt: false });
  try {
    const choice = await event.prompt() ?? await event.userChoice;
    if (state.installed) return 'installed';
    if (choice?.outcome !== 'accepted' && choice?.outcome !== 'dismissed') return 'error';
    postponeInstall();
    // Acceptance is not proof of completed installation. Only appinstalled/standalone hide settings.
    return choice.outcome;
  } catch { return state.installed ? 'installed' : 'error'; }
  finally { publish({ busy: false }); }
}