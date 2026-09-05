import { useId } from 'react';
import { dayKey } from '../domain/summary';
import type { LocalEvent, Scope, VaccinationBody, VaccinationStatus } from '../domain/types';
import { Icon } from './Icon';

export type VaccinationEvent = LocalEvent & { body: VaccinationBody };
export function vaccinationEvents(events: LocalEvent[], scope: Scope, status: VaccinationStatus): VaccinationEvent[] {
  return events.filter((event): event is VaccinationEvent => event.family_id === scope.family_id && event.baby_id === scope.baby_id
    && !event.body.deleted && event.body.type === 'vaccination' && event.body.payload.status === status)
    .sort((a, b) => (Date.parse(a.body.started_at) - Date.parse(b.body.started_at)) * (status === 'planned' ? 1 : -1));
}

export function VaccinationSchedule({ events, scope, babyName, timezone, now, saving, onAdd, onEdit, onComplete }: {
  events: LocalEvent[]; scope: Scope; babyName: string; timezone: string; now: number; saving: boolean;
  onAdd: (status: VaccinationStatus) => void; onEdit: (event: VaccinationEvent) => void; onComplete: (event: VaccinationEvent) => void;
}) {
  const id = useId();
  const today = dayKey(now, timezone);
  const formatter = new Intl.DateTimeFormat('vi', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' });
  return <article className="card stack vaccination-schedule" aria-labelledby={id}>
    <div className="section-heading"><h2 id={id}>Lịch tiêm chủng</h2><Icon name="vaccination" /></div>
    <p className="muted">Theo dõi lịch tiêm của <strong>{babyName}</strong>. Đổi bé ở đầu trang để xem lịch của bé khác.</p>
    <div className="row vaccination-actions"><button className="primary" disabled={saving} onClick={() => onAdd('planned')}><Icon name="plus" />Lên lịch tiêm</button>
      <button disabled={saving} onClick={() => onAdd('completed')}><Icon name="check" />Ghi mũi đã tiêm</button></div>
    {(['planned', 'completed'] as const).map(status => {
      const rows = vaccinationEvents(events, scope, status);
      const label = status === 'planned' ? 'Dự kiến' : 'Đã tiêm';
      return <section className="stack" key={status} aria-label={label}>
        <h3>{label} <span className="muted">({rows.length})</span></h3>
        {!rows.length ? <p className="muted">{status === 'planned' ? 'Chưa có lịch tiêm dự kiến.' : 'Chưa ghi nhận mũi đã tiêm.'}</p>
          : <ul className="vaccination-list">{rows.map(event => {
            const { vaccine, dose, location } = event.body.payload;
            const day = dayKey(Date.parse(event.body.started_at), timezone);
            const timing = day < today ? 'Đã qua ngày hẹn' : day === today ? 'Hôm nay' : 'Sắp tới';
            return <li className="stack" key={event.id}>
              <div className="vaccination-heading"><strong>{vaccine}{dose && ` · ${dose}`}</strong>
                <span className="vaccination-badge" data-overdue={status === 'planned' && day < today}>{status === 'planned' ? timing : 'Đã tiêm'}</span></div>
              <time dateTime={event.body.started_at}>{formatter.format(new Date(event.body.started_at))}</time>
              {location && <p className="muted">Nơi tiêm: {location}</p>}
              {event.body.note && <p className="event-note">{event.body.note}</p>}
              <div className="row"><button className="text-button" disabled={saving} aria-label={`Sửa lịch tiêm ${vaccine}`} onClick={() => onEdit(event)}><Icon name="edit" />Chỉnh sửa</button>
                {status === 'planned' && <button disabled={saving} aria-label={`Ghi đã tiêm ${vaccine}`} onClick={() => onComplete(event)}><Icon name="check" />Đã tiêm</button>}</div>
            </li>;
          })}</ul>}
      </section>;
    })}
    <p className="muted">Chưa có thông báo nhắc tự động. Lịch do gia đình nhập, không thay thế chỉ định của cơ sở tiêm chủng.</p>
  </article>;
}