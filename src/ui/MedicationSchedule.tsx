import { useId } from 'react';
import type { CareBody, LocalEvent, Scope } from '../domain/types';
import { Icon } from './Icon';

export type MedicationEvent = LocalEvent & { body: Extract<CareBody, { type: 'medication' }> };
export function medicationEvents(events: LocalEvent[], scope: Scope, status: 'planned' | 'completed'): MedicationEvent[] {
  return events.filter((event): event is MedicationEvent => event.family_id === scope.family_id && event.baby_id === scope.baby_id
    && !event.body.deleted && event.body.type === 'medication' && event.body.payload.status === status)
    .sort((a, b) => (Date.parse(a.body.started_at) - Date.parse(b.body.started_at)) * (status === 'planned' ? 1 : -1));
}
export function MedicationSchedule({ events, scope, babyName, timezone, now, saving, onAdd, onEdit }: {
  events: LocalEvent[]; scope: Scope; babyName: string; timezone: string; now: number; saving: boolean;
  onAdd: () => void; onEdit: (event: MedicationEvent) => void;
}) {
  const id = useId();
  const format = new Intl.DateTimeFormat('vi', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' });
  return <article className="card stack medication-schedule" aria-labelledby={id}>
    <div className="section-heading"><h2 id={id}>Lịch uống thuốc</h2><Icon name="medication" /></div>
    <p className="muted">Theo dõi từng lần uống thuốc của <strong>{babyName}</strong>. Chạm vào một mục để sửa hoặc ghi đã uống.</p>
    <button className="primary" disabled={saving} onClick={onAdd}><Icon name="plus" />Thêm lịch uống thuốc</button>
    {(['planned', 'completed'] as const).map(status => {
      const rows = medicationEvents(events, scope, status);
      return <section className="stack" key={status} aria-label={status === 'planned' ? 'Thuốc dự kiến' : 'Thuốc đã uống'}>
        <h3>{status === 'planned' ? 'Dự kiến' : 'Đã uống'} <span className="muted">({rows.length})</span></h3>
        {!rows.length ? <p className="muted">{status === 'planned' ? 'Chưa có lịch uống thuốc dự kiến.' : 'Chưa ghi nhận lần đã uống.'}</p>
          : <ul className="care-plan-list">{rows.map(event => {
            const overdue = status === 'planned' && Date.parse(event.body.started_at) < now;
            return <li key={event.id}><button className="care-plan" disabled={saving} onClick={() => onEdit(event)} aria-label={`Sửa lần uống ${event.body.payload.name}, ${format.format(new Date(event.body.started_at))}`}>
              <span className="care-plan-heading"><strong>{event.body.payload.name}</strong><span className="vaccination-badge" data-overdue={overdue}>{status === 'completed' ? 'Đã uống' : overdue ? 'Đã qua giờ dự kiến' : 'Dự kiến'}</span></span>
              {event.body.payload.dose && <span className="muted">{event.body.payload.dose}</span>}
              <time dateTime={event.body.started_at}>{format.format(new Date(event.body.started_at))}</time>
              {event.body.note && <span className="event-note">{event.body.note}</span>}
            </button></li>;
          })}</ul>}
      </section>;
    })}
    <p className="muted">Lịch do gia đình nhập theo chỉ định. Chưa có nhắc tự động hoặc lịch lặp lại.</p>
  </article>;
}