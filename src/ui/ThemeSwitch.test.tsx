import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { ThemeProvider, themeKey } from './theme';
import { ThemeSwitch } from './ThemeSwitch';

afterEach(() => vi.unstubAllGlobals());
it.each(['light', 'dark'] as const)('renders a clearly labelled %s switch from the shared theme preference', theme => {
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => key === themeKey ? theme : null }, matchMedia: () => ({ matches: false }) });
  const html = renderToStaticMarkup(<ThemeProvider><ThemeSwitch /></ThemeProvider>);
  expect(html).toContain('role="switch"');
  expect(html).toContain(`aria-checked="${theme === 'dark'}"`);
  expect(html).toContain('aria-label="Chế độ ban đêm"');
  expect(html).toContain('aria-describedby=');
  expect(html).toContain(theme === 'dark' ? 'Đang bật' : 'Đang tắt');
  expect(html).toContain('class="switch-track" aria-hidden="true"');
  expect(html).not.toContain('chevron');
});
it('uses the system appearance when no explicit preference is saved', () => {
  vi.stubGlobal('window', { localStorage: { getItem: () => null }, matchMedia: () => ({ matches: true }) });
  expect(renderToStaticMarkup(<ThemeProvider><ThemeSwitch /></ThemeProvider>)).toContain('aria-checked="true"');
});