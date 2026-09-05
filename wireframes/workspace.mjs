// Demo-only scope model. These client checks are NOT a security boundary or RLS.
import { addEvent, atTime, createDemoState } from './model.mjs';

function cleanName(value, label) {
  const name = String(value ?? '').trim();
  if (!name || name.length > 60) throw new Error(`${label} cần từ 1 đến 60 ký tự.`);
  return name;
}

export function accessibleFamilies(workspace) {
  return workspace.families.filter(family => family.members.some(member => member.userId === workspace.userId));
}

export function currentFamily(workspace, id = workspace.familyId) {
  const family = accessibleFamilies(workspace).find(item => item.id === id);
  if (!family) throw new Error('Bạn không có quyền truy cập gia đình này.');
  return family;
}

export function currentBaby(workspace, id = workspace.babyId) {
  const baby = currentFamily(workspace).babies.find(item => item.id === id);
  if (!baby) throw new Error('Bé không thuộc gia đình đang chọn.');
  return baby;
}

export function isOwner(workspace) {
  return currentFamily(workspace).members.some(member => member.userId === workspace.userId && member.role === 'owner');
}

export function selectBaby(workspace, id) {
  currentBaby(workspace, id);
  workspace.babyId = id;
  workspace.lastBaby[workspace.familyId] = id;
}

export function selectFamily(workspace, id) {
  const family = currentFamily(workspace, id);
  const remembered = family.babies.find(baby => baby.id === workspace.lastBaby[id]);
  workspace.familyId = id;
  workspace.babyId = (remembered ?? family.babies[0]).id;
  workspace.lastBaby[id] = workspace.babyId;
}

function makeBaby(id, name, ageLabel = 'Chưa thêm ngày sinh') {
  return { id, name, ageLabel, milk: 'formula', tracking: { idPrefix: id, events: [], sequence: 0 } };
}

export function addBaby(workspace, name) {
  if (!isOwner(workspace)) throw new Error('Chỉ chủ gia đình có thể thêm bé.');
  const nickname = cleanName(name, 'Tên bé');
  const baby = makeBaby(`baby-new-${++workspace.sequence}`, nickname);
  currentFamily(workspace).babies.push(baby);
  selectBaby(workspace, baby.id);
  return baby;
}

export function addFamily(workspace, name, babyName) {
  // Validate both fields before changing anything: no half-created family.
  const familyName = cleanName(name, 'Tên gia đình');
  const nickname = cleanName(babyName, 'Tên bé');
  const sequence = ++workspace.sequence;
  const family = {
    id: `family-new-${sequence}`, name: familyName,
    members: [{ userId: workspace.userId, name: 'Bạn', role: 'owner' }],
    babies: [makeBaby(`baby-family-${sequence}`, nickname)], pending: 1, lastSyncedAt: null,
  };
  workspace.families.push(family);
  selectFamily(workspace, family.id);
  return family;
}

export function acceptDemoInvitation(workspace) {
  // A fixed fictional invitation, never an authentication token or real API call.
  let family = workspace.families.find(item => item.id === 'family-an');
  if (!family) {
    family = {
      id: 'family-an', name: 'Nhà của An',
      members: [{ userId: 'demo-parent-an', name: 'Bố An', role: 'owner' }],
      babies: [makeBaby('baby-an', 'An', '5 tuần tuổi')], pending: 0, lastSyncedAt: null,
    };
    workspace.families.push(family);
  }
  if (!family.members.some(member => member.userId === workspace.userId)) {
    family.members.push({ userId: workspace.userId, name: 'Bạn', role: 'caregiver' });
  }
  selectFamily(workspace, family.id);
  return family;
}

export function familyTimers(workspace) {
  return currentFamily(workspace).babies.flatMap(baby => baby.tracking.events
    .filter(event => event.status === 'running').map(event => ({ baby, event })));
}

export function markPending(workspace) {
  currentFamily(workspace).pending += 1;
}

export function simulateCloudAck(workspace, now, offline) {
  if (offline) throw new Error('Đang offline: thay đổi vẫn chờ gửi lên cloud (mô phỏng).');
  const family = currentFamily(workspace);
  family.pending = 0;
  family.lastSyncedAt = now;
}

export function exportBabySnapshot(workspace, now) {
  const family = currentFamily(workspace);
  const baby = currentBaby(workspace);
  return {
    prototype: true, schemaVersion: 2, exportedAt: new Date(now).toISOString(),
    family: { id: family.id, name: family.name },
    baby: { id: baby.id, name: baby.name, fictional: true },
    events: structuredClone(baby.tracking.events),
  };
}

export function createWorkspaceDemo(now) {
  const may = makeBaby('baby-may', 'Mây', '3 tuần tuổi');
  may.tracking = createDemoState(now);
  may.tracking.idPrefix = may.id;
  may.tracking.events.forEach(event => { event.id = `${may.id}-${event.id}`; });
  const bong = makeBaby('baby-bong', 'Bông', '3 tuần tuổi');
  bong.milk = 'expressed';
  addEvent(bong.tracking, { type: 'bottle', amount: 45, milk: 'expressed', startedAt: atTime(now, 13, 50) }, now);
  const bin = makeBaby('baby-bin', 'Bin', '2 tháng tuổi');
  addEvent(bin.tracking, { type: 'diaper', diaper: 'wet', startedAt: atTime(now, 14) }, now);
  return {
    userId: 'demo-you', familyId: 'family-may', babyId: may.id, sequence: 0,
    lastBaby: { 'family-may': may.id, 'family-bin': bin.id },
    families: [
      { id: 'family-may', name: 'Nhà của Mây', babies: [may, bong], pending: 0, lastSyncedAt: now,
        members: [{ userId: 'demo-you', name: 'Bạn', role: 'owner' }, { userId: 'demo-partner', name: 'Bố', role: 'caregiver' }] },
      { id: 'family-bin', name: 'Nhà của Bin', babies: [bin], pending: 0, lastSyncedAt: now,
        members: [{ userId: 'demo-parent-bin', name: 'Mẹ Bin', role: 'owner' }, { userId: 'demo-you', name: 'Bạn', role: 'caregiver' }] },
    ],
  };
}