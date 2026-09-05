import test from 'node:test';
import assert from 'node:assert/strict';
import { addEvent, activeSession, startSession, summarizeDay } from '../model.mjs';
import {
  acceptDemoInvitation, accessibleFamilies, addBaby, addFamily, createWorkspaceDemo,
  currentBaby, currentFamily, exportBabySnapshot, familyTimers, isOwner,
  markPending, selectBaby, selectFamily, simulateCloudAck,
} from '../workspace.mjs';

const NOW = new Date(2026, 8, 5, 14, 32).getTime();

test('separate babies have independent events, summaries and unique IDs', () => {
  const workspace = createWorkspaceDemo(NOW);
  assert.equal(summarizeDay(currentBaby(workspace).tracking, NOW, NOW).bottleMl, 150);
  selectBaby(workspace, 'baby-bong');
  assert.equal(summarizeDay(currentBaby(workspace).tracking, NOW, NOW).bottleMl, 45);
  addEvent(currentBaby(workspace).tracking, { type: 'bottle', amount: 90, milk: 'formula', startedAt: NOW }, NOW);
  selectBaby(workspace, 'baby-may');
  assert.equal(summarizeDay(currentBaby(workspace).tracking, NOW, NOW).bottleMl, 150);
  const ids = workspace.families.flatMap(family => family.babies.flatMap(baby => baby.tracking.events.map(event => event.id)));
  assert.equal(ids.length, new Set(ids).size);
});

test('selection rejects a baby from a different family and remembers previous baby', () => {
  const workspace = createWorkspaceDemo(NOW);
  assert.throws(() => selectBaby(workspace, 'baby-bin'), /không thuộc gia đình/);
  assert.equal(workspace.babyId, 'baby-may');
  selectBaby(workspace, 'baby-bong');
  selectFamily(workspace, 'family-bin');
  assert.equal(workspace.babyId, 'baby-bin');
  selectFamily(workspace, 'family-may');
  assert.equal(workspace.babyId, 'baby-bong');
});

test('scope checks exclude a non-member family (not a substitute for server RLS)', () => {
  const workspace = createWorkspaceDemo(NOW);
  workspace.families.push({ id: 'other', name: 'Unrelated family', members: [], babies: [] });
  assert.equal(accessibleFamilies(workspace).length, 2);
  assert.throws(() => selectFamily(workspace, 'other'), /không có quyền/);
  assert.throws(() => currentFamily(workspace, 'missing'), /không có quyền/);
  assert.equal(workspace.familyId, 'family-may');
});

test('timers continue after changing baby and are listed only in current family', () => {
  const workspace = createWorkspaceDemo(NOW);
  selectBaby(workspace, 'baby-bong');
  startSession(currentBaby(workspace).tracking, 'sleep', NOW);
  assert.equal(familyTimers(workspace).length, 2);
  selectFamily(workspace, 'family-bin');
  assert.equal(familyTimers(workspace).length, 0);
  selectFamily(workspace, 'family-may');
  assert.equal(familyTimers(workspace).length, 2);
  assert.ok(activeSession(currentBaby(workspace, 'baby-may').tracking, 'sleep'));
});

test('adding a family validates atomically and creates an owner plus first baby', () => {
  const workspace = createWorkspaceDemo(NOW);
  assert.throws(() => addFamily(workspace, 'Nhà của Na', ' '), /Tên bé/);
  assert.equal(workspace.families.length, 2);
  assert.equal(workspace.sequence, 0);
  const family = addFamily(workspace, ' Nhà của Na ', ' Na ');
  assert.equal(currentFamily(workspace), family);
  assert.equal(isOwner(workspace), true);
  assert.equal(currentBaby(workspace).name, 'Na');
  assert.equal(currentBaby(workspace).tracking.events.length, 0);
  assert.equal(family.pending, 1);
});

test('only owner can add profiles and new baby starts with an empty history', () => {
  const workspace = createWorkspaceDemo(NOW);
  const baby = addBaby(workspace, 'Bé mới');
  assert.equal(currentBaby(workspace), baby);
  assert.equal(currentFamily(workspace).babies.length, 3);
  assert.equal(baby.tracking.events.length, 0);
  selectFamily(workspace, 'family-bin');
  assert.throws(() => addBaby(workspace, 'Không được'), /Chỉ chủ gia đình/);
  assert.equal(currentFamily(workspace).babies.length, 1);
});

test('demo invitation is idempotent and grants caregiver access only', () => {
  const workspace = createWorkspaceDemo(NOW);
  acceptDemoInvitation(workspace);
  acceptDemoInvitation(workspace);
  assert.equal(workspace.families.length, 3);
  assert.equal(currentFamily(workspace).members.length, 2);
  assert.equal(isOwner(workspace), false);
  assert.equal(currentBaby(workspace).name, 'An');
});

test('pending and simulated ACK are isolated per family', () => {
  const workspace = createWorkspaceDemo(NOW);
  markPending(workspace);
  markPending(workspace);
  assert.throws(() => simulateCloudAck(workspace, NOW, true), /offline/);
  assert.equal(currentFamily(workspace).pending, 2);
  selectFamily(workspace, 'family-bin');
  assert.equal(currentFamily(workspace).pending, 0);
  simulateCloudAck(workspace, NOW, false);
  selectFamily(workspace, 'family-may');
  assert.equal(currentFamily(workspace).pending, 2);
  simulateCloudAck(workspace, NOW, false);
  assert.equal(currentFamily(workspace).pending, 0);
  assert.equal(currentFamily(workspace).lastSyncedAt, NOW);
});

test('export includes only selected baby and explicit family identity', () => {
  const workspace = createWorkspaceDemo(NOW);
  selectFamily(workspace, 'family-bin');
  const snapshot = exportBabySnapshot(workspace, NOW);
  assert.equal(snapshot.family.id, 'family-bin');
  assert.equal(snapshot.baby.name, 'Bin');
  assert.equal(snapshot.events.length, 1);
  assert.ok(snapshot.events.every(event => event.id.startsWith('baby-bin-')));
  assert.equal(snapshot.prototype, true);
  snapshot.events.length = 0;
  assert.equal(currentBaby(workspace).tracking.events.length, 1);
});