import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LocalStore } from '../data/store';
import type { StoreView } from '../data/useStore';
import type { LocalEvent } from '../domain/types';

let current: StoreView;
let online = true;
let busy = false;
let message = '';
let familyScreen = false;
let journalScreen = false;
// SSR contract tests can inspect Family without needing a browser or changing app defaults.
vi.mock('react', async original => {
  const react = await original<typeof import('react')>();
  return { ...react, useState: (initial: unknown) => react.useState(initial === 'today' ? (familyScreen ? 'family' : journalScreen ? 'journal' : initial) : initial) };
});
vi.mock('../data/useStore', () => ({ useStore: () => current }));
vi.mock('../sync/useSync', () => ({ useSync: () => ({ online, busy, message, kick: vi.fn() }) }));
vi.mock('../cloud/supabase', () => ({ signOut: vi.fn(), authenticatedTransport: vi.fn() }));
import { Tracker } from './Tracker';
import { ThemeProvider } from './theme';
import { Icon } from './Icon';

const store = { db: { userId: 'test-owner' } } as LocalStore;
const at = '2026-09-05T08:00:00.000Z';
const bottle: LocalEvent = { id: 'event', family_id: 'family', baby_id: 'baby', server: null, version: 1,
  body: { type: 'bottle', started_at: at, ended_at: null, note: 'Ghi nhận thử', deleted: false, payload: { amount_ml: 90, milk: 'formula' } } };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T09:00:00.000Z'));
  online = true; busy = false; message = ''; familyScreen = false; journalScreen = false;
  current = { ready: true, error: false, events: [], operations: [], lastContact: null,
    workspace: { families: [{ id: 'family', name: 'Nhà của Bông', timezone: 'Asia/Ho_Chi_Minh', sync_cursor: '0' }],
      babies: [{ id: 'baby', family_id: 'family', nickname: 'Bông', birth_date: null }],
      memberships: [{ family_id: 'family', user_id: 'test-owner', role: 'owner' }] } };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const render = () => renderToStaticMarkup(<ThemeProvider><Tracker store={store} /></ThemeProvider>);
const syncButton = (html: string) => html.match(/<button class="icon-button sync-button"[^>]*>[\s\S]*?<\/button>/)![0];

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
it('shows a compact dd/mm/yyyy date beside the activity filter using the family timezone', () => {
  journalScreen = true;
  vi.setSystemTime(new Date('2026-09-05T18:30:00.000Z'));
  const html = render();
  expect(html).toMatch(/class="[^"]*journal-date-text"[^>]*type="text"[^>]*value="06\/09\/2026"/);
  expect(html).toContain('aria-label="Mở lịch"');
  expect(html).toContain('<label>Hoạt động<select');
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
  expect(render()).toContain('class="loading-screen"');
  expect(render()).toContain('class="icon spinner ');
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
  expect(syncButton(html)).toContain(renderToStaticMarkup(<Icon name="cloud" />));
});
it('retains an accessible pending-sync label without claiming success', () => {
  current.operations = [{ family_id: 'family', baby_id: 'baby', operation_id: 'op', event_id: 'event', body: bottle.body, base_revision: null, depends_on: null }];
  const html = render();
  expect(html).toContain('1 thay đổi chờ cloud');
  expect(html).not.toContain('Đã đồng bộ lần gần nhất');
  expect(syncButton(html)).toContain(renderToStaticMarkup(<Icon name="swap" />));
  expect(syncButton(html)).not.toContain('spinner');
});
it('disables retry while syncing and exposes errors instead of a success state', () => {
  busy = true;
  expect(render()).toMatch(/class="icon-button sync-button"[^>]*data-busy="true"[^>]*disabled/);
  expect(render()).toContain('Đang đồng bộ…');
  expect(syncButton(render())).toContain('aria-busy="true"');
  expect(syncButton(render())).toContain(renderToStaticMarkup(<Icon name="loading" />));
  expect(syncButton(render())).not.toContain(renderToStaticMarkup(<Icon name="swap" />));
  busy = false; message = 'Cần thử lại';
  const html = render();
  expect(html).toContain('data-warning="true"');
  expect(html).toContain('Chưa hoàn tất đồng bộ');
  expect(html).toContain('Cần thử lại');
  expect(syncButton(html)).toContain(renderToStaticMarkup(<Icon name="info" />));
  expect(syncButton(html)).not.toContain('spinner');
});
it('shows the spinner during retries even if an earlier error is still present', () => {
  busy = true; message = 'Cần thử lại';
  expect(syncButton(render())).toContain(renderToStaticMarkup(<Icon name="loading" />));
});
it('does not spin the offline icon when connectivity is lost during sync', () => {
  busy = true; online = false;
  const button = syncButton(render());
  expect(button).toContain(renderToStaticMarkup(<Icon name="offline" />));
  expect(button).toContain('aria-busy="false"');
  expect(button).not.toContain('spinner');
});
it('integrates the vaccination schedule only in Family for the selected baby, including local-only caregivers', () => {
  const vaccination: LocalEvent = { ...bottle, body: { ...bottle.body, type: 'vaccination',
    payload: { vaccine: 'Vắc-xin của Bông', dose: 'Mũi 1', status: 'planned', location: '' } } };
  current.events = [vaccination, { ...vaccination, id: 'foreign', baby_id: 'sibling', body: { ...vaccination.body, note: 'FOREIGN_VACCINATION' } }];
  expect(render()).not.toContain('Lịch tiêm chủng');
  familyScreen = true; online = false; current.workspace.memberships[0].role = 'caregiver';
  const html = renderToStaticMarkup(<ThemeProvider><Tracker store={store} localOnly /></ThemeProvider>);
  expect(html).toContain('Lịch tiêm chủng'); expect(html).toContain('Vắc-xin của Bông');
  expect(html).not.toContain('FOREIGN_VACCINATION');
  expect(html).toContain('Lên lịch tiêm'); expect(html).toContain('Ghi mũi đã tiêm');
  const schedule = html.match(/<article[^>]*vaccination-schedule[\s\S]*?<\/article>/)![0];
  expect(schedule).not.toContain('disabled');
});