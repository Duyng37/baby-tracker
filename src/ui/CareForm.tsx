import { useState } from 'react';
import { DataError } from '../domain/events';
import { activityLabels, dayKey } from '../domain/summary';
import type { ActivityKind, CareBody, CareEventType } from '../domain/types';
import { DateInput } from './DateInput';
import { TimeInput } from './TimeInput';
import { careDateTime, careDraft, careRecord, type CareDraft } from './care-record';

export function CareForm({ type, body, kind, timezone, saving, onSave, onDelete }: {
  type: CareEventType; body?: CareBody; kind?: ActivityKind; timezone: string; saving: boolean;
  onSave: (body: CareBody) => void; onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(() => careDraft(type, timezone, body, kind));
  const [error, setError] = useState('');
  const set = <K extends keyof CareDraft>(key: K, value: CareDraft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const planned = type === 'medication' && draft.status === 'planned';
  return <form className="stack" onSubmit={event => {
    event.preventDefault();
    try { const next = careRecord(type, draft, timezone); setError(''); onSave(next); }
    catch (error) { setError(error instanceof DataError ? error.message : 'Chưa đọc được thông tin chăm con.'); }
  }}>
    {type === 'medication' && <>
      <p className="sheet-intro">Lưu từng lần uống theo hướng dẫn của bác sĩ hoặc đơn thuốc. App không gợi ý thuốc hay liều dùng và chưa có thông báo nhắc tự động.</p>
      <label>Trạng thái<select name="status" value={draft.status} disabled={saving} onChange={event => {
        const status = event.target.value as CareDraft['status'];
        setDraft(current => ({ ...current, status, ...(status === 'completed' ? careDateTime(timezone) : {}) })); setError('');
      }}><option value="planned">Dự kiến</option><option value="completed">Đã uống</option></select></label>
      <label>Tên thuốc<input name="name" required maxLength={120} value={draft.name} disabled={saving} placeholder="Nhập tên trên đơn thuốc" onChange={event => set('name', event.target.value)} /></label>
      <label>Liều dùng theo đơn (không bắt buộc)<input name="dose" maxLength={80} value={draft.dose} disabled={saving} onChange={event => set('dose', event.target.value)} /></label>
    </>}
    {type === 'meal' && <>
      <label>Món ăn / đồ uống<input name="food" required maxLength={160} value={draft.food} disabled={saving} placeholder="Con đã ăn hoặc uống gì?" onChange={event => set('food', event.target.value)} /></label>
      <label>Lượng dùng (không bắt buộc)<input name="amount" maxLength={80} value={draft.amount} disabled={saving} placeholder="Ví dụ: nửa bát, 100 ml" onChange={event => set('amount', event.target.value)} /></label>
    </>}
    {type === 'growth' && <>
      <p className="sheet-intro">Nhập chiều cao, cân nặng hoặc cả hai. Đây là nhật ký số đo, không phải đánh giá sức khỏe.</p>
      <div className="row"><label>Chiều cao (cm)<input name="height" type="number" inputMode="decimal" min="0.1" max="250" step="any" value={draft.height} disabled={saving} onChange={event => set('height', event.target.value)} /></label>
        <label>Cân nặng (kg)<input name="weight" type="number" inputMode="decimal" min="0.01" max="300" step="any" value={draft.weight} disabled={saving} onChange={event => set('weight', event.target.value)} /></label></div>
    </>}
    {type === 'activity' && <>
      <label>Hoạt động<select name="kind" value={draft.kind} disabled={saving} onChange={event => set('kind', event.target.value as ActivityKind)}>
        {Object.entries(activityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Thời lượng (phút, không bắt buộc)<input name="minutes" type="number" inputMode="decimal" min="0.1" max="1440" step="any" value={draft.minutes} disabled={saving} onChange={event => set('minutes', event.target.value)} /></label>
    </>}
    <div className="row"><label>{planned ? 'Ngày dự kiến' : type === 'medication' ? 'Ngày đã uống' : 'Ngày ghi nhận'}<DateInput name="date" required value={draft.date}
      max={planned ? undefined : dayKey(Date.now(), timezone)} disabled={saving} onChange={date => set('date', date)} ariaLabel="Chọn ngày chăm con" /></label>
      <label>Giờ<TimeInput name="time" required value={draft.time} disabled={saving} onChange={time => set('time', time)} ariaLabel="Giờ" /></label></div>
    <p className="muted">Múi giờ: {timezone}.{type === 'medication' && ' Khi chọn “Đã uống”, hãy xác nhận thời điểm uống thực tế.'}</p>
    <label>Ghi chú<textarea name="note" maxLength={500} value={draft.note} disabled={saving} placeholder="Một điều nhỏ bạn muốn nhớ…" onChange={event => set('note', event.target.value)} /></label>
    {error && <p className="form-feedback" role="alert">{error}</p>}
    <button className="primary" disabled={saving}>{saving ? 'Đang lưu…' : planned ? 'Lưu lịch uống thuốc' : 'Lưu ghi nhận'}</button>
    {onDelete && <button className="danger-button" type="button" disabled={saving} onClick={onDelete}>Xóa ghi nhận</button>}
  </form>;
}