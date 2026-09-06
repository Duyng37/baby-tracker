import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LocalStore } from '../data/store';
import type { StoreView } from '../data/useStore';
import type { LocalEvent } from '../domain/types';
import type { InstallState } from '../pwa/install';

let current: StoreView;
let installation: InstallState;
let online = true;
let busy = false;
let message = '';
let familyScreen = false;
let journalScreen = false;
let careScreen = false;
// SSR contract tests can inspect Family without needing a browser or changing app defaults.
vi.mock('react', async original => {
  const react = await original<typeof import('react')>();
  return { ...react, useState: (initial: unknown) => react.useState(initial === 'today' ? (familyScreen ? 'family' : journalScreen ? 'journal' : careScreen ? 'care' : initial) : initial) };
});
vi.mock('../data/useStore', () => ({ useStore: () => current }));
vi.mock('../sync/useSync', () => ({ useSync: () => ({ online, busy, message, kick: vi.fn() }) }));
vi.mock('../pwa/useInstall', () => ({ useInstall: () => installation }));
vi.mock('../cloud/supabase', () => ({ signOut: vi.fn(), authenticatedTransport: vi.fn() }));
import { Tracker } from './Tracker';
import { ThemeProvider } from './theme';
import { Icon } from './Icon';
import { pendingInvitationKey } from './invitation-link';

const store = { db: { userId: 'test-owner' } } as LocalStore;
const at = '2026-09-05T08:00:00.000Z';
const bottle: LocalEvent = { id: 'event', family_id: 'family', baby_id: 'baby', server: null, version: 1,
  body: { type: 'bottle', started_at: at, ended_at: null, note: 'Ghi nhận thử', deleted: false, payload: { amount_ml: 90, milk: 'formula' } } };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T09:00:00.000Z'));
  online = true; busy = false; message = ''; familyScreen = false; journalScreen = false; careScreen = false;
  installation = { platform: { kind: 'android', mobile: true, embedded: false }, installed: false, canPrompt: false, busy: false, dismissedUntil: 0 };
  current = { ready: true, error: false, events: [], operations: [], lastContact: null,
    workspace: { families: [{ id: 'family', name: 'Nhà của Bông', timezone: 'Asia/Ho_Chi_Minh', sync_cursor: '0' }],
      babies: [{ id: 'baby', family_id: 'family', nickname: 'Bông', birth_date: null }],
      memberships: [{ family_id: 'family', user_id: 'test-owner', role: 'owner' }] } };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const render = () => renderToStaticMarkup(<ThemeProvider><Tracker store={store} /></ThemeProvider>);
const syncButton = (html: string) => html.match(/<button class="icon-button sync-button"[^>]*>[\s\S]*?<\/button>/)![0];

