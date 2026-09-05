import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { icon } from './pwa-assets';

it.each([180, 192, 512])('generates a valid RGB PNG of size %i', size => {
  const png = icon(size);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.readUInt32BE(16)).toBe(size); expect(png.readUInt32BE(20)).toBe(size);
  const length = png.readUInt32BE(33); expect(png.subarray(37, 41).toString()).toBe('IDAT');
  expect(inflateSync(png.subarray(41, 41 + length))).toHaveLength((size * 3 + 1) * size);
});
it('manifest has stable identity, clean launch URL and generated PNG icons', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  expect(manifest.id).toBe('/'); expect(manifest.start_url).toBe('/'); expect(manifest.scope).toBe('/'); expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((entry: { src: string }) => entry.src)).toEqual(['/icons/noi-192.png', '/icons/noi-512.png']);
});