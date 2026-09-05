import { useId } from 'react';
import { DateInput, parseDateText } from './DateInput';

export const parseJournalDate = parseDateText;

/** Keep the visible format independent of the native date widget's locale. */
export function JournalDateInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  return <div className="journal-date-field">
    <label htmlFor={id}>Ngày</label>
    <DateInput id={id} value={value} onChange={onChange} ariaLabel="Chọn ngày xem nhật ký" className="journal-date-text" />
  </div>;
}