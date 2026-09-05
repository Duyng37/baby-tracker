import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';

export function parseJournalDate(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match || match[3] === '0000') return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const time = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === iso ? iso : null;
}

/** Keep the visible format independent of the native date widget's locale. */
export function JournalDateInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  const textInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<{ source: string; text: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const text = draft?.source === value ? draft.text : value.split('-').reverse().join('/');
  const invalid = touched && !parseJournalDate(text);
  const hint = 'Nhập ngày hợp lệ theo dd/mm/yyyy.';
  useEffect(() => { textInput.current?.setCustomValidity(''); }, [value]);
  return <div className="journal-date-field">
    <label htmlFor={id}>Ngày</label>
    <div className="journal-date-control">
      <input ref={textInput} id={id} className="journal-date-text" type="text" placeholder="dd/mm/yyyy" maxLength={10}
        autoComplete="off" spellCheck={false} value={text} aria-invalid={invalid} title={hint}
        onChange={event => {
          const next = event.currentTarget.value;
          const iso = parseJournalDate(next);
          setDraft({ source: value, text: next }); setTouched(false);
          event.currentTarget.setCustomValidity(iso ? '' : hint);
          if (iso) onChange(iso);
        }}
        onBlur={event => {
          setTouched(true);
          event.currentTarget.setCustomValidity(parseJournalDate(text) ? '' : hint);
          if (!parseJournalDate(text)) event.currentTarget.reportValidity();
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') { setDraft(null); setTouched(false); event.currentTarget.setCustomValidity(''); }
        }} />
      <span className="journal-date-picker">
        <Icon name="calendar" />
        <input type="date" aria-label="Chọn ngày xem nhật ký" value={value} onChange={event => {
          if (!event.currentTarget.value) return;
          textInput.current?.setCustomValidity('');
          setDraft(null); setTouched(false); onChange(event.currentTarget.value);
        }} />
      </span>
    </div>
  </div>;
}