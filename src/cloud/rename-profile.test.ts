import { beforeEach, expect, it, vi } from 'vitest';
import { authenticatedTransport } from './supabase';
import { renameProfile, type RenameTarget } from './rename-profile';
import type { LocalStore } from '../data/store';
import type { Workspace } from '../domain/types';
import { CloudError } from '../sync/engine';

vi.mock('./supabase', () => ({ authenticatedTransport: vi.fn() }));
const family: RenameTarget = { type: 'family', familyId: 'family', name: 'Old family' };
const baby: RenameTarget = { type: 'baby', familyId: 'family', babyId: 'baby', name: 'Old baby' };
let workspace: Workspace;
let store: LocalStore;
const rpc = vi.fn();
const refreshed = vi.fn();
const saveWorkspace = vi.fn();
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.resetAllMocks();
  workspace = { families: [{ id: 'family', name: 'Old family', timezone: 'Asia/Ho_Chi_Minh', sync_cursor: '0' }],
    babies: [{ id: 'baby', family_id: 'family', nickname: 'Old baby', birth_date: null }],
    memberships: [{ family_id: 'family', user_id: 'owner', role: 'owner' }] };
  store = { db: { userId: 'owner' }, workspace: vi.fn(async () => workspace), saveWorkspace } as unknown as LocalStore;
  rpc.mockResolvedValue({ status: 'updated' });
  refreshed.mockResolvedValue({ ...workspace, families: [{ ...workspace.families[0], name: 'New family' }] });
  saveWorkspace.mockResolvedValue(undefined);
  vi.mocked(authenticatedTransport).mockResolvedValue({ rpc, workspace: refreshed } as unknown as Awaited<ReturnType<typeof authenticatedTransport>>);
});
it.each([family, baby])('renames $type with the original name and refreshes confirmed metadata', async target => {
  const abort = signal();
  await renameProfile(store, target, '  New name  ', abort);
  expect(authenticatedTransport).toHaveBeenCalledExactlyOnceWith('owner');
  expect(rpc).toHaveBeenCalledExactlyOnceWith(target.type === 'family' ? 'rename_family' : 'rename_baby', target.type === 'family'
    ? { p_family_id: 'family', p_name: 'New name', p_expected_name: 'Old family' }
    : { p_family_id: 'family', p_baby_id: 'baby', p_nickname: 'New name', p_expected_nickname: 'Old baby' }, abort);
  expect(refreshed).toHaveBeenCalledExactlyOnceWith(abort);
  expect(saveWorkspace).toHaveBeenCalledExactlyOnceWith(await refreshed.mock.results[0].value);
});
it.each(['', '   ', '\t\n', 'x'.repeat(81)])('rejects an invalid name without networking', async name => {
  await expect(renameProfile(store, family, name, signal())).rejects.toThrow('1 đến 80');
  expect(authenticatedTransport).not.toHaveBeenCalled();
});
it('allows names up to the backend character limit', async () => {
  await expect(renameProfile(store, family, 'x'.repeat(80), signal())).resolves.toBeUndefined();
});
it('does not use another membership or a caregiver role to permit editing', async () => {
  workspace.memberships[0].role = 'caregiver';
  workspace.memberships.push({ family_id: 'family', user_id: 'someone-else', role: 'owner' });
  await expect(renameProfile(store, family, 'New', signal())).rejects.toThrow('Chỉ chủ gia đình');
  expect(authenticatedTransport).not.toHaveBeenCalled();
});
it('rejects a family or baby outside the current workspace scope', async () => {
  await expect(renameProfile(store, { ...family, familyId: 'other' }, 'New', signal())).rejects.toThrow('Chỉ chủ gia đình');
  workspace.babies[0].family_id = 'other';
  await expect(renameProfile(store, baby, 'New', signal())).rejects.toThrow('không thuộc gia đình');
  expect(authenticatedTransport).not.toHaveBeenCalled();
});
it('refreshes but never overwrites the opened name after a conflict', async () => {
  rpc.mockResolvedValue({ status: 'conflict' });
  await expect(renameProfile(store, family, 'My edit', signal())).rejects.toThrow('đóng và mở lại');
  expect(saveWorkspace).toHaveBeenCalledOnce();
  expect(family.name).toBe('Old family');
  expect(rpc).toHaveBeenCalledOnce();
});
it('preserves local metadata if a remote write fails or access was revoked', async () => {
  rpc.mockRejectedValue(new CloudError('forbidden'));
  await expect(renameProfile(store, baby, 'New', signal())).rejects.toBeInstanceOf(CloudError);
  expect(saveWorkspace).not.toHaveBeenCalled();
  expect(refreshed).not.toHaveBeenCalled();
});
it('does not claim success if refreshing metadata fails after a successful write', async () => {
  refreshed.mockRejectedValue(new CloudError('retry'));
  await expect(renameProfile(store, family, 'New', signal())).rejects.toBeInstanceOf(CloudError);
  expect(saveWorkspace).not.toHaveBeenCalled();
});
it.each([null, {}, { status: 'unexpected' }])('rejects an unrecognized RPC response', async result => {
  rpc.mockResolvedValue(result);
  await expect(renameProfile(store, family, 'New', signal())).rejects.toThrow('Chưa xác nhận');
  expect(saveWorkspace).not.toHaveBeenCalled();
});
it('does not send after the form closes during authentication', async () => {
  const controller = new AbortController();
  vi.mocked(authenticatedTransport).mockImplementation(async () => {
    controller.abort(); return { rpc, workspace: refreshed } as unknown as Awaited<ReturnType<typeof authenticatedTransport>>;
  });
  await expect(renameProfile(store, family, 'New', controller.signal)).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
it('does not save a late workspace response after closing the form', async () => {
  const controller = new AbortController();
  refreshed.mockImplementation(async () => { controller.abort(); return workspace; });
  await expect(renameProfile(store, family, 'New', controller.signal)).rejects.toThrow();
  expect(saveWorkspace).not.toHaveBeenCalled();
});