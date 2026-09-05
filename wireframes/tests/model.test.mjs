import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeSession, addEvent, atTime, createDemoState, dayBounds, durationLabel,
  elapsedLabel, eventsOnDay, removeEvent, startSession, stopSession,
  summarizeDay, switchSide, updateEvent,
} from '../model.mjs';

const NOW = new Date(2026, 8, 5, 14, 32).getTime();
const MINUTE = 60000;
const blank = () => ({ events: [], sequence: 0 });
const bottle = (amount = 90) => ({ type: 'bottle', startedAt: NOW, amount, milk: 'formula' });

test('demo: one active sleep, unique IDs, only past data', () => {
  const state = createDemoState(NOW);
  assert.equal(state.events.filter(event => event.status === 'running').length, 1);
  assert.equal(activeSession(state, 'sleep').startedAt, atTime(NOW, 14, 8));
  assert.equal(new Set(state.events.map(event => event.id)).size, state.events.length);
  assert.ok(state.events.every(event => event.startedAt <= NOW));
  assert.equal(eventsOnDay(state, NOW).length, 11);
});

test('sleep: start and finish require one model action each', () => {
  const state = blank();
  startSession(state, 'sleep', NOW);
  stopSession(state, 'sleep', NOW + 24 * MINUTE);
  assert.equal(activeSession(state, 'sleep'), undefined);
  assert.equal(state.events[0].endedAt - state.events[0].startedAt, 24 * MINUTE);
});

test('running timer survives a snapshot without depending on interval ticks', () => {
  const state = blank();
  startSession(state, 'sleep', NOW);
  const restored = structuredClone(state);
  stopSession(restored, 'sleep', NOW + 65 * MINUTE);
  assert.equal(durationLabel(restored.events[0].endedAt - restored.events[0].startedAt), '1 giờ 5 phút');
});

test('at most one active timer per type; sleep and nursing may overlap', () => {
  const state = blank();
  startSession(state, 'sleep', NOW);
  assert.throws(() => startSession(state, 'sleep', NOW), /đã có timer/);
  startSession(state, 'breast', NOW, 'right');
  assert.equal(state.events.length, 2);
  assert.throws(() => startSession(state, 'bottle', NOW), /không có timer/);
});

test('breastfeeding: switch side records continuous segments', () => {
  const state = blank();
  startSession(state, 'breast', NOW, 'left');
  switchSide(state, NOW + 8 * MINUTE);
  stopSession(state, 'breast', NOW + 15 * MINUTE);
  const event = state.events[0];
  assert.equal(event.side, 'right');
  assert.equal(event.segments.length, 2);
  assert.equal(event.segments[0].endedAt, event.segments[1].startedAt);
  assert.equal(event.segments.reduce((sum, segment) => sum + segment.endedAt - segment.startedAt, 0), 15 * MINUTE);
});

test('clock rollback never generates a negative timer segment', () => {
  const state = blank();
  startSession(state, 'breast', NOW);
  switchSide(state, NOW - MINUTE);
  stopSession(state, 'breast', NOW - 2 * MINUTE);
  assert.ok(state.events[0].segments.every(segment => segment.endedAt >= segment.startedAt));
  assert.equal(durationLabel(-10000), '0 phút');
});

test('bottle: accepts positive fractional amounts; rejects zero, negative, NaN, Infinity', () => {
  const state = blank();
  addEvent(state, bottle(75.5), NOW);
  assert.equal(state.events[0].amount, 75.5);
  for (const value of [0, -1, NaN, Infinity]) assert.throws(() => addEvent(state, bottle(value), NOW), /lớn hơn 0/);
  assert.equal(state.events.length, 1);
});

test('event validation: future times, invalid options and reversed periods', () => {
  const state = blank();
  assert.throws(() => addEvent(state, { ...bottle(), startedAt: NOW + MINUTE }, NOW), /tương lai/);
  assert.throws(() => addEvent(state, { ...bottle(), milk: 'unknown' }, NOW), /loại sữa/);
  assert.throws(() => addEvent(state, { type: 'diaper', startedAt: NOW, diaper: 'unknown' }, NOW), /loại tã/);
  assert.throws(() => addEvent(state, { type: 'sleep', startedAt: NOW, endedAt: NOW - MINUTE }, NOW), /sau giờ bắt đầu/);
  assert.throws(() => addEvent(state, { type: 'sleep', startedAt: NOW - MINUTE, endedAt: NOW + MINUTE }, NOW), /tương lai/);
  assert.throws(() => startSession(state, 'breast', NOW, 'unknown'), /bên bú/);
  assert.throws(() => addEvent(state, { type: 'unknown', startedAt: NOW }, NOW), /loại hoạt động/);
  assert.throws(() => addEvent(state, { ...bottle(), startedAt: NaN }, NOW), /chưa hợp lệ/);
  assert.equal(state.events.length, 0);
});

