import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export function parseDateText(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match || match[3] === '0000') return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const time = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === iso ? iso : null;
}

export function formatDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : '';
}

function monthStart(value: string) {
  return (value || new Date().toISOString().slice(0, 10)).slice(0, 7);
}

function shiftMonth(month: string, amount: number) {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value - 1 + amount, 1)).toISOString().slice(0, 7);
}

export function DateInput({ id, name, value, max, required, disabled, onChange, ariaLabel, className = '' }: {
  id?: string; name?: string; value: string; max?: string; required?: boolean; disabled?: boolean;
  onChange: (value: string) => void; ariaLabel: string; className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ source: string; text: string } | null>(null);
  const [month, setMonth] = useState(() => monthStart(value || max || ''));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    // Capture also handles clicks on controls that stop propagation (and touch/pen input).
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  const text = draft?.source === value ? draft.text : formatDate(value);
  const parsed = parseDateText(text);
  const invalid = !!draft && (!parsed || !!max && parsed > max);
  const [year, calendarMonth] = month.split('-').map(Number);
  const firstDay = (new Date(Date.UTC(year, calendarMonth - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, calendarMonth, 0)).getUTCDate();
  const next = shiftMonth(month, 1);
  const monthLabel = new Intl.DateTimeFormat('vi', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, calendarMonth - 1, 1)));
  function choose(day: number) {
    const iso = `${month}-${String(day).padStart(2, '0')}`;
    setDraft(null); onChange(iso); setOpen(false);
  }
  return <div className="date-input" ref={root}>
    <div className="date-input-control"><input id={id} name={name} className={`date-input-text ${className}`.trim()} type="text" placeholder="dd/mm/yyyy" maxLength={10}
      inputMode="numeric" autoComplete="off" spellCheck={false} value={text} required={required} disabled={disabled} aria-label={ariaLabel} aria-invalid={invalid}
      onChange={event => { const nextText = event.currentTarget.value; const nextDate = parseDateText(nextText); setDraft({ source: value, text: nextText }); if (nextDate && (!max || nextDate <= max)) onChange(nextDate); }}
      onKeyDown={event => { if (event.key === 'Escape') { setDraft(null); setOpen(false); } }} />
      <button className="icon-button date-input-trigger" type="button" disabled={disabled} aria-label="Mở lịch" aria-expanded={open} onClick={() => { setMonth(monthStart(value || max || '')); setOpen(current => !current); }}><Icon name="calendar" /></button></div>
    {open && <div className="date-input-calendar" role="dialog" aria-label="Chọn ngày">
      <div className="date-input-month"><button type="button" className="icon-button" aria-label="Tháng trước" onClick={() => setMonth(current => shiftMonth(current, -1))}>‹</button><strong>{monthLabel}</strong>
        <button type="button" className="icon-button" aria-label="Tháng sau" disabled={!!max && next > max.slice(0, 7)} onClick={() => setMonth(next)}>›</button></div>
      <div className="date-input-weekdays" aria-hidden="true">{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="date-input-days">{Array.from({ length: firstDay }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: days }, (_, index) => {
        const day = index + 1; const iso = `${month}-${String(day).padStart(2, '0')}`;
        return <button type="button" key={iso} aria-label={`Chọn ngày ${formatDate(iso)}`} aria-pressed={value === iso} disabled={!!max && iso > max} onClick={() => choose(day)}>{day}</button>;
      })}</div>
    </div>}
  </div>;
}