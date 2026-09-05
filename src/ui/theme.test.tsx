import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, readThemePreference, saveThemePreference, systemTheme, ThemeProvider, themeKey, useTheme } from './theme';

afterEach(() => vi.unstubAllGlobals());

function browser(preference: string | null = null, dark = false) {
  const localStorage = { getItem: vi.fn(() => preference), setItem: vi.fn() };
  vi.stubGlobal('window', { localStorage, matchMedia: vi.fn(() => ({ matches: dark })) });
  return localStorage;
}
function Probe() { const { theme } = useTheme(); return <span>{theme}</span>; }

describe('device-wide appearance', () => {
  it.each(['light', 'dark'] as const)('restores the explicit %s preference', theme => {
    const storage = browser(theme, theme !== 'dark');
    expect(readThemePreference()).toBe(theme);
    expect(storage.getItem).toHaveBeenCalledWith(themeKey);
    expect(renderToStaticMarkup(<ThemeProvider><Probe /></ThemeProvider>)).toContain(theme);
  });
  it.each([null, '', 'invalid'])('ignores invalid preference %s and follows system appearance', value => {
    browser(value, true);
    expect(readThemePreference()).toBeNull();
    expect(systemTheme()).toBe('dark');
    expect(renderToStaticMarkup(<ThemeProvider><Probe /></ThemeProvider>)).toContain('dark');
  });
  it('has a safe light fallback during server rendering', () => {
    expect(readThemePreference()).toBeNull();
    expect(systemTheme()).toBe('light');
  });
  it('survives denied localStorage access and missing matchMedia', () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('blocked'); } });
    expect(readThemePreference()).toBeNull();
    expect(systemTheme()).toBe('light');
    expect(() => saveThemePreference('dark')).not.toThrow();
  });
  it('persists only the non-sensitive theme preference', () => {
    const storage = browser();
    saveThemePreference('dark');
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(themeKey, 'dark');
  });
  it.each([['dark', '#1d211e'], ['light', '#fafaf7']] as const)('applies %s to the whole document and native browser chrome', (theme, color) => {
    const dataset: Record<string, string> = {};
    const setAttribute = vi.fn();
    vi.stubGlobal('document', { documentElement: { dataset }, querySelector: vi.fn(() => ({ setAttribute })) });
    applyTheme(theme);
    expect(dataset.theme).toBe(theme);
    expect(setAttribute).toHaveBeenCalledWith('content', color);
  });
  it('still applies the theme if the theme-color meta tag is absent', () => {
    const dataset: Record<string, string> = {};
    vi.stubGlobal('document', { documentElement: { dataset }, querySelector: () => null });
    expect(() => applyTheme('dark')).not.toThrow();
    expect(dataset.theme).toBe('dark');
  });
});