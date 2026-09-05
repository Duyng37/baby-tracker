import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Contract checks, not a browser/layout test. Prevent the old hard-coded light surfaces returning.
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const lightBlock = css.match(/:root \{([^}]+)\}/)![1];
const darkBlock = css.match(/:root\[data-theme="dark"\] \{([^}]+)\}/)![1];
function tokens(block: string) { return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]+)/g)].map(m => [m[1], m[2]])); }
function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map(part => {
    const value = parseInt(part, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}

describe.each([['light', tokens(lightBlock)], ['dark', tokens(darkBlock)]] as const)('%s theme tokens', (_, palette) => {
  it('defines the same complete palette in each theme', () => {
    expect(Object.keys(palette).sort()).toEqual(Object.keys(tokens(lightBlock)).sort());
  });
  it.each([
    ['ink', 'canvas'], ['ink', 'surface'], ['secondary', 'canvas'], ['secondary', 'surface'],
    ['secondary', 'tint'], ['secondary', 'subtle'], ['soft-ink', 'tint'],
    ['primary-ink', 'primary'], ['primary-ink', 'primary-hover'],
    ['warning-ink', 'warning-bg'], ['danger', 'danger-bg'], ['toast-ink', 'toast-bg'], ['toast-action', 'toast-bg'],
  ])('%s on %s meets 4.5:1 text contrast', (foreground, background) => {
    expect(contrast(palette[foreground], palette[background])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(['canvas', 'surface', 'tint'])('keyboard focus on %s meets 3:1 contrast', background => {
    expect(contrast(palette.focus, palette[background])).toBeGreaterThanOrEqual(3);
  });
});

it('uses theme tokens rather than hard-coded colors in components', () => {
  const components = css.replace(lightBlock, '').replace(darkBlock, '');
  expect(components).not.toMatch(/#[\da-f]{3,8}\b/i);
  const declared = new Set([...css.matchAll(/--([\w-]+):/g)].map(m => m[1]));
  for (const reference of css.matchAll(/var\(--([\w-]+)/g)) expect(declared.has(reference[1]), reference[1]).toBe(true);
});
it('keeps focus visible for keyboards and forced colors, with calmer field focus', () => {
  expect(css).toContain(':where(button, a):focus-visible { outline: 2px solid var(--focus)');
  expect(css).toContain(':where(input, select, textarea):focus { outline: none; border-color: var(--focus); box-shadow: 0 0 0 3px var(--focus-halo)');
  expect(css).toContain('@media (forced-colors: active)');
  expect(css).toContain('outline: 2px solid Highlight');
});
it('avoids fixed footer offsets and retains short-screen, safe-area and reduced-motion support', () => {
  const footer = css.match(/\.footer \{([^}]+)\}/)![1];
  expect(footer).not.toContain('position: fixed');
  expect(css).toContain('min-height: 0; overflow-y: auto');
  expect(css).toContain('@media (max-height: 500px)');
  expect(css).toContain('env(safe-area-inset-bottom)');
  expect(css).toContain('@media (prefers-reduced-motion: no-preference)');
  expect(css).toContain('font-size: 16px'); // Avoid iOS zoom on form fields.
});
it('wraps long baby names in summary headings instead of widening the scroll area', () => {
  expect(css).toContain('.section-heading > small { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }');
});
it('keeps PWA launch colors and initial browser chrome aligned with the light canvas', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf8'));
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const canvas = tokens(lightBlock).canvas;
  expect(manifest.background_color).toBe(canvas);
  expect(manifest.theme_color).toBe(canvas);
  expect(html).toContain(`<meta name="theme-color" content="${canvas}"`);
});
it('keeps icon-only quick actions and their expand control in one row', () => {
  expect(css).toContain('.quick-recording[data-collapsed="true"] .quick-heading { display: none; }');
  expect(css).toMatch(/\.quick-recording\[data-collapsed="true"\] \.quick-actions \{[^}]*grid-row: 1;[^}]*repeat\(4, minmax\(0, 1fr\)\)/);
  expect(css).toContain('.quick-toggle { grid-column: 2; grid-row: 1; }');
  expect(css).not.toContain('.quick-toggle { display: none');
  expect(css).not.toContain('.footer--compact');
});
it('shows a fixed-size theme switch with distinct on/off positions and forced-color support', () => {
  expect(css).toMatch(/\.theme-setting > \.switch-track \{[^}]*flex: 0 0 44px;[^}]*height: 26px/);
  expect(css).toContain('.theme-setting[aria-checked="true"] .switch-thumb { transform: translateX(18px)');
  expect(css).toContain('.switch-thumb { background: ButtonText; forced-color-adjust: none; }');
  expect(css).toContain('.theme-setting[aria-checked="true"] .switch-thumb { background: HighlightText; }');
});