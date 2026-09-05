import type { RenameTarget } from '../cloud/rename-profile';
import type { Baby, Family } from '../domain/types';
import { Icon } from './Icon';

export function FamilyProfiles({ family, babies, owner, memberCount, canEdit, onRename }: {
  family: Family; babies: Baby[]; owner: boolean; memberCount: number; canEdit: boolean; onRename: (target: RenameTarget) => void;
}) {
  return <>
    <div className="profile-card"><span className="avatar"><Icon name="family" /></span><div><h2>{family.name}</h2>
      <p>{owner ? 'Chủ gia đình' : 'Người chăm sóc'} · {memberCount} thành viên</p></div></div>
    {owner && <button className="text-button profile-rename" disabled={!canEdit} onClick={() => onRename({ type: 'family', familyId: family.id, name: family.name })}><Icon name="edit" />Đổi tên gia đình</button>}
    <ul className="baby-list" aria-label="Các bé trong gia đình">{babies.filter(baby => baby.family_id === family.id).map(baby => <li key={baby.id}>
      <span>{baby.nickname}</span>{owner && <button className="icon-button" aria-label={`Đổi tên bé ${baby.nickname}`} title={`Đổi tên bé ${baby.nickname}`} disabled={!canEdit}
        onClick={() => onRename({ type: 'baby', familyId: family.id, babyId: baby.id, name: baby.nickname })}><Icon name="edit" /></button>}
    </li>)}</ul>
    {owner && !canEdit && <p className="muted">Kết nối mạng và xác nhận phiên để đổi tên gia đình hoặc tên bé.</p>}
  </>;
}