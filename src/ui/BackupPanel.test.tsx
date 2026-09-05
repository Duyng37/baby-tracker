import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { BackupPanel, BackupReport } from './BackupPanel';
import { OfflineSettings } from './OfflineSettings';
import type { LocalStore } from '../data/store';

it('describes the plaintext export and insert-only restore before asking for a file', () => {
  const html = renderToStaticMarkup(<BackupPanel store={{} as LocalStore} localOnly={false} onRestored={() => {}} />);
  expect(html).toContain('không được mã hóa'); expect(html).toContain('Không chứa token/cookie');
  expect(html).toContain('không ghi đè'); expect(html).toContain('đúng tài khoản/project');
  expect(html).toContain('type="file"'); expect(html).toContain('accept=".json,application/json"');
  expect(html).not.toContain('href="blob:');
});
it('explains that export stays available while restore needs a verified cloud session', () => {
  const html = renderToStaticMarkup(<BackupPanel store={{} as LocalStore} localOnly onRestored={() => {}} />);
  expect(html).toContain('Bạn vẫn xuất được bản sao lưu'); expect(html).toContain('xác nhận lại phiên');
  expect(html).toContain('Chuẩn bị tệp sao lưu');
});
it('shows all reasons for skipping records in an accessible definition list', () => {
  const html = renderToStaticMarkup(<BackupReport report={{ added: 5, identical: 4, different: 3, unavailable: 2, deleted: 1, running: 6 }} />);
  expect(html.match(/<dt>/g)).toHaveLength(6);
  expect(html).toContain('giữ bản hiện tại'); expect(html).toContain('không khởi động lại');
});
it('keeps the offline/storage limitations visible rather than promising permanent storage', () => {
  const html = renderToStaticMarkup(<OfflineSettings />);
  expect(html).toContain('chính trình duyệt/PWA này'); expect(html).toContain('Trình duyệt vẫn có thể mất dữ liệu');
  expect(html).toContain('Ưu tiên giữ dữ liệu trên máy');
});