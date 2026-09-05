import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Icon } from './Icon';
import { LoadingScreen } from './LoadingScreen';

const details = ['Đang mở phiên trên thiết bị…', 'Đang chuẩn bị giao diện nhật ký…', 'Đang mở dữ liệu trên thiết bị…'];

it.each(details)('renders a branded, accessible loading screen for %s', detail => {
  const html = renderToStaticMarkup(<LoadingScreen detail={detail} />);
  expect(html).toContain('class="loading-screen" aria-label="Đang mở Nôi" aria-busy="true"');
  expect(html).toContain('nôi.');
  expect(html).toContain('Đang mở nhật ký…');
  expect(html).toContain('role="status" aria-atomic="true"');
  expect(html).toContain(`<span class="sr-only"> ${detail}</span>`);
  expect(html).toContain('class="icon spinner ');
  expect(html).not.toContain('<button');
  expect(html).not.toContain('class="welcome"');
});

it('keeps the visible splash identical across startup phases', () => {
  const screens = details.map(detail => renderToStaticMarkup(<LoadingScreen detail={detail} />)
    .replace(/<span class="sr-only">.*?<\/span>/, ''));
  expect(new Set(screens).size).toBe(1);
});

it('uses a decorative ring spinner and preserves caller classes', () => {
  const html = renderToStaticMarkup(<Icon name="loading" className="custom" />);
  expect(html).toContain('class="icon spinner custom"');
  expect(html).toContain('aria-hidden="true" focusable="false"');
  expect(html).toContain('<circle');
  expect(html).toContain('d="M12 3a9 9 0 0 1 9 9"');
  for (const name of ['swap', 'cloud', 'offline', 'info'] as const) {
    expect(renderToStaticMarkup(<Icon name={name} />)).not.toContain('spinner');
  }
});