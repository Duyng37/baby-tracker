import { deflateSync } from 'node:zlib';
import type { Plugin } from 'vite';

// Dependency-free PNG generation: a moon on the app background, inside maskable safe area.
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
export function icon(size: number) {
  const data = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = x / size; const b = y / size;
    const outer = Math.hypot(a - 0.49, b - 0.51) < 0.28;
    const inner = Math.hypot(a - 0.62, b - 0.40) < 0.25;
    const color = outer && !inner ? [66, 104, 88] : [247, 245, 239];
    const offset = y * (size * 3 + 1) + 1 + x * 3;
    data.set(color, offset);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(data)), chunk('IEND', Buffer.alloc(0))]);
}
export function pwaAssets(): Plugin {
  const assets = new Map([180, 192, 512].map(size => [`icons/noi-${size}.png`, icon(size)]));
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