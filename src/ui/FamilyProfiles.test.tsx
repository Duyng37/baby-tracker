import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { LocalStore } from '../data/store';
import { FamilyProfiles } from './FamilyProfiles';
import { RenameProfile } from './RenameProfile';

vi.mock('../cloud/supabase', () => ({ authenticatedTransport: vi.fn() }));
const family = { id: 'family', name: 'Nhà của Bông', timezone: 'Asia/Ho_Chi_Minh', sync_cursor: '0' };
const babies = [{ id: 'baby', family_id: 'family', nickname: 'Bông', birth_date: null },
  { id: 'sibling', family_id: 'family', nickname: 'Mít', birth_date: null },
  { id: 'other', family_id: 'other', nickname: 'FOREIGN', birth_date: null }];
const render = (owner = true, canEdit = true) => renderToStaticMarkup(
  <FamilyProfiles family={family} babies={babies} owner={owner} canEdit={canEdit} memberCount={2} onRename={() => {}} />);
it('offers rename actions for the family and each scoped baby, including siblings', () => {
  const html = render();
  expect(html).toMatch(/<button[^>]*class="icon-button profile-rename"[^>]*aria-label="Đổi tên gia đình Nhà của Bông"[^>]*><svg/);
  expect(html).toContain('aria-label="Đổi tên bé Bông"');
  expect(html).toContain('aria-label="Đổi tên bé Mít"');
  expect(html).not.toContain('FOREIGN');
  expect(html).toContain('2 thành viên');
});
it('keeps names visible to caregivers without exposing owner actions', () => {
  const html = render(false);
  expect(html).toContain('Người chăm sóc');
  expect(html).toContain('Bông');
  expect(html).toContain('Mít');
  expect(html).not.toContain('<button');
});
it('disables all rename actions offline or without a verified session', () => {
  const html = render(true, false);
  expect(html.match(/<button[^>]*disabled/g)).toHaveLength(3);
  expect(html).toContain('Kết nối mạng và xác nhận phiên');
});
it.each(['family', 'baby'] as const)('prefills a labelled %s rename form without altering the saved name', type => {
  const html = renderToStaticMarkup(<RenameProfile store={{} as LocalStore}
    target={type === 'family' ? { type, familyId: 'family', name: 'Old name' } : { type, familyId: 'family', babyId: 'baby', name: 'Old name' }} onDone={() => {}} />);
  expect(html).toContain(type === 'family' ? 'Tên gia đình' : 'Tên gọi của bé');
  expect(html).toContain('value="Old name"');
  expect(html).toContain('maxLength="80"');
  expect(html).toMatch(/<button[^>]*disabled[^>]*>Lưu tên mới/);
  expect(html).toContain('không làm mất nhật ký');
});