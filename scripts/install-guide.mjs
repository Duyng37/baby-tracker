// Preserve the original compressed GIF frames; change timing, not image quality.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function inspectGif(bytes) {
  const requireBytes = (offset, length) => {
    if (offset < 0 || offset + length > bytes.length) throw new Error('Truncated GIF');
  };
  requireBytes(0, 13);
  if (!/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) throw new Error('Invalid GIF');
  const paletteSize = packed => packed & 0x80 ? 3 * (2 ** ((packed & 7) + 1)) : 0;
  const headerEnd = 13 + paletteSize(bytes[10]);
  requireBytes(0, headerEnd);
  const skipBlocks = start => {
    let offset = start;
    for (;;) {
      requireBytes(offset, 1);
      const size = bytes[offset++];
      requireBytes(offset, size); offset += size;
      if (!size) return offset;
    }
  };
  const frames = [], loops = [];
  let offset = headerEnd, control = -1;
  while (offset < bytes.length) {
    const start = offset;
    if (bytes[offset] === 0x3b) {
      if (!frames.length || offset !== bytes.length - 1) throw new Error('Invalid GIF trailer');
      return { headerEnd, frames, loops, width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
    }
    if (bytes[offset] === 0x21) {
      requireBytes(offset, 3);
      const label = bytes[offset + 1];
      offset = skipBlocks(offset + 2);
      if (label === 0xf9) {
        if (offset - start !== 8 || bytes[start + 2] !== 4) throw new Error('Invalid GIF control');
        control = start;
      } else if (label === 0xff && bytes[start + 2] === 11
        && ['NETSCAPE2.0', 'ANIMEXTS1.0'].includes(bytes.subarray(start + 3, start + 14).toString('ascii'))) {
        if (offset - start !== 19 || bytes[start + 14] !== 3 || bytes[start + 15] !== 1) throw new Error('Invalid GIF loop');
        loops.push(start + 16);
      } else if (label === 0x01) throw new Error('Plain-text GIF rendering is unsupported');
    } else if (bytes[offset] === 0x2c) {
      requireBytes(offset, 10);
      const imageEnd = offset + 10 + paletteSize(bytes[offset + 9]);
      requireBytes(offset, imageEnd - offset + 1); // Descriptor, local palette, LZW code size.
      offset = skipBlocks(imageEnd + 1);
      frames.push({ start, end: offset, control, delay: control < 0 ? 0 : bytes.readUInt16LE(control + 4) });
      control = -1;
    } else throw new Error('Unknown GIF block');
  }
  throw new Error('Missing GIF trailer');
}

export function prepareInstallGuide(source, pauseMs = 2000) {
  if (!Number.isInteger(pauseMs) || pauseMs < 0 || pauseMs % 10) throw new Error('GIF delay must be in 10ms units');
  const info = inspectGif(source), last = info.frames.at(-1), first = info.frames[0];
  if (last.control < 0 || last.delay + pauseMs / 10 > 65535) throw new Error('Unsupported final GIF delay');
  let animation = Buffer.from(source);
  animation.writeUInt16LE(last.delay + pauseMs / 10, last.control + 4);
  for (const position of info.loops) animation.writeUInt16LE(0, position); // Repeat indefinitely.
  if (!info.loops.length) animation = Buffer.concat([animation.subarray(0, info.headerEnd),
    Buffer.from('21ff0b4e45545343415045322e300301000000', 'hex'), animation.subarray(info.headerEnd)]);
  const still = Buffer.concat([source.subarray(0, info.headerEnd),
    first.control < 0 ? Buffer.alloc(0) : source.subarray(first.control, first.control + 8),
    source.subarray(first.start, first.end), Buffer.from([0x3b])]);
  return { animation, still, frames: info.frames.length, width: info.width, height: info.height,
    originalDurationMs: info.frames.reduce((sum, frame) => sum + frame.delay * 10, 0), addedPauseMs: pauseMs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const source = readFileSync(process.argv[2]);
    const { animation, still, ...metadata } = prepareInstallGuide(source);
    // Create new public assets only. Never overwrite the source or an existing asset.
    writeFileSync(new URL('../public/install-guide-v1.gif', import.meta.url), animation, { flag: 'wx' });
    writeFileSync(new URL('../public/install-guide-still-v1.gif', import.meta.url), still, { flag: 'wx' });
    console.log(JSON.stringify({ ...metadata, bytes: animation.length, sourceUnchanged: source.equals(readFileSync(process.argv[2])) }));
  } catch {
    console.error('Cannot prepare guide: check the input GIF and whether output assets already exist. No source file modified.');
    process.exitCode = 1;
  }
}