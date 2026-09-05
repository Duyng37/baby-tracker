import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { InstallState } from '../pwa/install';
import { detectInstallPlatform, installLabel } from '../pwa/install-platform';
import { InstallCard, InstallHelp, InstallSetting } from './InstallApp';
import { Icon } from './Icon';

const state = (ua = '', touches = 0): InstallState => ({ platform: detectInstallPlatform(ua, touches), installed: false, canPrompt: false, busy: false, dismissedUntil: 0 });
const onInstall = vi.fn();
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T09:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });

it.each([
  ['Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1', 5, 'ios-safari', 'Thêm vào MH chính'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/18.0 Mobile/15 Safari/604.1', 5, 'ios-safari', 'Thêm vào MH chính'],
  ['Mozilla/5.0 (iPad) Version/18.0 Mobile Safari/604.1', 5, 'ios-safari', 'Thêm vào MH chính'],
  ['Mozilla/5.0 (iPhone) CriOS/130.0 Mobile Safari/604.1', 5, 'ios-other', 'trình duyệt hiện tại'],
  ['Mozilla/5.0 (iPhone) FxiOS/130.0 Mobile Safari/604.1', 5, 'ios-other', 'trình duyệt hiện tại'],
  ['Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36', 5, 'android', 'Cài đặt ứng dụng'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/18.0 Safari/605.1', 0, 'mac-safari', 'Thêm vào Dock'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/130.0 Safari/537.36', 0, 'desktop', 'Cài đặt trang này'],
  ['Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36 Edg/130.0', 0, 'desktop', 'Cài đặt trang này'],
  ['', 0, 'other', 'Trong trình duyệt của bạn'],
] as const)('selects appropriate help for %s', (ua, touches, kind, text) => {
  const current = state(ua, touches);
  expect(current.platform.kind).toBe(kind);
  const html = renderToStaticMarkup(<InstallHelp state={current} onInstall={onInstall} />);
  expect(html).toContain(text);
  expect(html).toContain('không thay thế sao lưu');
  expect(html).not.toContain('Nôi đã được cài');
  expect(html).not.toContain('Mở hộp thoại cài Nôi');
  if (current.platform.mobile) expect(installLabel(current.platform)).toBe('Thêm vào màn hình chính');
});
it.each(['FBAN/FBIOS', 'FBAV/500', 'Instagram', 'Zalo', 'Line/14', '; wv)'])('guides embedded %s users to an external browser first', marker => {
  const current = state(`Mozilla/5.0 (iPhone) Version/18.0 Safari/604.1 ${marker}`);
  expect(current.platform.embedded).toBe(true);
  const html = renderToStaticMarkup(<InstallHelp state={current} onInstall={onInstall} />);
  expect(html).toContain('Mở bằng trình duyệt trước'); expect(html).toContain('sao chép địa chỉ');
});
it('renders an identifiable iOS share icon alongside the textual steps', () => {
  const html = renderToStaticMarkup(<InstallHelp state={state('iPhone Version/18.0 Safari/604.1')} onInstall={onInstall} />);
  expect(html).toContain(renderToStaticMarkup(<Icon name="share" />));
  expect(html).toContain('Chia sẻ'); expect(html).toContain('Mở dưới dạng ứng dụng web');
  expect(html).not.toContain('navigator.share');
});
it('shows native installation if an event arrives while the help is open', () => {
  const current = { ...state(), canPrompt: true };
  expect(renderToStaticMarkup(<InstallHelp state={current} onInstall={onInstall} />)).toContain('Mở hộp thoại cài Nôi');
});
it('keeps help available without a native prompt and uses a desktop-specific label', () => {
  const current = state('Windows Chrome/130.0 Safari/537.36');
  const html = renderToStaticMarkup(<InstallCard state={current} onInstall={onInstall} onLater={vi.fn()} />);
  expect(html).toContain('Cài Nôi trên máy tính'); expect(html).toContain('Để sau');
  expect(html).not.toContain('disabled'); expect(html).not.toContain('PWA');
});
it('hides a snoozed card, leaves settings available and shows the card again at expiry', () => {
  const current = { ...state(), dismissedUntil: Date.now() + 1000 };
  const card = () => renderToStaticMarkup(<InstallCard state={current} onInstall={onInstall} onLater={vi.fn()} />);
  expect(card()).toBe('');
  expect(renderToStaticMarkup(<InstallSetting state={current} onInstall={onInstall} />)).toContain('setting-row');
  vi.advanceTimersByTime(1000); expect(card()).toContain('Mở Nôi nhanh hơn');
});
it('hides both entry points after confirmed installation, but an open help dialog stays truthful', () => {
  const current = { ...state(), installed: true };
  expect(renderToStaticMarkup(<InstallCard state={current} onInstall={onInstall} onLater={vi.fn()} />)).toBe('');
  expect(renderToStaticMarkup(<InstallSetting state={current} onInstall={onInstall} />)).toBe('');
  expect(renderToStaticMarkup(<InstallHelp state={current} onInstall={onInstall} />)).toContain('Bạn không cần thêm lại');
});
it('disables both entry points while waiting for the native prompt', () => {
  const current = { ...state(), busy: true };
  for (const element of [<InstallCard state={current} onInstall={onInstall} onLater={vi.fn()} />, <InstallSetting state={current} onInstall={onInstall} />]) {
    const html = renderToStaticMarkup(element);
    expect(html).toContain('disabled=""'); expect(html).toContain('aria-busy="true"');
  }
});