test('editing validates before mutation and keeps the original ID', () => {
  const state = blank();
  const original = addEvent(state, bottle(), NOW);
  assert.throws(() => updateEvent(state, original.id, { amount: -10 }, NOW), /lớn hơn 0/);
  assert.equal(state.events[0].amount, 90);
  updateEvent(state, original.id, { amount: 105, note: 'Uống thêm' }, NOW);
  assert.equal(state.events[0].id, original.id);
  assert.equal(state.events[0].amount, 105);
  assert.equal(state.events[0].note, 'Uống thêm');
});

test('running timers cannot be edited as completed entries', () => {
  const state = blank();
  const event = startSession(state, 'sleep', NOW);
  assert.throws(() => updateEvent(state, event.id, { note: 'note' }, NOW), /kết thúc timer/);
});

test('multi-segment nursing edits preserve segments and allow notes only', () => {
  const state = blank();
  const event = startSession(state, 'breast', NOW - 15 * MINUTE);
  switchSide(state, NOW - 7 * MINUTE);
  stopSession(state, 'breast', NOW);
  updateEvent(state, event.id, { note: 'Bé ngủ sau cữ bú' }, NOW);
  assert.equal(state.events[0].segments.length, 2);
  assert.throws(() => updateEvent(state, event.id, { startedAt: NOW - 20 * MINUTE }, NOW), /nhiều đoạn/);
});

test('single-segment nursing edit adjusts segment boundaries', () => {
  const state = blank();
  const event = startSession(state, 'breast', NOW - 15 * MINUTE);
  stopSession(state, 'breast', NOW);
  updateEvent(state, event.id, { startedAt: NOW - 20 * MINUTE }, NOW);
  assert.equal(state.events[0].segments[0].startedAt, NOW - 20 * MINUTE);
});

test('delete and undo via snapshot restore the exact record', () => {
  let state = blank();
  const event = addEvent(state, bottle(), NOW);
  const before = structuredClone(state);
  removeEvent(state, event.id);
  assert.equal(state.events.length, 0);
  state = before;
  assert.deepEqual(state.events[0], event);
});

test('journal filters and orders records newest first', () => {
  const state = createDemoState(NOW);
  const events = eventsOnDay(state, NOW, 'bottle');
  assert.equal(events.length, 2);
  assert.ok(events[0].startedAt > events[1].startedAt);
  assert.ok(events.every(event => event.type === 'bottle'));
});

test('summary separates bottle volume from nursing and includes running sleep', () => {
  const summary = summarizeDay(createDemoState(NOW), NOW, NOW);
  assert.equal(summary.bottleMl, 150);
  assert.equal(summary.breastCount, 2);
  assert.equal(summary.diaperCount, 3);
  assert.equal(summary.sleepMs, (190 + 55 + 70 + 24) * MINUTE);
});

test('sleep spanning midnight is split by local day boundaries', () => {
  const state = blank();
  const midnight = dayBounds(NOW)[0];
  addEvent(state, { type: 'sleep', startedAt: midnight - 30 * MINUTE, endedAt: midnight + 90 * MINUTE }, NOW);
  assert.equal(summarizeDay(state, midnight - 1, NOW).sleepMs, 30 * MINUTE);
  assert.equal(summarizeDay(state, midnight, NOW).sleepMs, 90 * MINUTE);
  assert.equal(eventsOnDay(state, midnight).length, 0);
});

test('empty day produces zeros and clear duration labels', () => {
  assert.deepEqual(summarizeDay(blank(), NOW, NOW), { bottleMl: 0, bottleCount: 0, breastCount: 0, diaperCount: 0, sleepMs: 0 });
  assert.equal(durationLabel(60 * MINUTE), '1 giờ');
  assert.equal(elapsedLabel(NOW, NOW), 'Vừa xong');
  assert.equal(elapsedLabel(NOW, NOW + 10 * MINUTE), '10 phút trước');
});