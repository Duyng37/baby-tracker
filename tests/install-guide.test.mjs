import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectGif, prepareInstallGuide } from '../scripts/install-guide.mjs';

const header = Buffer.from('47494638396101000100800000000000ffffff', 'hex');
const control = delay => Buffer.from([0x21, 0xf9, 4, 0, delay & 255, delay >> 8, 0, 0]);
const image = Buffer.from('2c0000000001000100000202440100', 'hex');
const loop = Buffer.from('21ff0b4e45545343415045322e300301030000', 'hex');
const fixture = looping => Buffer.concat([header, ...(looping ? [loop] : []), control(10), image, control(20), image, Buffer.from([0x3b])]);

for (const looping of [true, false]) test(`GIF: adds 2s only at the end and repeats forever (existing loop: ${looping})`, () => {
  const original = fixture(looping), copy = Buffer.from(original);
  const result = prepareInstallGuide(original), output = inspectGif(result.animation);
  assert.deepEqual(output.frames.map(frame => frame.delay), [10, 220]);
  assert.equal(output.loops.length, 1); assert.equal(result.animation.readUInt16LE(output.loops[0]), 0);
  assert.deepEqual(original, copy);
  assert.equal(result.originalDurationMs, 300); assert.equal(result.addedPauseMs, 2000);
  for (const frame of output.frames) assert.deepEqual(result.animation.subarray(frame.start, frame.end), image);
  const still = inspectGif(result.still);
  assert.equal(still.frames.length, 1); assert.equal(still.loops.length, 0);
});
test('GIF: rejects malformed/truncated input and unsupported delays', () => {
  for (const data of [Buffer.alloc(0), Buffer.from('not a gif'), fixture(true).subarray(0, -1)]) {
    assert.throws(() => prepareInstallGuide(data));
  }
  for (const pause of [-1, 1, NaN, 700000]) assert.throws(() => prepareInstallGuide(fixture(true), pause));
});
test('GIF: committed animation has a final pause, infinite loop and a single-frame reduced-motion alternative', () => {
  const animation = readFileSync(new URL('../public/install-guide-v1.gif', import.meta.url));
  const still = readFileSync(new URL('../public/install-guide-still-v1.gif', import.meta.url));
  const info = inspectGif(animation), poster = inspectGif(still);
  assert.equal(info.width, 240); assert.equal(info.height, 490);
  assert.ok(info.frames.length > 1); assert.ok(info.frames.at(-1).delay >= 200);
  assert.equal(animation.readUInt16LE(info.loops[0]), 0);
  assert.equal(poster.frames.length, 1); assert.equal(poster.width, info.width); assert.equal(poster.height, info.height);
});