import { useId, useState } from 'react';
import { DataError } from '../domain/events';
import { dayKey } from '../domain/summary';
import type { EventBody, QuickEventType } from '../domain/types';
import { Icon } from './Icon';
import { DateInput } from './DateInput';
import { TimeInput } from './TimeInput';
import { quickRecord, type DiaperKind, type Milk, type QuickChoice } from './quick-record';
import { recordingDateTime } from './recording-time';

export function QuickRecord({ type, running, timezone, saving, milk, onMilkChange, onSave }: {
  type: QuickEventType; running?: EventBody; timezone: string; saving: boolean;
  milk: Milk; onMilkChange: (milk: Milk) => void; onSave: (body: EventBody) => void;
}) {
  const [initial] = useState(() => { const now = Date.now(); return { now, ...recordingDateTime(timezone, now) }; });
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [wakeDate, setWakeDate] = useState(initial.date);
  const [wakeTime, setWakeTime] = useState(initial.time);
  const [hasWakeTime, setHasWakeTime] = useState(false);
  const [error, setError] = useState('');
  const hint = useId();
  const wakeHint = useId();
  function record(choice: QuickChoice) {
    try {
      // Retain seconds for the default stop so it cannot precede a timer started in the same minute.
      const defaultStop = choice.type === 'stop' && date === initial.date && time === initial.time;
      const body = defaultStop ? quickRecord(choice, '', '', timezone, initial.now) : quickRecord(choice, date, time, timezone);
      setError(''); onSave(body);
    }
    catch (error) { setError(error instanceof DataError ? error.message : 'Chưa đọc được ngày/giờ. Vui lòng kiểm tra lại.'); }
  }
  return <div className="stack">
    <fieldset className="record-time" disabled={saving} aria-describedby={hint}>
      <legend>{running ? 'Thời điểm kết thúc' : type === 'sleep' ? 'Thời điểm bắt đầu ngủ' : 'Thời điểm ghi nhận'} (không bắt buộc)</legend>
      <div className="row"><label>Ngày<DateInput name="date" value={date} max={dayKey(Date.now(), timezone)} onChange={setDate} ariaLabel="Chọn ngày ghi nhận" /></label>
        <label>Giờ<TimeInput name="time" value={time} disabled={saving} onChange={setTime} ariaLabel="Giờ" /></label></div>
      <p id={hint} className="muted">Điền sẵn ngày/giờ hiện tại khi mở. Bạn có thể đổi để ghi bù. Múi giờ: {timezone}.</p>
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
        <label>Trạng thái giấc ngủ<select name="sleepStatus" value={hasWakeTime ? 'awake' : 'sleeping'} disabled={saving} onChange={event => {
          const awake = event.target.value === 'awake'; setHasWakeTime(awake); setError('');
          if (awake) { const current = recordingDateTime(timezone); setWakeDate(current.date); setWakeTime(current.time); }
        }}><option value="sleeping">Bé vẫn đang ngủ</option><option value="awake">Bé đã thức</option></select></label>
        <fieldset className="record-time" disabled={saving || !hasWakeTime} aria-describedby={wakeHint}>
          <legend>Thời điểm thức giấc (không bắt buộc)</legend>
          <div className="row"><label>Ngày thức giấc<DateInput name="wakeDate" value={wakeDate} max={dayKey(Date.now(), timezone)} onChange={setWakeDate} ariaLabel="Chọn ngày thức giấc" /></label>
            <label>Giờ thức giấc<TimeInput name="wakeTime" value={wakeTime} disabled={saving || !hasWakeTime} onChange={setWakeTime} ariaLabel="Giờ thức giấc" /></label></div>
          <p id={wakeHint} className="muted">Chọn “Bé đã thức” để lưu thời điểm thức giấc. Ngày/giờ được điền sẵn hiện tại; bạn có thể đổi để ghi bù, kể cả giấc ngủ qua đêm.</p>
        </fieldset>
        <p className="sheet-intro">Có thể ghi bù cả giấc ngủ đã kết thúc trong một lần lưu.</p>
        <button className="primary" disabled={saving} onClick={() => record({ type: 'sleep', ...(hasWakeTime ? { wakeDate, wakeTime } : {}) })}><Icon name="sleep" />{saving ? 'Đang lưu…' : 'Lưu giấc ngủ'}</button></>}
  </div>;
}