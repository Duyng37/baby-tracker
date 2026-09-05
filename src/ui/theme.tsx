import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';
export const themeKey = 'noi:theme';
const mediaQuery = '(prefers-color-scheme: dark)';

export function readThemePreference(): Theme | null {
  try {
    const value = window.localStorage.getItem(themeKey);
    return value === 'light' || value === 'dark' ? value : null;
  } catch { return null; } // Storage may be unavailable in private/restricted contexts.
}

export function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.(mediaQuery).matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1d211e' : '#fafaf7');
}

export function saveThemePreference(theme: Theme) {
  try { window.localStorage.setItem(themeKey, theme); } catch { /* Theme still works without persistence. */ }
}

const ThemeContext = createContext({ theme: 'light' as Theme, toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(readThemePreference);
  const [system, setSystem] = useState(systemTheme);
  const theme = preference ?? system;

  useEffect(() => {
    const media = window.matchMedia?.(mediaQuery);
    const changed = () => setSystem(systemTheme());
    const stored = (event: StorageEvent) => {
      if (event.key === themeKey || event.key === null) setPreference(readThemePreference());
    };
    changed();
    media?.addEventListener('change', changed);
    window.addEventListener('storage', stored);
    return () => { media?.removeEventListener('change', changed); window.removeEventListener('storage', stored); };
  }, []);
  useEffect(() => applyTheme(theme), [theme]);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setPreference(next);
    saveThemePreference(next);
  }
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);