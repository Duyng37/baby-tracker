import { authenticatedTransport } from './supabase';
import type { LocalStore } from '../data/store';
import { DataError } from '../domain/events';

export type RenameTarget = { type: 'family'; familyId: string; name: string }
  | { type: 'baby'; familyId: string; babyId: string; name: string };

export async function renameProfile(store: LocalStore, target: RenameTarget, name: string, signal: AbortSignal) {
  const next = name.trim();
  if (!next || [...next].length > 80) throw new DataError('Tên cần từ 1 đến 80 ký tự, không chỉ gồm khoảng trắng.');
  signal.throwIfAborted();
  const workspace = await store.workspace();
  signal.throwIfAborted();
  if (!workspace.families.some(family => family.id === target.familyId)
    || !workspace.memberships.some(member => member.family_id === target.familyId && member.user_id === store.db.userId && member.role === 'owner')) {
    throw new DataError('Chỉ chủ gia đình mới có thể đổi tên hồ sơ.');
  }
  if (target.type === 'baby' && !workspace.babies.some(baby => baby.id === target.babyId && baby.family_id === target.familyId)) {
    throw new DataError('Bé không thuộc gia đình này. Vui lòng mở lại hồ sơ.');
  }
  // The backend rechecks owner membership and the original name atomically.
  const api = await authenticatedTransport(store.db.userId);
  signal.throwIfAborted();
  const result = await api.rpc(target.type === 'family' ? 'rename_family' : 'rename_baby', target.type === 'family'
    ? { p_family_id: target.familyId, p_name: next, p_expected_name: target.name }
    : { p_family_id: target.familyId, p_baby_id: target.babyId, p_nickname: next, p_expected_nickname: target.name }, signal);
  signal.throwIfAborted();
  if (!result || typeof result !== 'object' || !('status' in result) || !['updated', 'conflict'].includes(String(result.status))) {
    throw new DataError('Chưa xác nhận được kết quả đổi tên. Vui lòng thử lại.');
  }
  const latest = await api.workspace(signal);
  signal.throwIfAborted();
  await store.saveWorkspace(latest);
  signal.throwIfAborted();
  if (result.status === 'conflict') throw new DataError('Tên đã được thay đổi từ nơi khác. Hãy đóng và mở lại để sửa tên mới nhất.');
}