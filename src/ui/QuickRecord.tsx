import { useId, useState } from 'react';
import { DataError } from '../domain/events';
import { dayKey } from '../domain/summary';
import type { EventBody } from '../domain/types';
import { Icon } from './Icon';
import { quickRecord, type DiaperKind, type Milk, type QuickChoice } from './quick-record';

export function QuickRecord({ type, running, timezone, saving, milk, onMilkChange, onSave }: {
  type: EventBody['type']; running?: EventBody; timezone: string; saving: boolean;
  milk: Milk; onMilkChange: (milk: Milk) => void; onSave: (body: EventBody) => void;
}) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [wakeDate, setWakeDate] = useState('');
  const [wakeTime, setWakeTime] = useState('');
  const [error, setError] = useState('');
  const hint = useId();
  const wakeHint = useId();
  function record(choice: QuickChoice) {
    try { const body = quickRecord(choice, date, time, timezone); setError(''); onSave(body); }
    catch (error) { setError(error instanceof DataError ? error.message : 'Chưa đọc được ngày/giờ. Vui lòng kiểm tra lại.'); }
  }
  return <div className="stack">
    <fieldset className="record-time" disabled={saving} aria-describedby={hint}>
      <legend>{running ? 'Thời điểm kết thúc' : type === 'sleep' ? 'Thời điểm bắt đầu ngủ' : 'Thời điểm ghi nhận'} (không bắt buộc)</legend>
      <div className="row"><label>Ngày<input name="date" type="date" value={date} max={dayKey(Date.now(), timezone)} onChange={e => setDate(e.target.value)} /></label>
        <label>Giờ<input name="time" type="time" value={time} onChange={e => setTime(e.target.value)} /></label></div>
      <p id={hint} className="muted">Ô để trống dùng ngày/giờ hiện tại lúc lưu. Múi giờ: {timezone}.</p>
    </fieldset>
    {error && <p className="form-feedback" role="alert">{error}</p>}
    {running ? <><p className="sheet-intro">Chọn thời điểm nếu cần ghi bù, rồi xác nhận kết thúc.</p>
      <button className="primary" disabled={saving} onClick={() => record({ type: 'stop', body: running })}>{saving ? 'Đang lưu…' : type === 'sleep' ? 'Đã thức' : 'Kết thúc bú'}</button></>
      : type === 'bottle' ? <>
        <p className="sheet-intro">Chọn ngày/giờ nếu cần, rồi chạm lượng sữa để lưu hoặc nhập lượng khác bên dưới.</p>
        <label>Loại sữa<select value={milk} disabled={saving} onChange={e => onMilkChange(e.target.value as Milk)}><option value="formula">Công thức</option><option value="breast_milk">Sữa mẹ vắt</option><option value="mixed">Hỗn hợp</option></select></label>
        <div className="presets" role="group" aria-label="Lượng sữa ghi nhanh">{[60, 90, 120, 150, 180, 210].map(amount => <button disabled={saving} key={amount} onClick={() => record({ type, amount, milk })}>{amount}<small>ml</small></button>)}</div>
        <form className="row form-row" onSubmit={e => { e.preventDefault(); record({ type, amount: Number(new FormData(e.currentTarget).get('amount')), milk }); }}>
          <label>Lượng khác (ml)<input name="amount" type="number" inputMode="decimal" placeholder="Ví dụ: 100" min="0.1" max="2000" step="0.1" required disabled={saving} /></label>
          <button className="primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Ghi lại'}</button></form>
        <p className="muted">Các mức trên chỉ giúp nhập nhanh, không phải khuyến cáo lượng sữa.</p>
      </> : type === 'diaper' ? <>
        <p className="sheet-intro">Chọn ngày/giờ nếu cần, rồi chạm tình trạng tã để ghi lại.</p>
        <div className="presets">{([['wet', 'Ướt'], ['dirty', 'Bẩn'], ['mixed', 'Cả hai']] as [DiaperKind, string][]).map(([kind, label]) => <button key={kind} disabled={saving} onClick={() => record({ type, kind })}><Icon name="diaper" />{label}</button>)}</div>
      </> : type === 'breast' ? <>
        <p className="sheet-intro">Con bắt đầu bú bên nào? Bạn có thể đổi bên khi đang ghi.</p>
        <div className="presets presets--two"><button disabled={saving} onClick={() => record({ type, side: 'left' })}><Icon name="breast" />Bên trái</button>
          <button disabled={saving} onClick={() => record({ type, side: 'right' })}><Icon name="breast" />Bên phải</button></div>
      </> : <>
        <fieldset className="record-time" disabled={saving} aria-describedby={wakeHint}>
          <legend>Thời điểm thức giấc (không bắt buộc)</legend>
          <div className="row"><label>Ngày thức giấc<input name="wakeDate" type="date" value={wakeDate} max={dayKey(Date.now(), timezone)} onChange={e => setWakeDate(e.target.value)} /></label>
            <label>Giờ thức giấc<input name="wakeTime" type="time" value={wakeTime} onChange={e => setWakeTime(e.target.value)} /></label></div>
          <p id={wakeHint} className="muted">Để trống cả hai ô nếu bé vẫn đang ngủ. Nếu chỉ nhập giờ thức, dùng ngày bắt đầu ngủ; ngủ qua đêm thì chọn thêm ngày thức giấc.</p>
        </fieldset>
        <p className="sheet-intro">Có thể ghi bù cả giấc ngủ đã kết thúc trong một lần lưu.</p>
        <button className="primary" disabled={saving} onClick={() => record({ type: 'sleep', wakeDate, wakeTime })}><Icon name="sleep" />{saving ? 'Đang lưu…' : 'Lưu giấc ngủ'}</button></>}
  </div>;
}