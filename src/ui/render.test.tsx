import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
const config = vi.hoisted(() => ({ configured: false }));
vi.mock('../cloud/supabase', () => ({ get configured() { return config.configured; }, projectId: 'unconfigured', signIn: vi.fn(), getSession: vi.fn(), authEvents: new EventTarget() }));
import { App } from '../App';
import { Sheet } from './Sheet';

beforeEach(() => { config.configured = false; });

it('missing configuration clearly states cloud is not connected, never shows demo success', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('Chưa có cấu hình Supabase hợp lệ');
  expect(html).not.toContain('Đã đồng bộ');
});
it('shows the shared startup splash while restoring the device session', () => {
  config.configured = true;
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('class="loading-screen"');
  expect(html).toContain('Đang mở nhật ký…');
  expect(html).toContain('class="icon spinner ');
  expect(html).toContain('role="status"');
  expect(html).not.toContain('class="welcome"');
  expect(html).not.toContain('Tiếp tục với Google');
});
it('sheets have an accessible title and escape user content', () => {
  const html = renderToStaticMarkup(<Sheet title="Ghi cho bé" onClose={() => {}}><p>{'<script>alert(1)</script>'}</p></Sheet>);
  expect(html).toContain('aria-labelledby'); expect(html).toContain('aria-label="Đóng"');
  expect(html).not.toContain('<script>');
  expect(html).toContain('class="sheet-handle" aria-hidden="true"');
  expect(html).toContain('tabindex="-1"');
  expect(html).toContain('class="sheet-content"');
});