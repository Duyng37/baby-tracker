import { expect, it } from 'vitest';
import { bugReportUrl } from './BugReport';

it('creates a GitHub issue without including family or journal data', () => {
  const url = new URL(bugReportUrl('Không lưu được bình sữa', {
    userAgent: 'Test Browser 1.0', online: false, installed: true,
  }));
  expect(`${url.origin}${url.pathname}`).toBe('https://github.com/Duyng37/baby-tracker/issues/new');
  expect(url.searchParams.get('title')).toBe('[Báo lỗi app] ');
  expect(url.searchParams.get('body')).toContain('Không lưu được bình sữa');
  expect(url.searchParams.get('body')).toContain('Test Browser 1.0\n- Kết nối: Offline\n- Chế độ: Ứng dụng đã cài');
});