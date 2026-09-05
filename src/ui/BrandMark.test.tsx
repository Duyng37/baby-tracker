import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { brandGlyphPoints } from '../brand/mark';
import { BrandMark } from './BrandMark';
import { LoadingScreen } from './LoadingScreen';

it('uses the same font-independent letter outline as the PWA rasterizer', () => {
  const html = renderToStaticMarkup(<BrandMark />);
  expect(html).toContain('class="brand-mark" aria-hidden="true"');
  expect(html).toContain('viewBox="0 0 100 100" fill="currentColor"');
  expect(html).toContain('focusable="false"');
  expect(html).toContain(`<polygon points="${brandGlyphPoints}">`);
  expect(html).not.toContain('<text');
  expect(html).not.toContain('<img');
});
it('shares the same mark with the startup splash while preserving its size class', () => {
  const mark = renderToStaticMarkup(<BrandMark className="loading-mark" />);
  expect(mark).toContain('class="brand-mark loading-mark"');
  expect(renderToStaticMarkup(<LoadingScreen detail="Đang mở dữ liệu…" />)).toContain(mark);
});