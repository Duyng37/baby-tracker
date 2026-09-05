import { expect, it } from 'vitest';
import { changeTimer, decimal, startTimer, validateBody } from './events';
import type { EventBody } from './types';

it('breast segments stay continuous across clock rollback and stop', () => {
  const start = Date.parse('2020-01-01T10:00:00Z');
  const timer = startTimer('breast', 'left', start);
  const switched = changeTimer(timer, 'switch', start - 1000);
  const stopped = changeTimer(switched, 'stop', start + 1000);
  validateBody(stopped);
  if (stopped.type !== 'breast') throw new Error();
  expect(stopped.payload.segments).toHaveLength(2);
  expect(stopped.payload.segments[0].ended_at).toBe(stopped.payload.segments[1].started_at);
  expect(timer.ended_at).toBeNull();
});
it('rejects malformed/extra payload keys and discontinuous nursing segments', () => {
  const timer = startTimer('breast');
  expect(() => validateBody({ ...timer, payload: {} } as EventBody)).toThrow();
  expect(() => validateBody({ ...startTimer('sleep'), payload: { amount: 10 } } as unknown as EventBody)).toThrow();
  const switched = changeTimer(timer, 'switch');
  if (switched.type !== 'breast') throw new Error();
  switched.payload.segments[1].started_at = '2000-01-01T00:00:00Z';
  expect(() => validateBody(switched)).toThrow();
});
it('precision-sensitive values accept only canonical decimal strings', () => {
  expect(() => decimal('9007199254740993')).not.toThrow();
  for (const value of [1, -1, '01', '-1', '1.2', '1e3', '']) expect(() => decimal(value)).toThrow();
});