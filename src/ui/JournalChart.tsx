import { useState } from 'react';
import { dayBounds, duration, monthDays, recentDays, summarizeDay, weekDays } from '../domain/summary';
import type { LocalEvent } from '../domain/types';
import { Icon } from './Icon';
import { isJournalBody } from './Journal';

type Metric = keyof ReturnType<typeof summarizeDay>;
type Period = 'week' | 'month' | 'recent';
const metrics: [Metric, string, string][] = [
  ['sleep', 'Giấc ngủ', 'giờ / ngày'], ['bottle', 'Sữa bình', 'ml / ngày'],
  ['breast', 'Bú mẹ', 'giờ / ngày'], ['diapers', 'Thay tã', 'lần / ngày'],
];
const periods: [Period, string][] = [['week', 'Tuần này'], ['month', 'Tháng này'], ['recent', '30 ngày']];
const timed = (metric: Metric) => metric === 'sleep' || metric === 'breast';
const weekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const shortDate = (day: string) => `${Number(day.slice(8))}/${Number(day.slice(5, 7))}`;

export function JournalChart({ events, today, timezone, now, babyName }: { events: LocalEvent[]; today: string; timezone: string; now: number; babyName: string }) {
  const [period, setPeriod] = useState<Period>('week');
  const [metric, setMetric] = useState<Metric>('sleep');
  const [, label, unit] = metrics.find(([key]) => key === metric)!;
  const days = period === 'week' ? weekDays(today) : period === 'month' ? monthDays(today) : recentDays(today, 30);
  const elapsed = days.filter(day => day <= today);
  const values = days.map(day => day > today ? 0 : summarizeDay(events, day, timezone, now)[metric]);
  const max = Math.max(1, ...values);
  const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, elapsed.length);
  const dense = days.length > 7;
  const title = period === 'week' ? `Tuần ${shortDate(days[0])} – ${shortDate(days.at(-1)!)}`
    : period === 'month' ? `Tháng ${Number(today.slice(5, 7))}/${today.slice(0, 4)}` : '30 ngày gần nhất';
  const from = dayBounds(days[0], timezone)[0];
  const to = Math.min(now, dayBounds(days.at(-1)!, timezone)[1]);
  const count = events.filter(e => isJournalBody(e.body) && Date.parse(e.body.started_at) >= from && Date.parse(e.body.started_at) < to).length;
  const dayLabel = (day: string) => day === today ? 'Nay*' : shortDate(day);
  const weekday = (day: string) => weekdays[new Date(`${day}T00:00:00Z`).getUTCDay()];
  const barText = (value: number) => timed(metric) ? (value / 3_600_000).toFixed(1).replace('.', ',') : String(Math.round(value));
  const spoken = (value: number) => timed(metric) ? duration(value) : metric === 'bottle' ? `${Math.round(value)} ml` : `${Math.round(value * 10) / 10} lần`;
  return <>
    <div className="section-heading"><h2>Biểu đồ sinh hoạt</h2><Icon name="insights" /></div>
    <div className="chart-options" role="group" aria-label="Chọn khoảng thời gian biểu đồ">{periods.map(([key, name]) =>
      <button key={key} type="button" aria-pressed={period === key} onClick={() => setPeriod(key)}>{name}</button>)}</div>
    <div className="chart-options" role="group" aria-label="Chọn chỉ số biểu đồ">{metrics.map(([key, name]) =>
      <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key)}>{name}</button>)}</div>
    <p>{title}: đã ghi {count} hoạt động cho {babyName}.</p>
    <div className="chart-header"><h3>{label}</h3><small>{unit}</small></div>
    {dense ? <ol className="bar-list" aria-label={`${label}, ${title}`}>{elapsed.map(day => {
      const value = values[days.indexOf(day)];
      return <li key={day} data-current={day === today} aria-label={`${day === today ? 'Hôm nay' : `${weekday(day)} ${shortDate(day)}`}: ${spoken(value)}`}>
        <span aria-hidden="true">{weekday(day)} {dayLabel(day)}</span>
        <div className="bar-track" aria-hidden="true"><div className="bar" style={{ width: `${Math.round(value / max * 100)}%` }} /></div>
        <span aria-hidden="true">{barText(value)}</span>
      </li>;
    })}</ol>
      : <div className="bar-chart" role="img" aria-label={`${label}, ${title}: ${elapsed.map(day => `${day === today ? 'hôm nay' : shortDate(day)} ${spoken(values[days.indexOf(day)])}`).join('; ')}`}>
        {days.map((day, index) => <div className="bar-column" data-current={day === today} data-future={day > today} aria-hidden="true" key={day}>
          <span>{day > today ? '' : barText(values[index])}</span>
          <div className="bar-track">{day <= today && <div className="bar" style={{ height: `${Math.round(values[index] / max * 100)}%` }} />}</div>
          <span>{dayLabel(day)}</span>
        </div>)}
      </div>}
    <p className="muted">Trung bình {spoken(average)} mỗi ngày, tính trên {elapsed.length} ngày đến hôm nay.
      * Hôm nay chưa kết thúc. Biểu đồ chỉ phản ánh những gì đã ghi, không phải đánh giá sức khỏe.</p>
  </>;
}
