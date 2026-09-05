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
it('shares date/time field sizing and icon trigger styles instead of using the native time widget', () => {
  const fields = css.match(/\.date-input-text, \.time-input-text \{([^}]+)\}/)?.[1];
  expect(fields).toContain('height: 50px'); expect(fields).toContain('padding-right: 48px');
  expect(fields).toContain('font-variant-numeric: tabular-nums');
  const triggers = css.match(/\.date-input-trigger, \.time-input-trigger \{([^}]+)\}/)?.[1];
  expect(triggers).toContain('width: 44px'); expect(triggers).toContain('color: var(--soft-ink)');
  expect(css).not.toContain('input[type="time"]');
});
it('gives the time popup the calendar palette and shape with bounded scrolling and keyboard focus', () => {
  const shared = css.match(/\.time-input-popover, \.date-input-calendar \{([^}]+)\}/)?.[1];
  expect(shared).toContain('border-radius: 14px'); expect(shared).toContain('background: var(--surface)');
  expect(shared).toContain('box-shadow: 0 8px 24px var(--shadow)');
  expect(css).toContain('.time-input-popover { left: auto; right: 0; width: min(256px, calc(100vw - 64px)); }');
  const options = css.match(/\.time-input-options \{([^}]+)\}/)?.[1];
  expect(options).toContain('max-height: min(192px, 30dvh)'); expect(options).toContain('overflow-y: auto');
  expect(options).toContain('overscroll-behavior: contain');
  expect(css).toContain('.time-input-options button[aria-pressed="true"] { background: var(--tint); color: var(--soft-ink); }');
  expect(css).toContain('.time-input-options button:focus-visible { outline-offset: -2px; }');
});
it('constrains field tracks and bottom-aligns wrapped labels while keeping narrow rows flexible', () => {
  const label = css.match(/(?:^|\n)label \{([^}]+)\}/)?.[1];
  const row = css.match(/\.row \{([^}]+)\}/)?.[1];
  const rowLabel = css.match(/\.row > label \{([^}]+)\}/)?.[1];
  expect(label).toContain('grid-template-columns: minmax(0, 1fr)');
  expect(label).toContain('min-width: 0');
  expect(row).toContain('flex-wrap: wrap');
  expect(rowLabel).toContain('flex: 1 1 140px');
  expect(rowLabel).toContain('align-self: flex-end');
});
it('keeps PWA launch colors and initial browser chrome aligned with the light canvas', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf8'));
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const canvas = tokens(lightBlock).canvas;
  expect(manifest.background_color).toBe(canvas);
  expect(manifest.theme_color).toBe(canvas);
  expect(html).toContain(`<meta name="theme-color" content="${canvas}"`);
});
it('keeps the compact journal date and activity controls equally tall with a direct-selection calendar', () => {
  expect(css).toContain('.journal-filters select, .journal-date-text { height: 50px; }');
  expect(css).toContain('.journal-filters > label, .journal-date-field { flex: 1 1 150px; }');
  const calendar = css.match(/\.date-input-calendar \{([^}]+)\}/)?.[1];
  expect(calendar).toContain('position: absolute');
  expect(calendar).toContain('z-index: 3');
  expect(calendar).toContain('width: min(304px, calc(100vw - 32px))');
  expect(css).toContain('.date-input-days { gap: 2px; margin-top: 4px; }');
});
it('keeps icon-only quick actions and their expand control in one row', () => {
  expect(css).toContain('.quick-recording[data-collapsed="true"] .quick-heading { display: none; }');
  expect(css).toMatch(/\.quick-recording\[data-collapsed="true"\] \.quick-actions \{[^}]*grid-row: 1;[^}]*repeat\(4, minmax\(0, 1fr\)\)/);
  expect(css).toContain('.quick-toggle { grid-column: 2; grid-row: 1; }');
  expect(css).not.toContain('.quick-toggle { display: none');
  expect(css).not.toContain('.footer--compact');
});
it('keeps family management actions on one responsive row', () => {
  expect(css).toContain('.family-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }');
  expect(css).toContain('.family-actions > button { width: 100%; min-width: 0;');
});
it('shows a fixed-size theme switch with distinct on/off positions and forced-color support', () => {
  expect(css).toMatch(/\.theme-setting > \.switch-track \{[^}]*flex: 0 0 44px;[^}]*height: 26px/);
  expect(css).toContain('.theme-setting[aria-checked="true"] .switch-thumb { transform: translateX(18px)');
  expect(css).toContain('.switch-thumb { background: ButtonText; forced-color-adjust: none; }');
  expect(css).toContain('.theme-setting[aria-checked="true"] .switch-thumb { background: HighlightText; }');
});
it('centers the startup splash within the app width and respects device safe areas', () => {
  const splash = css.match(/\.loading-screen \{([^}]+)\}/)![1];
  expect(splash).toContain('width: min(100%, 640px)');
  expect(splash).toContain('min-height: 100dvh');
  expect(splash).toContain('place-items: center');
  expect(splash).toContain('env(safe-area-inset-top)');
  expect(splash).toContain('env(safe-area-inset-bottom)');
  expect(splash).toContain('background: var(--canvas)');
});
it('animates only loading spinners and only when reduced motion is not requested', () => {
  const motion = css.indexOf('@media (prefers-reduced-motion: no-preference)');
  expect(css.slice(0, motion)).not.toMatch(/animation:/);
  expect(css.slice(motion)).toContain('.spinner { animation: loading-spin .85s linear infinite; }');
  expect(css).not.toContain('.sync-button[data-busy="true"] .icon');
  expect(css).toContain('.sync-button[data-busy="true"]:not([data-offline="true"]) { background: var(--tint); color: var(--soft-ink); opacity: 1; }');
});