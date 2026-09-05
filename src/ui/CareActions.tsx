import { activityLabels } from '../domain/summary';
import type { ActivityKind, CareEventType, LocalEvent, QuickEventType } from '../domain/types';
import { Icon, type IconName } from './Icon';

type CareAction = { type: QuickEventType | CareEventType; kind?: ActivityKind; label: string; hint: string; icon: IconName };
export function CareActions({ babyName, running, saving, onAction }: {
  babyName: string; running: LocalEvent[]; saving: boolean;
  onAction: (type: QuickEventType | CareEventType, kind?: ActivityKind) => void;
}) {
  const breast = running.some(event => event.body.type === 'breast');
  const sleep = running.some(event => event.body.type === 'sleep');
  const groups: { title: string; actions: CareAction[] }[] = [
    { title: 'Sinh hoạt hằng ngày', actions: [
      { type: 'breast', icon: 'breast', label: 'Bú mẹ', hint: breast ? 'Đang bú · chạm để kết thúc' : 'Ghi cữ bú bên trái / phải' },
      { type: 'bottle', icon: 'bottle', label: 'Bình sữa', hint: 'Lượng sữa và loại sữa' },
      { type: 'diaper', icon: 'diaper', label: 'Thay tã', hint: 'Tã ướt, tã bẩn hoặc cả hai' },
      { type: 'sleep', icon: 'sleep', label: 'Ngủ', hint: sleep ? 'Đang ngủ · chạm để ghi đã thức' : 'Ghi lại giấc ngủ của con' },
      { type: 'meal', icon: 'meal', label: 'Ăn uống', hint: 'Món ăn, đồ uống và lượng dùng' },
    ] },
    { title: 'Sức khỏe & lớn khôn', actions: [
      { type: 'medication', icon: 'medication', label: 'Lịch uống thuốc', hint: 'Lên lịch hoặc ghi lần đã uống' },
      { type: 'growth', icon: 'growth', label: 'Chiều cao, cân nặng', hint: 'Lưu số đo của con theo ngày' },
    ] },
    { title: 'Hoạt động', actions: (Object.entries(activityLabels) as [ActivityKind, string][]).map(([kind, label]) => ({
      type: 'activity', kind, icon: kind, label, hint: 'Ghi thời điểm và thời lượng',
    })) },
  ];
  return <section className="stack care-actions" aria-label={`Chăm con · ${babyName}`}>
    {groups.map(group => <section key={group.title} aria-label={group.title}>
      <div className="section-heading"><h2>{group.title}</h2></div>
      <div className="settings-group">{group.actions.map(action => <button key={action.kind ?? action.type} className="setting-row" disabled={saving}
        onClick={() => onAction(action.type, action.kind)}><Icon name={action.icon} /><span><strong>{action.label}</strong><small>{action.hint}</small></span><Icon name="chevron" /></button>)}</div>
    </section>)}
  </section>;
}