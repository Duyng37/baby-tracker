import { useEffect, useId, useState } from 'react';
import type { LocalEvent } from '../domain/types';
import { formatDate } from './DateInput';
import { Icon } from './Icon';
import { categoryIcon, categoryKey, categoryName, expenseEvents, expenseMonth, formatMoney, groupByDay, methodLabels, payerLabels,
  previousMonth, summarizeExpenses, type ExpenseEvent } from './expense-record';

const monthLabel = (month: string) => `Tháng ${Number(month.slice(5))}/${month.slice(0, 4)}`;
const nextMonth = (month: string) => {
  const [year, value] = month.split('-').map(Number);
  return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, '0')}`;
};

export function ExpenseLog({ events, babyName, timezone, today, saving, onAdd, onEdit }: {
  events: LocalEvent[]; babyName: string; timezone: string; today: string; saving: boolean;
  onAdd: () => void; onEdit: (event: ExpenseEvent) => void;
}) {
  const id = useId();
  const current = today.slice(0, 7);
  const [month, setMonth] = useState(current);
  const [filter, setFilter] = useState('all');
  useEffect(() => { setFilter('all'); }, [month]);
  const all = expenseEvents(events);
  const inMonth = all.filter(event => expenseMonth(event, timezone) === month);
  const summary = summarizeExpenses(inMonth);
  const previous = summarizeExpenses(all.filter(event => expenseMonth(event, timezone) === previousMonth(month))).total;
  const difference = summary.total - previous;
  const max = Math.max(1, ...summary.categories.map(category => category.total));
  const payers = Object.entries(payerLabels).map(([key, label]) => [label, inMonth.filter(event => event.body.payload.payer === key)
    .reduce((sum, event) => sum + event.body.payload.amount, 0)] as const).filter(([, total]) => total > 0);
  const visible = filter === 'all' ? inMonth : inMonth.filter(event => categoryKey(event.body) === filter);
  const days = groupByDay(visible, timezone);
  const time = new Intl.DateTimeFormat('vi', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
  const earliest = all.length ? expenseMonth(all.at(-1)!, timezone) : current;
  const dayTitle = (day: string) => day === today ? 'Hôm nay' : formatDate(day);
  return <section className="stack expense-log" aria-labelledby={id}>
    <article className="card stack expense-overview">
      <div className="section-heading"><h2 id={id}>Chi tiêu cho {babyName}</h2><Icon name="expense" /></div>
      <div className="expense-month" role="group" aria-label="Chọn tháng">
        <button type="button" className="icon-button" aria-label="Tháng trước" disabled={month <= earliest} onClick={() => setMonth(previousMonth(month))}><Icon name="chevron" className="flip" /></button>
        <strong aria-live="polite">{monthLabel(month)}</strong>
        <button type="button" className="icon-button" aria-label="Tháng sau" disabled={month >= current} onClick={() => setMonth(nextMonth(month))}><Icon name="chevron" /></button>
      </div>
      <div className="expense-total"><small>Tổng chi</small><strong>{formatMoney(summary.total)}</strong>
        <p className="muted">{summary.count} khoản{previous || summary.total ? ` · ${difference === 0 ? 'bằng' : difference > 0 ? `nhiều hơn ${formatMoney(difference)} so với` : `ít hơn ${formatMoney(-difference)} so với`} ${monthLabel(previousMonth(month)).toLowerCase()}` : ''}</p></div>
      {payers.length > 0 && <ul className="expense-payers" aria-label="Theo người trả">{payers.map(([label, total]) => <li key={label}><span>{label}</span><strong>{formatMoney(total)}</strong></li>)}</ul>}
      <button className="primary" disabled={saving} onClick={onAdd}><Icon name="plus" />Ghi chi tiêu</button>
    </article>
    {summary.categories.length > 0 && <article className="card stack">
      <div className="chart-header"><h3>Theo danh mục</h3><small>Chạm để lọc</small></div>
      <ol className="expense-categories">{summary.categories.map(category => <li key={category.key}>
        <button type="button" aria-pressed={filter === category.key} onClick={() => setFilter(filter === category.key ? 'all' : category.key)}
          aria-label={`${category.name}: ${formatMoney(category.total)}, ${Math.round(category.total / Math.max(1, summary.total) * 100)}%, ${category.count} khoản. ${filter === category.key ? 'Bỏ lọc' : 'Lọc danh sách'}`}>
          <Icon name={category.icon} />
          <span className="expense-category-info"><span><span>{category.name}</span><strong>{formatMoney(category.total)}</strong></span>
            <span className="bar-track" aria-hidden="true"><span className="bar" style={{ width: `${Math.round(category.total / max * 100)}%` }} /></span></span>
        </button></li>)}</ol>
    </article>}
    <section aria-label={`Các khoản chi ${monthLabel(month).toLowerCase()}`}>
      <div className="section-heading"><h2>Các khoản chi</h2>{filter !== 'all' && <button className="text-button" onClick={() => setFilter('all')}>Bỏ lọc<Icon name="close" /></button>}</div>
      {!days.length && <div className="empty"><Icon name="expense" /><h3>{inMonth.length ? 'Không có khoản chi trong danh mục này.' : 'Chưa có khoản chi nào trong tháng.'}</h3>
        <p>Ghi lại tiền sữa, bỉm, khám bệnh… để cả nhà cùng nắm được chi tiêu cho {babyName}.</p></div>}
      {days.map(group => <div className="expense-day" key={group.day}>
        <h3><span>{dayTitle(group.day)}</span><span>{formatMoney(group.total)}</span></h3>
        <ol className="journal">{group.events.map(event => {
          const { payload } = event.body;
          const meta = [payerLabels[payload.payer], methodLabels[payload.method], time.format(new Date(event.body.started_at))].join(' · ');
          return <li key={event.id}><button className="event-row" disabled={saving} onClick={() => onEdit(event)}
            aria-label={`${categoryName(event.body)}${payload.title ? `, ${payload.title}` : ''}, ${formatMoney(payload.amount)}, ${meta}. Xem và chỉnh sửa`}>
            <span className="event-icon"><Icon name={categoryIcon(event.body)} /></span>
            <span className="event-info"><strong>{payload.title || categoryName(event.body)}</strong><small>{payload.title ? `${categoryName(event.body)} · ` : ''}{meta}</small>
              {event.body.note && <span className="event-note">{event.body.note}</span>}</span>
            <span className="expense-amount">{formatMoney(payload.amount)}</span>
          </button></li>;
        })}</ol>
      </div>)}
    </section>
  </section>;
}
