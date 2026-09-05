import { useState } from 'react';
import { DataError } from '../domain/events';
import { dayKey } from '../domain/summary';
import type { VaccinationBody, VaccinationStatus } from '../domain/types';
import { DateInput } from './DateInput';
import { vaccinationDraft, vaccinationRecord } from './vaccination-record';

export function VaccinationForm({ body, initialStatus, timezone, saving, onSave, onDelete }: {
  body?: VaccinationBody; initialStatus?: VaccinationStatus; timezone: string; saving: boolean;
  onSave: (body: VaccinationBody) => void; onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(() => vaccinationDraft(timezone, body, initialStatus));
  const [error, setError] = useState('');
  function changeStatus(status: VaccinationStatus) {
    const currentTime = vaccinationDraft(timezone, undefined, 'completed');
    setDraft(current => ({ ...current, status, ...(status === 'completed' ? { date: currentTime.date, time: currentTime.time } : {}) }));
    setError('');
  }
  return <form className="stack" onSubmit={event => {
    event.preventDefault();
    try { const next = vaccinationRecord(draft, timezone); setError(''); onSave(next); }
    catch (error) { setError(error instanceof DataError ? error.message : 'Chưa đọc được thông tin tiêm chủng.'); }
  }}>
    <p className="sheet-intro">{draft.status === 'planned' ? 'Lưu lịch hẹn để tiện theo dõi. Bạn có thể cập nhật sau khi bé đã tiêm.' : 'Ghi ngày và giờ bé thực sự được tiêm, kể cả các mũi trước đây.'}</p>
    <label>Trạng thái<select name="status" value={draft.status} disabled={saving} onChange={event => changeStatus(event.target.value as VaccinationStatus)}>
      <option value="planned">Dự kiến</option><option value="completed">Đã tiêm</option></select></label>
    <label>Tên vắc-xin<input name="vaccine" required maxLength={120} value={draft.vaccine} disabled={saving}
      placeholder="Nhập tên trên phiếu tiêm" onChange={event => setDraft({ ...draft, vaccine: event.target.value })} /></label>
    <label>Mũi số / nhắc lại (không bắt buộc)<input name="dose" maxLength={40} value={draft.dose} disabled={saving}
      placeholder="Ví dụ: Mũi 1" onChange={event => setDraft({ ...draft, dose: event.target.value })} /></label>
    <div className="row"><label>{draft.status === 'planned' ? 'Ngày dự kiến' : 'Ngày đã tiêm'}<DateInput name="date" required value={draft.date}
      max={draft.status === 'completed' ? dayKey(Date.now(), timezone) : undefined} disabled={saving} onChange={date => setDraft({ ...draft, date })} ariaLabel={draft.status === 'planned' ? 'Chọn ngày dự kiến' : 'Chọn ngày đã tiêm'} /></label>
      <label>Giờ<input name="time" type="time" required value={draft.time} disabled={saving} onChange={event => setDraft({ ...draft, time: event.target.value })} /></label></div>
    <p className="muted">Múi giờ: {timezone}. Khi chuyển sang “Đã tiêm”, hãy xác nhận lại thời điểm thực tế.</p>
    <label>Nơi tiêm (không bắt buộc)<input name="location" maxLength={160} value={draft.location} disabled={saving}
      onChange={event => setDraft({ ...draft, location: event.target.value })} /></label>
    <label>Ghi chú<textarea name="note" maxLength={500} value={draft.note} disabled={saving}
      placeholder="Thông tin trên phiếu tiêm hoặc điều bạn muốn nhớ…" onChange={event => setDraft({ ...draft, note: event.target.value })} /></label>
    {error && <p className="form-feedback" role="alert">{error}</p>}
    <button className="primary" disabled={saving}>{saving ? 'Đang lưu…' : draft.status === 'planned' ? 'Lưu lịch dự kiến' : 'Lưu mũi đã tiêm'}</button>
    {onDelete && <button className="danger-button" type="button" disabled={saving} onClick={onDelete}>Xóa lịch tiêm</button>}
  </form>;
}