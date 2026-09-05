import { useId } from 'react';
import { isRunning } from '../domain/events';
import { activityLabels, dayKey, duration, labels } from '../domain/summary';
import type { EventBody, LocalEvent } from '../domain/types';
import { Icon } from './Icon';

export function isJournalBody(body: EventBody) {
  return !body.deleted && body.type !== 'vaccination' && !(body.type === 'medication' && body.payload.status === 'planned');
}
export function journalEvents(events: LocalEvent[], day: string, timezone: string, filter = 'all') {
  return events.filter(event => isJournalBody(event.body) && (filter === 'all' || event.body.type === filter)
    && dayKey(Date.parse(event.body.started_at), timezone) === day)
    .sort((a, b) => Date.parse(b.body.started_at) - Date.parse(a.body.started_at));
}

export function eventDetail(body: EventBody) {
  if (body.type === 'bottle') return `${body.payload.amount_ml} ml · ${{ formula: 'Sữa công thức', breast_milk: 'Sữa mẹ vắt', mixed: 'Hỗn hợp' }[body.payload.milk]}`;
  if (body.type === 'diaper') return { wet: 'Tã ướt', dirty: 'Tã bẩn', mixed: 'Cả hai' }[body.payload.kind];
  if (body.type === 'vaccination') return `${body.payload.vaccine} · ${body.payload.status === 'planned' ? 'Dự kiến' : 'Đã tiêm'}`;
  if (body.type === 'medication') return [body.payload.name, body.payload.dose, body.payload.status === 'planned' ? 'Dự kiến' : 'Đã uống'].filter(Boolean).join(' · ');
  if (body.type === 'meal') return [body.payload.food, body.payload.amount].filter(Boolean).join(' · ');
  if (body.type === 'growth') return [body.payload.height_cm === null ? '' : `${body.payload.height_cm} cm`, body.payload.weight_kg === null ? '' : `${body.payload.weight_kg} kg`].filter(Boolean).join(' · ');
  if (body.type === 'activity') return [activityLabels[body.payload.kind], body.payload.duration_minutes === null ? '' : `${body.payload.duration_minutes} phút`].filter(Boolean).join(' · ');
  return body.ended_at ? duration(Date.parse(body.ended_at) - Date.parse(body.started_at)) : 'Đang diễn ra';
}

export function Journal({ events, timezone, onSelect }: { events: LocalEvent[]; timezone: string; onSelect: (event: LocalEvent) => void }) {
  const id = useId();
  const time = new Intl.DateTimeFormat('vi', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
  return <ol className="journal">{events.map(event => {
    const details = <>
      <span className="event-icon"><Icon name={event.body.type} /></span>
      <span className="event-info"><strong>{labels[event.body.type]}</strong><small>{eventDetail(event.body)}</small>
        {event.body.note && <span id={`${id}-${event.id}`} className="event-note">{event.body.note}</span>}</span>
      <time dateTime={event.body.started_at}>{time.format(new Date(event.body.started_at))}</time>
      {!isRunning(event.body) && <Icon name="chevron" className="event-chevron" />}
    </>;
    return <li key={event.id}>{isRunning(event.body) ? <div className="event-row">{details}</div>
      : <button className="event-row" onClick={() => onSelect(event)} aria-describedby={event.body.note ? `${id}-${event.id}` : undefined}
        aria-label={`${labels[event.body.type]}, ${time.format(new Date(event.body.started_at))}, ${eventDetail(event.body)}, xem và chỉnh sửa`}>{details}</button>}</li>;
  })}</ol>;
}