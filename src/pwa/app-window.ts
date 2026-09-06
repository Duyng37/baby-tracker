const appDisplayMode = '(display-mode: standalone), (display-mode: window-controls-overlay)';

// This is a UI gate, not authentication or proof that the app is installed elsewhere.
// Browser fullscreen, appinstalled events and persisted flags must not unlock a tab.
export function isAppWindow() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.(appDisplayMode).matches === true
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function subscribeAppWindow(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  const display = window.matchMedia?.(appDisplayMode);
  if (display?.addEventListener) display.addEventListener('change', listener);
  else display?.addListener?.(listener);
  window.addEventListener('pageshow', listener);
  window.addEventListener('focus', listener);
  return () => {
    if (display?.removeEventListener) display.removeEventListener('change', listener);
    else display?.removeListener?.(listener);
    window.removeEventListener('pageshow', listener);
    window.removeEventListener('focus', listener);
  };
}