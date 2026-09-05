import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LocalStore } from '../data/store';
import type { StoreView } from '../data/useStore';
import type { LocalEvent } from '../domain/types';

let current: StoreView;
let online = true;
let busy = false;
let message = '';
vi.mock('../data/useStore', () => ({ useStore: () => current }));
vi.mock('../sync/useSync', () => ({ useSync: () => ({ online, busy, message, kick: vi.fn() }) }));
vi.mock('../cloud/supabase', () => ({ signOut: vi.fn(), authenticatedTransport: vi.fn() }));
import { Tracker } from './Tracker';
import { ThemeProvider } from './theme';

const store = { db: { userId: 'test-owner' } } as LocalStore;
const at = '2026-09-05T08:00:00.000Z';
const bottle: LocalEvent = { id: 'event', family_id: 'family', baby_id: 'baby', server: null, version: 1,
  body: { type: 'bottle', started_at: at, ended_at: null, note: 'Ghi nhận thử', deleted: false, payload: { amount_ml: 90, milk: 'formula' } } };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T09:00:00.000Z'));
  online = true; busy = false; message = '';
  current = { ready: true, error: false, events: [], operations: [], lastContact: null,
    workspace: { families: [{ id: 'family', name: 'Nhà của Bông', timezone: 'Asia/Ho_Chi_Minh', sync_cursor: '0' }],
      babies: [{ id: 'baby', family_id: 'family', nickname: 'Bông', birth_date: null }],
      memberships: [{ family_id: 'family', user_id: 'test-owner', role: 'owner' }] } };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const render = () => renderToStaticMarkup(<ThemeProvider><Tracker store={store} /></ThemeProvider>);

it('renders four navigation destinations, labelled quick actions and a focusable main', () => {
  const html = render();
  expect(html).toContain('aria-label="Điều hướng chính"');
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  for (const label of ['Hôm nay', 'Nhật ký', 'Tổng quan', 'Gia đình']) expect(html).toContain(label);
  expect(html).toContain('role="group" aria-label="Ghi nhanh cho Bông"');
  expect(html).toContain('tabindex="-1"');
  expect(html).toContain('aria-label="Đổi bé, đang chọn Bông"');
  expect(html).toContain('Một khoảng trống nhỏ');
});
it('renders the dark-mode toggle consistently with a saved device preference', () => {
  vi.stubGlobal('window', { localStorage: { getItem: () => 'dark' }, matchMedia: () => ({ matches: false }) });
  expect(render()).toContain('aria-label="Bật chế độ sáng"');
});
it('uses renamed workspace names in the header, picker trigger and quick actions', () => {
  current.workspace.families[0].name = 'Tên gia đình mới';
  current.workspace.babies[0].nickname = 'Tên bé mới';
  const html = render();
  expect(html).toContain('Tên gia đình mới');
  expect(html).toContain('aria-label="Đổi bé, đang chọn Tên bé mới"');
  expect(html).toContain('aria-label="Ghi nhanh cho Tên bé mới"');
  expect(html).not.toContain('Nhà của Bông');
});
it('shows only the selected baby journal/metrics and escapes user content', () => {
  current.events = [bottle, { ...bottle, id: 'foreign', baby_id: 'another-baby', body: { ...bottle.body, note: 'OTHER_BABY_NOTE' } }];
  current.workspace.babies[0].nickname = '<script>test</script>';
  const html = render();
  expect(html).toContain('Ghi nhận thử');
  expect(html).not.toContain('OTHER_BABY_NOTE');
  expect(html).toContain('90 <span>ml</span>');
  expect(html).not.toContain('<script>');
});
it('describes the action correctly when breastfeeding/sleep timers are active', () => {
  current.events = [{ ...bottle, id: 'sleep', body: { ...bottle.body, type: 'sleep', payload: {} } },
    { ...bottle, id: 'breast', body: { ...bottle.body, type: 'breast', payload: { segments: [{ side: 'left', started_at: at, ended_at: null }] } } }];
  const html = render();
  expect(html).toContain('Kết thúc bú');
  expect(html).toContain('Đã thức');
  expect(html.match(/data-running="true"/g)).toHaveLength(2);
  expect(html).toContain('Đang chạy');
  expect(html).toContain('bên trái');
});
it('keeps offline state truthful while leaving local quick actions available', () => {
  online = false;
  const html = render();
  expect(html).toContain('data-offline="true"');
  expect(html).toContain('Offline · ghi trên máy vẫn hoạt động');
  expect(html).not.toMatch(/class="quick-button"[^>]*disabled/);
  expect(html).not.toContain('Đã đồng bộ');
});
it('keeps onboarding separate from quick recording when there is no baby', () => {
  current.workspace = { families: [], babies: [], memberships: [] };
  const html = render();
  expect(html).toContain('Gia đình của bạn');
  expect(html).toContain('Tên gọi của bé');
  expect(html).not.toContain('<footer');
});
it('retains explicit loading and device storage error states', () => {
  current.ready = false;
  expect(render()).toContain('Đang mở dữ liệu trên thiết bị');
  current.ready = true; current.error = true;
  expect(render()).toContain('Chưa mở được bộ nhớ thiết bị');
  expect(render()).not.toContain('<footer');
});
it('local-only access never claims cloud verification and keeps quick recording available', () => {
  const html = renderToStaticMarkup(<ThemeProvider><Tracker store={store} localOnly /></ThemeProvider>);
  expect(html).toContain('Chỉ trên thiết bị · chưa xác nhận phiên cloud');
  expect(html).toContain('Kiểm tra phiên');
  expect(html).not.toMatch(/class="quick-button"[^>]*disabled/);
  expect(html).not.toContain('Đã đồng bộ lần gần nhất');
});
it('does not offer offline onboarding when the account has no cached workspace', () => {
  current.workspace = { families: [], babies: [], memberships: [] };
  const html = renderToStaticMarkup(<ThemeProvider><Tracker store={store} localOnly /></ThemeProvider>);
  expect(html).toContain('Chưa có hồ sơ khả dụng trên máy');
  expect(html).not.toContain('Tên gọi của bé');
  expect(html).toContain('Sao lưu và khôi phục');
});
it('places the icon-only sync control in the header instead of a separate status bar', () => {
  current.lastContact = Date.parse(at);
  const html = render();
  const header = html.match(/<header[^>]*>(.*?)<\/header>/)![1];
  const button = header.match(/<button class="icon-button sync-button"[^>]*>(.*?)<\/button>/)![1];
  expect(button).toContain('<svg');
  expect(button).not.toContain('<span');
  expect(header).toContain('Đã đồng bộ lần gần nhất · 15:00');
  expect(header).toContain('Thử đồng bộ');
  expect(header).toContain('role="status"');
  expect(html).not.toContain('sync-bar');
});
it('retains an accessible pending-sync label without claiming success', () => {
  current.operations = [{ family_id: 'family', baby_id: 'baby', operation_id: 'op', event_id: 'event', body: bottle.body, base_revision: null, depends_on: null }];
  const html = render();
  expect(html).toContain('1 thay đổi chờ cloud');
  expect(html).not.toContain('Đã đồng bộ lần gần nhất');
});
it('disables retry while syncing and exposes errors instead of a success state', () => {
  busy = true;
  expect(render()).toMatch(/class="icon-button sync-button"[^>]*data-busy="true"[^>]*disabled/);
  expect(render()).toContain('Đang đồng bộ…');
  busy = false; message = 'Cần thử lại';
  const html = render();
  expect(html).toContain('data-warning="true"');
  expect(html).toContain('Chưa hoàn tất đồng bộ');
  expect(html).toContain('Cần thử lại');
});