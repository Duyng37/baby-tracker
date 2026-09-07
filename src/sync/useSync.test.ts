import { expect, it } from 'vitest';
import { backgroundSyncInterval } from './useSync';

it('polls cloud in the background at most once every ten minutes after a successful sync', () => {
  expect(backgroundSyncInterval).toBe(10 * 60_000);
});