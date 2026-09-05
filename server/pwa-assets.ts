import { deflateSync } from 'node:zlib';
import type { Plugin } from 'vite';
import { brandGlyph, brandPalette } from '../src/brand/mark.ts';

// Dependency-free PNG generation from the same vector "n" as the login/splash logo.
function chunk(type: string, data: Buffer) {
  const payload = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of payload) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, payload, checksum]);
}
function insideTile(x: number, y: number, inset = 0) {
  if (x < inset || y < inset || x > 100 - inset || y > 100 - inset) return false;
  const radius = (x < 50 && y > 50 ? 4 : 14) / 42 * 100 - inset;
  const cx = Math.max(inset + radius, Math.min(100 - inset - radius, x));
  const cy = Math.max(inset + radius, Math.min(100 - inset - radius, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}
export function icon(size: number) {
  const data = Buffer.alloc((size * 3 + 1) * size);
  const samples = 4; // Supersampling keeps the outline smooth even on the 180px iOS icon.
  const local = (pixel: number) => ((pixel + .5) / (size * samples) - .08) / .84 * 100;
  const xs = Array.from({ length: size * samples }, (_, x) => local(x));
  // Scanline intersections avoid testing every glyph edge at every subpixel.
  const rows = Array.from({ length: size * samples }, (_, row) => {
    const y = local(row);
    const cuts: number[] = [];
    for (let i = 0; i < brandGlyph.length; i++) {
      const [ax, ay] = brandGlyph[i], [bx, by] = brandGlyph[(i + 1) % brandGlyph.length];
      if ((ay > y) !== (by > y)) cuts.push(ax + (y - ay) * (bx - ax) / (by - ay));
    }
    return { y, cuts: cuts.sort((a, b) => a - b) };
  });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sum = [0, 0, 0];
    for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
      const px = xs[x * samples + sx];
      const row = rows[y * samples + sy];
      const ink = row.cuts.some((left, i) => i % 2 === 0 && px >= left && px < row.cuts[i + 1]);
      const color = ink ? brandPalette.ink : !insideTile(px, row.y) ? brandPalette.canvas
        : insideTile(px, row.y, 100 / 42) ? brandPalette.tint : brandPalette.border;
      for (let channel = 0; channel < 3; channel++) sum[channel] += color[channel];
    }
    const offset = y * (size * 3 + 1) + 1 + x * 3;
    data.set(sum.map(channel => Math.round(channel / samples ** 2)), offset);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(data)), chunk('IEND', Buffer.alloc(0))]);
}
export function pwaAssets(): Plugin {
  const assets = new Map([180, 192, 512].map(size => [`icons/noi-v2-${size}.png`, icon(size)]));
  return {
    name: 'noi-pwa-icons',
    generateBundle() { for (const [fileName, source] of assets) this.emitFile({ type: 'asset', fileName, source }); },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const data = assets.get(req.url?.slice(1) ?? '');
        if (!data) { next(); return; }
        res.setHeader('Content-Type', 'image/png'); res.end(data);
      });
    },
  };
}