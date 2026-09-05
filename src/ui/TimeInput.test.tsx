import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { parseTimeText, TimeInput } from './TimeInput';

it.each([['00:00', '00:00'], ['23:59', '23:59'], ['09:07', '09:07'], ['0937', '09:37'], ['0000', '00:00']])('parses %s into %s', (text, expected) => {
  expect(parseTimeText(text)).toBe(expected);
});
it.each(['', '9:05', '24:00', '12:60', '2360', '123', '12:', '12:3', 'aa:bb', '12:30:00', ' 12:30'])('rejects incomplete or invalid time %s', text => {
  expect(parseTimeText(text)).toBeNull();
});
it('renders a themed text field and clock trigger rather than an OS time picker', () => {
  const html = renderToStaticMarkup(<TimeInput name="time" value="09:37" onChange={() => {}} ariaLabel="Giờ" required />);
  expect(html).toContain('class="time-input-text"'); expect(html).toContain('type="text"');
  expect(html).toContain('placeholder="HH:mm"'); expect(html).toContain('inputMode="numeric"');
  expect(html).toContain('name="time" value="09:37"'); expect(html).toContain('required=""');
  expect(html).toContain('pattern="([01][0-9]|2[0-3]):[0-5][0-9]"');
  expect(html).toContain('aria-haspopup="dialog"'); expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('Mở bộ chọn giờ: Giờ'); expect(html).toContain('<svg');
  expect(html).not.toContain('type="time"'); expect(html).not.toContain('role="dialog"');
});
it('preserves blank planned fields and disables both typing and picker access while saving', () => {
  const html = renderToStaticMarkup(<TimeInput value="" onChange={() => {}} ariaLabel="Giờ" required disabled />);
  expect(html).toContain('value=""'); expect(html).toContain('aria-invalid="false"');
  for (const field of html.matchAll(/<(?:input|button)[^>]*>/g)) expect(field[0]).toContain('disabled');
});
it('marks malformed typed times instead of silently retaining a previously valid time', () => {
  const html = renderToStaticMarkup(<TimeInput value="25:00" onChange={() => {}} ariaLabel="Giờ" />);
  expect(html).toContain('value="25:00"'); expect(html).toContain('aria-invalid="true"');
});