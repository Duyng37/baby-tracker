import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('../cloud/supabase', () => ({ configured: false, projectId: 'unconfigured', signIn: vi.fn(), getSession: vi.fn(), authEvents: new EventTarget() }));
import { App } from '../App';
import { Sheet } from './Sheet';

it('missing configuration clearly states cloud is not connected, never shows demo success', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('Chưa có cấu hình Supabase hợp lệ');
  expect(html).not.toContain('Đã đồng bộ');
});
it('sheets have an accessible title and escape user content', () => {
  const html = renderToStaticMarkup(<Sheet title="Ghi cho bé" onClose={() => {}}><p>{'<script>alert(1)</script>'}</p></Sheet>);
  expect(html).toContain('aria-labelledby'); expect(html).toContain('aria-label="Đóng"');
  expect(html).not.toContain('<script>');
});