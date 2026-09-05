import { useId, useState } from 'react';
import type { EventBody, LocalEvent } from '../domain/types';
import { Icon } from './Icon';

const preferenceKey = 'noi:quick-collapsed';
function readCollapsed() {
  try { return window.localStorage.getItem(preferenceKey) === 'true'; } catch { return false; }
}

export function QuickActions({ babyName, running, saving, onAction }: {
  babyName: string; running: LocalEvent[]; saving: boolean; onAction: (type: EventBody['type']) => void;
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const id = useId();
  const breast = running.some(event => event.body.type === 'breast');
  const sleep = running.some(event => event.body.type === 'sleep');
  const actions: { type: EventBody['type']; label: string; hint: string; active?: boolean }[] = [
    { type: 'breast', label: breast ? 'Kết thúc bú' : 'Bú mẹ', hint: breast ? 'Chọn thời điểm kết thúc' : 'Bắt đầu bên trái / phải', active: breast },
    { type: 'bottle', label: 'Bình sữa', hint: 'Ghi lượng sữa của con' },
    { type: 'diaper', label: 'Thay tã', hint: 'Ướt, bẩn hoặc cả hai' },
    { type: 'sleep', label: sleep ? 'Đã thức' : 'Ngủ', hint: sleep ? 'Kết thúc giấc ngủ' : 'Ghi khi con vào giấc', active: sleep },
  ];
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try { window.localStorage.setItem(preferenceKey, String(next)); } catch { /* Still usable without storage. */ }
  }
  const toggleLabel = `${collapsed ? 'Mở rộng' : 'Thu gọn'} Ghi nhận nhanh`;
  return <section className="quick-recording" data-collapsed={collapsed} aria-label="Ghi nhận nhanh">
    <div className="quick-heading"><strong>Ghi nhận nhanh</strong><small>Một chút ghi nhớ, thêm phần an tâm</small></div>
    <button className="icon-button quick-toggle" aria-label={toggleLabel} title={toggleLabel} aria-expanded={!collapsed} aria-controls={id} onClick={toggle}><Icon name="down" /></button>
    <div id={id} className="quick-actions" role="group" aria-label={`Ghi nhanh cho ${babyName}`}>
      {actions.map(action => <button key={action.type} className="quick-button" data-running={action.active} disabled={saving}
        aria-label={action.label} title={action.label} onClick={() => onAction(action.type)}><Icon name={action.type} />
        {!collapsed && <span><strong>{action.label}</strong><small>{action.hint}</small></span>}
      </button>)}
    </div>
  </section>;
}