import { useState } from 'react';
import { DataError } from '../domain/events';
import { dayKey } from '../domain/summary';
import type { Side } from '../domain/types';
import { DateInput } from './DateInput';
import { TimeInput } from './TimeInput';
import { journalEntryDraft, journalEntryRecord, type JournalEntryDraft, type QuickBody } from './journal-entry';

export function JournalEntryForm({ body, timezone, saving, onSave, onDelete }: {
  body: QuickBody; timezone: string; saving: boolean; onSave: (body: QuickBody) => void; onDelete: () => void;
}) {
  const [draft, setDraft] = useState(() => journalEntryDraft(body, timezone));
  const [error, setError] = useState('');
  const set = <K extends keyof JournalEntryDraft>(key: K, value: JournalEntryDraft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const setSegment = (index: number, value: Partial<JournalEntryDraft['segments'][number]>) => setDraft(current => ({ ...current,
    segments: current.segments.map((segment, position) => position === index ? { ...segment, ...value } : segment) }));
  const dateTime = (prefix = '', end = false) => <div className="row">
    <label>{prefix ? `Ngày ${prefix}` : 'Ngày ghi nhận'}<DateInput name={end ? 'endDate' : 'date'} required value={end ? draft.endDate : draft.date}
      max={dayKey(Date.now(), timezone)} disabled={saving} onChange={value => set(end ? 'endDate' : 'date', value)} ariaLabel={`Chọn ngày ${prefix || 'ghi nhận'}`} /></label>
    <label>{prefix ? `Giờ ${prefix}` : 'Giờ'}<TimeInput name={end ? 'endTime' : 'time'} required value={end ? draft.endTime : draft.time}
      disabled={saving} onChange={value => set(end ? 'endTime' : 'time', value)} ariaLabel={`Giờ ${prefix || 'ghi nhận'}`} /></label>
  </div>;
  return <form className="stack" onSubmit={event => {
    event.preventDefault();
    try { const next = journalEntryRecord(body.type, draft, timezone); setError(''); onSave(next); }
    catch (error) { setError(error instanceof DataError ? error.message : 'Chưa đọc được chi tiết ghi nhận.'); }
  }}>
    {body.type === 'bottle' && <><label>Lượng sữa (ml)<input name="amount" type="number" inputMode="decimal" min="0.1" max="2000" step="0.1" required value={draft.amount} disabled={saving} onChange={event => set('amount', event.target.value)} /></label>
      <label>Loại sữa<select name="milk" value={draft.milk} disabled={saving} onChange={event => set('milk', event.target.value as JournalEntryDraft['milk'])}><option value="formula">Sữa công thức</option><option value="breast_milk">Sữa mẹ vắt</option><option value="mixed">Hỗn hợp</option></select></label></>}
    {body.type === 'diaper' && <label>Tình trạng tã<select name="diaper" value={draft.diaper} disabled={saving} onChange={event => set('diaper', event.target.value as JournalEntryDraft['diaper'])}><option value="wet">Ướt</option><option value="dirty">Bẩn</option><option value="mixed">Cả hai</option></select></label>}
    {dateTime(body.type === 'sleep' || body.type === 'breast' ? 'bắt đầu' : '')}
    {body.type === 'sleep' && dateTime('thức giấc', true)}
    {body.type === 'breast' && draft.segments.map((segment, index) => <fieldset className="record-time" key={index}><legend>Chặng bú {index + 1}</legend>
      <label>Bên bú<select name={`segmentSide${index}`} value={segment.side} disabled={saving} onChange={event => setSegment(index, { side: event.target.value as Side })}><option value="left">Bên trái</option><option value="right">Bên phải</option></select></label>
      <div className="row"><label>Ngày kết thúc<DateInput name={`segmentEndDate${index}`} required value={segment.endDate} max={dayKey(Date.now(), timezone)} disabled={saving} onChange={value => setSegment(index, { endDate: value })} ariaLabel={`Ngày kết thúc chặng bú ${index + 1}`} /></label>
        <label>Giờ kết thúc<TimeInput name={`segmentEndTime${index}`} required value={segment.endTime} disabled={saving} onChange={value => setSegment(index, { endTime: value })} ariaLabel={`Giờ kết thúc chặng bú ${index + 1}`} /></label></div></fieldset>)}
    <p className="muted">Múi giờ: {timezone}.</p>
    <label>Ghi chú<textarea name="note" maxLength={500} value={draft.note} disabled={saving} placeholder="Một điều nhỏ bạn muốn nhớ…" onChange={event => set('note', event.target.value)} /></label>
    {error && <p className="form-feedback" role="alert">{error}</p>}
    <button className="primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
    <button className="danger-button" type="button" disabled={saving} onClick={onDelete}>Xóa ghi nhận</button>
  </form>;
}