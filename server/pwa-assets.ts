import { deflateSync } from 'node:zlib';
import { loadEnv, type Plugin } from 'vite';
import { brandGlyph, brandPalette } from '../src/brand/mark.ts';

export const socialImagePath = '/images/noi-share-v1.png';

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
function png(width: number, height: number, data: Buffer) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(data)), chunk('IEND', Buffer.alloc(0))]);
}
function iconPixels(size: number) {
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
  return data;
}
export function icon(size: number) {
  return png(size, size, iconPixels(size));
}
export function socialPreview() {
  const width = 1200, height = 630;
  const data = Buffer.alloc((width * 3 + 1) * height);
  const paint = (x: number, y: number, color: readonly number[]) => data.set(color, y * (width * 3 + 1) + 1 + x * 3);
  const rounded = (x: number, y: number, left: number, top: number, w: number, h: number, radius: number) => {
    const cx = Math.max(left + radius, Math.min(left + w - radius - 1, x));
    const cy = Math.max(top + radius, Math.min(top + h - radius - 1, y));
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  };
  for (let y = 0; y < height; y++) {
    data[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) paint(x, y, brandPalette.canvas);
  }
  const markSize = 460, mark = iconPixels(markSize), markLeft = 72, markTop = 85;
  for (let y = 0; y < markSize; y++) data.set(mark.subarray(y * (markSize * 3 + 1) + 1, (y + 1) * (markSize * 3 + 1)),
    (markTop + y) * (width * 3 + 1) + 1 + markLeft * 3);
  const cards = [[590, 96, 514, 118], [630, 256, 474, 118], [590, 416, 514, 118]] as const;
  for (const [left, top, w, h] of cards) for (let y = top; y < top + h; y++) for (let x = left; x < left + w; x++) {
    if (!rounded(x, y, left, top, w, h, 24)) continue;
    const border = x < left + 2 || x >= left + w - 2 || y < top + 2 || y >= top + h - 2;
    paint(x, y, border ? brandPalette.border : [255, 255, 253]);
  }
  for (const [left, top] of cards) for (let y = top + 35; y < top + 83; y++) for (let x = left + 28; x < left + 76; x++) {
    if ((x - left - 52) ** 2 + (y - top - 59) ** 2 <= 24 ** 2) paint(x, y, brandPalette.tint);
  }
  for (const [left, top, w] of cards) {
    for (let y = top + 39; y < top + 50; y++) for (let x = left + 98; x < left + w - 42; x++) paint(x, y, brandPalette.ink);
    for (let y = top + 69; y < top + 77; y++) for (let x = left + 98; x < left + w - 128; x++) paint(x, y, brandPalette.border);
  }
  return png(width, height, data);
}
export function absoluteSocialMetadata(html: string, value: string | undefined) {
  try {
    const url = new URL(value ?? '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return html;
    const origin = url.origin;
    return html.replace('property="og:url" content="/"', `property="og:url" content="${origin}/"`)
      .replaceAll(`content="${socialImagePath}"`, `content="${origin}${socialImagePath}"`);
  } catch { return html; }
}
export function pwaAssets(): Plugin {
  const assets = new Map<string, Buffer>([...([180, 192, 512].map(size => [`icons/noi-v2-${size}.png`, icon(size)] as const)),
    [socialImagePath.slice(1), socialPreview()]]);
  let origin: string | undefined;
  return {
    name: 'noi-brand-assets',
    configResolved(config) { origin = loadEnv(config.mode, config.envDir, '').APP_ORIGIN; },
    transformIndexHtml(html) { return absoluteSocialMetadata(html, origin); },
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