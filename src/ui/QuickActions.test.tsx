import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { QuickActions } from './QuickActions';

afterEach(() => vi.unstubAllGlobals());
const render = () => renderToStaticMarkup(<QuickActions babyName="Bông" running={[]} saving={false} onAction={() => {}} />);
it('starts expanded with descriptions and an accessible collapse toggle', () => {
  const html = render();
  expect(html).toContain('data-collapsed="false"');
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain('aria-controls=');
  expect(html).toContain('aria-label="Thu gọn Ghi nhận nhanh"');
  expect(html).toContain('Ghi lượng sữa của con');
});
it('restores icon-only mode while retaining accessible names for all actions', () => {
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => key === 'noi:quick-collapsed' ? 'true' : null } });
  const html = render();
  expect(html).toContain('data-collapsed="true"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('aria-label="Mở rộng Ghi nhận nhanh"');
  const actions = [...html.matchAll(/<button class="quick-button"[^>]*>(.*?)<\/button>/g)];
  expect(actions).toHaveLength(4);
  for (const label of ['Bú mẹ', 'Bình sữa', 'Thay tã', 'Ngủ']) expect(html).toContain(`aria-label="${label}"`);
  for (const [, content] of actions) { expect(content).toContain('<svg'); expect(content).not.toContain('<span'); }
});
it('remains usable when preference storage is unavailable', () => {
  vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('blocked'); } } });
  expect(render()).toContain('data-collapsed="false"');
});