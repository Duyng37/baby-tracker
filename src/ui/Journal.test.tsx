import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EventBody, LocalEvent } from '../domain/types';
import { eventDetail, Journal, journalEvents } from './Journal';
import { Metrics } from './Metrics';
import { Icon } from './Icon';

const common = { started_at: '2026-09-05T08:00:00.000Z', ended_at: null, note: '', deleted: false };
function entry(id: string, body: EventBody): LocalEvent {
  return { id, family_id: 'family-test', baby_id: 'baby-test', server: null, version: 1, body };
}
const bottle = entry('bottle', { ...common, type: 'bottle', payload: { amount_ml: 90, milk: 'formula' } });
const diaper = entry('diaper', { ...common, started_at: '2026-09-05T09:00:00.000Z', type: 'diaper', payload: { kind: 'wet' } });

describe('journal filtering', () => {
  it('sorts newest first without mutating store events and excludes deleted entries', () => {
    const removed = entry('removed', { ...bottle.body, deleted: true });
    const events = [bottle, diaper, removed];
    expect(journalEvents(events, '2026-09-05', 'Asia/Ho_Chi_Minh').map(e => e.id)).toEqual(['diaper', 'bottle']);
    expect(events.map(e => e.id)).toEqual(['bottle', 'diaper', 'removed']);
  });
  it('uses the family timezone at day boundaries', () => {
    const midnight = entry('midnight', { ...bottle.body, started_at: '2026-09-04T18:00:00.000Z' });
    expect(journalEvents([midnight], '2026-09-05', 'Asia/Ho_Chi_Minh')).toHaveLength(1);
    expect(journalEvents([midnight], '2026-09-05', 'UTC')).toHaveLength(0);
  });
  it('supports type filters; the default today view includes all activities', () => {
    expect(journalEvents([bottle, diaper], '2026-09-05', 'UTC', 'diaper')).toEqual([diaper]);
    expect(journalEvents([bottle, diaper], '2026-09-05', 'UTC')).toHaveLength(2);
  });
});

describe('timeline and summary presentation', () => {
  it('renders a single accessible action per completed event, with semantic time', () => {
    const html = renderToStaticMarkup(<Journal events={[bottle, diaper]} timezone="Asia/Ho_Chi_Minh" onSelect={() => {}} />);
    expect(html.match(/<button /g)).toHaveLength(2);
    expect(html).toContain('Bình sữa, 15:00, 90 ml · Sữa công thức, xem và chỉnh sửa');
    expect(html).toContain('dateTime="2026-09-05T08:00:00.000Z"');
    expect(html).toContain('90 ml · Sữa công thức');
    expect(html).not.toContain('Xóa'); // Destructive actions live inside the detail sheet.
  });
  it('does not offer note/delete actions on a running timer', () => {
    const active = entry('sleep', { ...common, type: 'sleep', payload: {} });
    const html = renderToStaticMarkup(<Journal events={[active]} timezone="UTC" onSelect={() => {}} />);
    expect(html).toContain('Đang diễn ra');
    expect(html).not.toContain('<button');
  });
  it('escapes notes while preserving the note element for wrapped multiline text', () => {
    const noted = entry('note', { ...bottle.body, note: '<img src=x onerror=alert(1)>\nDòng thứ hai' });
    const html = renderToStaticMarkup(<Journal events={[noted]} timezone="UTC" onSelect={() => {}} />);
    expect(html).toContain('class="event-note"');
    expect(html).toContain('aria-describedby=');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });
  it('shows units and time without converting breastfeeding into ml', () => {
    const html = renderToStaticMarkup(<Metrics summary={{ bottle: 120, diapers: 3, sleep: 3_600_000, breast: 1_200_000 }} />);
    expect(html.match(/<article /g)).toHaveLength(4);
    expect(html).toContain('120 <span>ml</span>');
    expect(html).toContain('3 <span>lần</span>');
    expect(html).toContain('1 giờ 0 phút');
    expect(html).toContain('20 phút');
  });
  it('supports empty metrics without implying missing data is a health assessment', () => {
    const html = renderToStaticMarkup(<Metrics summary={{ bottle: 0, diapers: 0, sleep: 0, breast: 0 }} />);
    expect(html).toContain('0 <span>ml</span>');
    expect(html).toContain('0 phút');
    expect(html).not.toContain('NaN');
  });
  it('renders decorative, non-focusable SVG icons without font dependencies', () => {
    const html = renderToStaticMarkup(<Icon name="sleep" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).toContain('stroke="currentColor"');
  });
  it('formats completed timers and mixed diaper entries', () => {
    expect(eventDetail({ ...common, type: 'sleep', payload: {}, ended_at: '2026-09-05T09:30:00.000Z' })).toBe('1 giờ 30 phút');
    expect(eventDetail({ ...common, type: 'diaper', payload: { kind: 'mixed' } })).toBe('Cả hai');
  });
});