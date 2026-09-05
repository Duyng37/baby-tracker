import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it, vi } from 'vitest';
import { icon, pwaAssets } from './pwa-assets';
import { brandGlyph, brandPalette } from '../src/brand/mark';

it.each([180, 192, 512])('generates a valid RGB PNG of size %i', size => {
  const png = icon(size);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.readUInt32BE(16)).toBe(size); expect(png.readUInt32BE(20)).toBe(size);
  const length = png.readUInt32BE(33); expect(png.subarray(37, 41).toString()).toBe('IDAT');
  const pixels = inflateSync(png.subarray(41, 41 + length));
  expect(pixels).toHaveLength((size * 3 + 1) * size);
  const pixel = (x: number, y: number) => {
    const offset = Math.floor(y * size) * (size * 3 + 1) + 1 + Math.floor(x * size) * 3;
    return [...pixels.subarray(offset, offset + 3)];
  };
  expect(pixel(0, 0)).toEqual(brandPalette.canvas);
  expect(pixel(.5, .2)).toEqual(brandPalette.tint);
  // Both stems of "n", with a clear gap below its arch (not the former crescent).
  expect(pixel(.38, .5)).toEqual(brandPalette.ink);
  expect(pixel(.60, .5)).toEqual(brandPalette.ink);
  expect(pixel(.5, .62)).toEqual(brandPalette.tint);
  // Preserve the login tile's distinctive smaller bottom-left corner.
  expect(pixel(.13, .84)).toEqual(brandPalette.tint);
  expect(pixel(.13, .16)).toEqual(brandPalette.canvas);
});
it('manifest has stable identity, clean launch URL and generated PNG icons', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  expect(manifest.id).toBe('/'); expect(manifest.start_url).toBe('/'); expect(manifest.scope).toBe('/'); expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((entry: { src: string }) => entry.src)).toEqual(['/icons/noi-v2-192.png', '/icons/noi-v2-512.png']);
  expect(manifest.icons.map((entry: { purpose: string }) => entry.purpose)).toEqual(['any maskable', 'any maskable']);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  expect(html).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/icons/noi-v2-180.png"');
});
it('keeps the entire letter within the central maskable safe circle', () => {
  for (const [x, y] of brandGlyph) {
    expect(Math.hypot(.08 + .84 * x / 100 - .5, .08 + .84 * y / 100 - .5)).toBeLessThan(.4);
  }
});
it('uses the exact light-theme brand palette instead of the old moon colors', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const light = css.match(/:root \{([^}]+)\}/)![1];
  for (const [color, token] of [['canvas', 'canvas'], ['tint', 'tint'], ['border', 'accent-line'], ['ink', 'soft-ink']] as const) {
    const hex = `#${brandPalette[color].map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
    expect(light).toContain(`--${token}: ${hex}`);
  }
});
it('emits every versioned iOS/Android icon declared by the app', () => {
  const emitFile = vi.fn();
  const hook = pwaAssets().generateBundle as unknown as (this: { emitFile: typeof emitFile }) => void;
  hook.call({ emitFile });
  expect(emitFile.mock.calls.map(([asset]) => asset.fileName)).toEqual([
    'icons/noi-v2-180.png', 'icons/noi-v2-192.png', 'icons/noi-v2-512.png',
  ]);
  for (const [asset] of emitFile.mock.calls) {
    expect(asset.type).toBe('asset'); expect(asset.source.subarray(1, 4).toString()).toBe('PNG');
  }
});