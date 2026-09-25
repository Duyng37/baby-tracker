import { useId, useState } from 'react';
import { DataError } from '../domain/events';
import { dayKey } from '../domain/summary';
import type { ExpenseBody, ExpenseMethod, ExpensePayer } from '../domain/types';
import { DateInput } from './DateInput';
import { Icon } from './Icon';
import { TimeInput } from './TimeInput';
import { amountPresets, categoryIcons, categoryLabels, expenseDraft, expenseRecord, formatAmountInput, formatMoney, maxAmount,
  methodLabels, normalizeCategoryName, parseAmount, payerLabels, type ExpenseDraft, type StandardCategory } from './expense-record';

export function ExpenseForm({ body, customCategories, defaults, timezone, saving, onSave, onDelete }: {
  body?: ExpenseBody; customCategories: string[]; defaults?: Partial<Pick<ExpenseDraft, 'payer' | 'method'>>;
  timezone: string; saving: boolean; onSave: (body: ExpenseBody) => void; onDelete?: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => expenseDraft(timezone, body, defaults));
  const [extra, setExtra] = useState<string[]>(() => body?.payload.category === 'custom' ? [body.payload.custom_category] : []);
  const [adding, setAdding] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState('');
  const set = <K extends keyof ExpenseDraft>(key: K, value: ExpenseDraft[K]) => { setDraft(current => ({ ...current, [key]: value })); setError(''); };
  const same = (a: string, b: string) => a.toLocaleLowerCase('vi') === b.toLocaleLowerCase('vi');
  const customs = [...customCategories, ...extra.filter(name => !customCategories.some(item => same(item, name)))];
  const selectedCustom = (name: string) => draft.category === 'custom' && same(draft.custom, name);
  function addCategory() {
    const name = normalizeCategoryName(newCategory);
    if (!name) { setError('Vui lòng nhập tên danh mục.'); return; }
    if ([...name].length > 40) { setError('Tên danh mục tối đa 40 ký tự.'); return; }
    const existing = Object.entries(categoryLabels).find(([, label]) => same(label, name));
    if (existing) setDraft(current => ({ ...current, category: existing[0] as StandardCategory, custom: '' }));
    else {
      const known = customs.find(item => same(item, name)) ?? name;
      if (known === name && !customs.some(item => same(item, name))) setExtra(current => [...current, name]);
      setDraft(current => ({ ...current, category: 'custom', custom: known }));
    }
    setNewCategory(''); setAdding(false); setError('');
  }
  const amount = parseAmount(draft.amount);
  return <form className="stack expense-form" onSubmit={event => {
    event.preventDefault();
    if (adding && newCategory.trim()) { addCategory(); return; }
    try { const next = expenseRecord(draft, timezone); setError(''); onSave(next); }
    catch (error) { setError(error instanceof DataError ? error.message : 'Chưa đọc được thông tin chi tiêu.'); }
  }}>
    <label className="amount-field">Số tiền
      <span className="amount-control"><input name="amount" required inputMode="numeric" autoComplete="off" placeholder="0" value={draft.amount} disabled={saving}
        aria-describedby={`${id}-amount`} onChange={event => set('amount', formatAmountInput(event.target.value))} /><span aria-hidden="true">đ</span></span></label>
    <div className="amount-presets" role="group" aria-label="Cộng nhanh số tiền">{amountPresets.map(value =>
      <button key={value} type="button" disabled={saving || amount + value > maxAmount} onClick={() => set('amount', formatAmountInput(String(amount + value)))}>+{value / 1000}k</button>)}
      {amount > 0 && <button type="button" className="text-button" disabled={saving} onClick={() => set('amount', '')}>Xóa</button>}</div>
    <p id={`${id}-amount`} className="muted" aria-live="polite">{amount ? formatMoney(amount) : 'Nhập số tiền bằng VND.'}</p>
    <fieldset className="choice-fieldset"><legend>Danh mục</legend>
      <div className="choice-grid">
        {(Object.keys(categoryLabels) as StandardCategory[]).map(key => <button key={key} type="button" aria-pressed={draft.category === key} disabled={saving}
          onClick={() => setDraft(current => ({ ...current, category: key, custom: '' }))}><Icon name={categoryIcons[key]} />{categoryLabels[key]}</button>)}
        {customs.map(name => <button key={name} type="button" aria-pressed={selectedCustom(name)} disabled={saving}
          onClick={() => setDraft(current => ({ ...current, category: 'custom', custom: name }))}><Icon name="tag" /><span>{name}</span></button>)}
        {!adding && <button type="button" className="choice-add" disabled={saving} onClick={() => { setAdding(true); setError(''); }}><Icon name="plus" />Thêm danh mục</button>}
      </div>
      {adding && <div className="row form-row">
        <label>Tên danh mục mới<input name="new-category" maxLength={40} autoFocus value={newCategory} disabled={saving} placeholder="Ví dụ: Bơi lội, Xe đẩy"
          onChange={event => setNewCategory(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); setAdding(false); setNewCategory(''); } }} /></label>
        <button type="button" disabled={saving} onClick={addCategory}>Thêm</button>
        <button type="button" className="text-button" disabled={saving} onClick={() => { setAdding(false); setNewCategory(''); }}>Hủy</button></div>}
      {!adding && <p className="muted">Danh mục mới được lưu cùng khoản chi và dùng chung cho cả gia đình.</p>}
    </fieldset>
    <label>Mô tả (không bắt buộc)<input name="title" maxLength={120} value={draft.title} disabled={saving} placeholder="Ví dụ: 2 hộp sữa, khám tai mũi họng" onChange={event => set('title', event.target.value)} /></label>
    <fieldset className="choice-fieldset"><legend>Người trả</legend>
      <div className="chart-options">{(Object.keys(payerLabels) as ExpensePayer[]).map(key =>
        <button key={key} type="button" aria-pressed={draft.payer === key} disabled={saving} onClick={() => set('payer', key)}>{payerLabels[key]}</button>)}</div></fieldset>
    <fieldset className="choice-fieldset"><legend>Hình thức thanh toán</legend>
      <div className="chart-options">{(Object.keys(methodLabels) as ExpenseMethod[]).map(key =>
        <button key={key} type="button" aria-pressed={draft.method === key} disabled={saving} onClick={() => set('method', key)}>{methodLabels[key]}</button>)}</div></fieldset>
    <div className="row"><label>Ngày chi<DateInput name="date" required value={draft.date} max={dayKey(Date.now(), timezone)} disabled={saving}
      onChange={date => set('date', date)} ariaLabel="Chọn ngày chi" /></label>
      <label>Giờ<TimeInput name="time" required value={draft.time} disabled={saving} onChange={time => set('time', time)} ariaLabel="Giờ" /></label></div>
    <label>Ghi chú<textarea name="note" maxLength={500} value={draft.note} disabled={saving} placeholder="Nơi mua, bảo hành, hóa đơn…" onChange={event => set('note', event.target.value)} /></label>
    {error && <p className="form-feedback" role="alert">{error}</p>}
    <button className="primary" disabled={saving}>{saving ? 'Đang lưu…' : body ? 'Lưu thay đổi' : amount ? `Lưu khoản chi ${formatMoney(amount)}` : 'Lưu khoản chi'}</button>
    {onDelete && <button className="danger-button" type="button" disabled={saving} onClick={onDelete}>Xóa khoản chi</button>}
  </form>;
}