it('renders four navigation destinations in order, labelled quick actions and a focusable main', () => {
  const html = render();
  expect(html).toContain('aria-label="Điều hướng chính"');
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  const nav = html.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)![0];
  const destinations = [...nav.matchAll(/<\/svg>([^<]+)<\/button>/g)].map(match => match[1]);
  expect(destinations).toEqual(['Hôm nay', 'Nhật ký', 'Chăm con', 'Gia đình']);
  expect(html).not.toContain('Tổng quan</button>');
  expect(html).toContain('role="group" aria-label="Ghi nhanh cho Bông"');
  expect(html).toContain('tabindex="-1"');
  expect(html).toContain('aria-label="Đổi bé, đang chọn Bông"');
  expect(html).toContain('Một khoảng trống nhỏ');
});
it('opens the join sheet with a pending one-tap invitation already filled', () => {
  const token = 'b76cdf28e2e642759ff8462855819e76ee7714bd44b741d2b24a47ced8f82ee0';
  const values = new Map([[pendingInvitationKey, token]]);
  vi.stubGlobal('window', {
    sessionStorage: { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key) },
    localStorage: { getItem: () => null }, matchMedia: () => ({ matches: false }),
  });
  const html = render();
  expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*>Tham gia gia đình<\/h2>/);
  expect(html).toContain('Tham gia gia đình');
  expect(html).toContain(`value="${token}"`);
  expect(html).toContain('Mã mời đã được điền từ liên kết');
  expect(values.has(pendingInvitationKey)).toBe(false);
});
it('offers installation on Today, including local-only access, and keeps a permanent Family entry after postponing', () => {
  expect(render()).toContain('aria-label="Mở Nôi nhanh hơn"');
  expect(render().indexOf('Mở Nôi nhanh hơn')).toBeLessThan(render().indexOf('Nhịp hôm nay'));
  expect(renderToStaticMarkup(<ThemeProvider><Tracker store={store} localOnly /></ThemeProvider>)).toContain('Thêm vào màn hình chính');
  installation.dismissedUntil = Date.now() + 1000;
  expect(render()).not.toContain('aria-label="Mở Nôi nhanh hơn"');
  familyScreen = true; online = false;
  const html = renderToStaticMarkup(<ThemeProvider><Tracker store={store} localOnly /></ThemeProvider>);
  const row = [...html.matchAll(/<button[^>]*class="setting-row"[^>]*>[\s\S]*?<\/button>/g)]
    .map(match => match[0]).find(button => button.includes('Thêm vào màn hình chính'));
  expect(row).toBeDefined();
  expect(row).not.toContain('disabled');
  expect(html).not.toContain('aria-label="Mở Nôi nhanh hơn"');
  installation.installed = true;
  expect(render()).not.toContain('Thêm vào màn hình chính');
});
it('does not put the install invitation on Journal or Care', () => {
  journalScreen = true; expect(render()).not.toContain('Mở Nôi nhanh hơn');
  journalScreen = false; careScreen = true; expect(render()).not.toContain('Mở Nôi nhanh hơn');
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
it('merges the overview above the journal on the journal screen', () => {
  journalScreen = true;
  current.events = [bottle];
  const html = render();
  expect(html).toContain('aria-label="Ngày hôm nay"');
  expect(html).toContain('<h2>Ngày hôm nay</h2>');
  expect(html).not.toContain('24 giờ qua');
  expect(html).toContain('90 <span>ml</span>');
  expect(html.indexOf('Ngày hôm nay')).toBeLessThan(html.indexOf('Nhật ký · Bông'));
  expect(html).toContain('7 ngày gần nhất');
});
it.each(['today', 'journal'])('uses the family calendar day for both totals and entries on %s', screen => {
  journalScreen = screen === 'journal';
  vi.setSystemTime(new Date('2026-09-05T18:30:00Z')); // September 6 in the family timezone.
  current.events = [bottle, { ...bottle, id: 'today', body: { ...bottle.body, started_at: '2026-09-05T17:00:00Z', note: 'LOCAL_TODAY' } }];
  const html = render();
  expect(html).toContain('aria-label="Ngày hôm nay"');
  expect(html).toContain('<h2>Ngày hôm nay</h2>');
  expect(html).not.toContain('24 giờ qua');
  expect(html).toContain('90 <span>ml</span>');
  expect(html).toContain('LOCAL_TODAY');
  expect(html).not.toContain('Ghi nhận thử');
  expect(html).toContain('Tính theo múi giờ gia đình');
});
it('clips overnight sleep and breastfeeding totals to today while keeping the timers running', () => {
  vi.setSystemTime(new Date('2026-09-05T18:30:00Z'));
  const started_at = '2026-09-05T16:00:00Z'; // 23:00 yesterday, now 01:30 today.
  current.events = [
    { ...bottle, id: 'sleep', body: { ...bottle.body, type: 'sleep', started_at, payload: {} } },
    { ...bottle, id: 'breast', body: { ...bottle.body, type: 'breast', started_at,
      payload: { segments: [{ side: 'left', started_at, ended_at: null }] } } },
  ];
  const html = render();
  const metrics = html.match(/<div class="stats">[\s\S]*?<\/div>/)![0];
  expect(metrics.match(/1 giờ 30 phút/g)).toHaveLength(2);
  expect(metrics).not.toContain('2 giờ 30 phút');
  expect(html).toContain('Đang chạy');
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
it('moves vaccination to Care for the selected baby, including local-only caregivers', () => {
  const vaccination: LocalEvent = { ...bottle, body: { ...bottle.body, type: 'vaccination',
    payload: { vaccine: 'Vắc-xin của Bông', dose: 'Mũi 1', status: 'planned', location: '' } } };
  current.events = [vaccination, { ...vaccination, id: 'foreign', baby_id: 'sibling', body: { ...vaccination.body, note: 'FOREIGN_VACCINATION' } }];
  expect(render()).not.toContain('Lịch tiêm chủng');
  familyScreen = true;
  expect(render()).not.toContain('Lịch tiêm chủng');
  familyScreen = false; careScreen = true; online = false; current.workspace.memberships[0].role = 'caregiver';
  const html = renderToStaticMarkup(<ThemeProvider><Tracker store={store} localOnly /></ThemeProvider>);
  expect(html).toContain('Lịch tiêm chủng'); expect(html).toContain('Vắc-xin của Bông');
  expect(html).not.toContain('FOREIGN_VACCINATION');
  expect(html).toContain('Lên lịch tiêm'); expect(html).toContain('Ghi mũi đã tiêm');
  const schedule = html.match(/<article[^>]*vaccination-schedule[\s\S]*?<\/article>/)![0];
  expect(schedule).not.toContain('disabled');
});

it('shows all requested care actions and scopes medication to the selected baby', () => {
  careScreen = true;
  const medication: LocalEvent = { ...bottle, body: { ...bottle.body, type: 'medication', payload: { name: 'Thuốc thử', dose: '', status: 'planned' } } };
  current.events = [medication, { ...medication, id: 'foreign', baby_id: 'sibling', body: { ...medication.body, note: 'FOREIGN_MEDICATION' } }];
  const html = render();
  for (const label of ['Bú mẹ', 'Bình sữa', 'Thay tã', 'Ngủ', 'Lịch uống thuốc', 'Ăn uống', 'Chiều cao, cân nặng',
    'Tắm', 'Tummy time (nằm sấp)', 'Ngoài trời (Outdoor)', 'Trong nhà (Indoor)', 'Đánh răng']) expect(html).toContain(label);
  expect(html).toContain('<h1>Chăm con</h1>'); expect(html).toContain('Thuốc thử');
  expect(html).not.toContain('FOREIGN_MEDICATION'); expect(html).not.toContain('<h2>Ngày hôm nay</h2>');
});