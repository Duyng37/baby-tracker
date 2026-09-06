import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LocalStore } from '../data/store';
import { useStore } from '../data/useStore';
import { useSync } from '../sync/useSync';
import { changeTimer, DataError, isRunning } from '../domain/events';
import { dayKey, duration, labels, summarizeDay } from '../domain/summary';
import type { ActivityKind, CareEventType, EventBody, LocalEvent, QuickEventType, Scope, VaccinationStatus } from '../domain/types';
import { signOut } from '../cloud/supabase';
import { Sheet } from './Sheet';
import { OnlineSetup } from './OnlineSetup';
import { Invitation } from './Invitation';
import { Icon } from './Icon';
import { LoadingScreen } from './LoadingScreen';
import { isJournalBody, Journal, journalEvents } from './Journal';
import { JournalDateInput } from './JournalDateInput';
import { formatDate } from './DateInput';
import { Metrics } from './Metrics';
import { useTheme } from './theme';
import { saveUnchangedEvent } from './event-edits';
import { authEvents } from '../cloud/supabase';
import { BackupPanel } from './BackupPanel';
import { OfflineSettings } from './OfflineSettings';
import { QuickActions } from './QuickActions';
import { QuickRecord } from './QuickRecord';
import { FamilyProfiles } from './FamilyProfiles';
import { RenameProfile } from './RenameProfile';
import { ThemeSwitch } from './ThemeSwitch';
import { VaccinationSchedule } from './VaccinationSchedule';
import { VaccinationForm } from './VaccinationForm';
import { CareActions } from './CareActions';
import { CareForm } from './CareForm';
import { isCareBody, isCareType } from './care-record';
import { MedicationSchedule } from './MedicationSchedule';
import { scheduleToastDismiss } from './toast';
import type { RenameTarget } from '../cloud/rename-profile';
import { consumePendingInvitation } from './invitation-link';
import { JournalEntryForm } from './JournalEntryForm';
import { isQuickBody } from './journal-entry';
import { BugReport } from './BugReport';

type Screen = 'today' | 'journal' | 'care' | 'family';
type Panel = null | 'switch' | EventBody['type'] | 'new-baby' | 'invite' | 'join' | 'signout' | 'backup' | 'rename' | 'bug-report' | LocalEvent;
function isQuickPanel(panel: Panel): panel is QuickEventType {
  return typeof panel === 'string' && ['bottle', 'diaper', 'breast', 'sleep'].includes(panel);
}
function browserInvitationToken() {
  return typeof window === 'undefined' ? '' : consumePendingInvitation(window.sessionStorage);
}
const screens: [Screen, string][] = [['today', 'Hôm nay'], ['journal', 'Nhật ký'], ['care', 'Chăm con'], ['family', 'Gia đình']];
const descriptions: Record<Screen, string> = {
  today: 'Từng điều nhỏ, cùng con lớn lên.', journal: 'Nhìn lại nhẹ nhàng và nhớ giúp bạn những nhịp sinh hoạt của con.',
  care: 'Từ cữ bú đến giờ chơi, cùng con lớn lên mỗi ngày.',
  family: 'Cùng nhau chăm bé, sẻ chia mỗi ngày.',
};
const panelTitles = { switch: 'Chọn bé', bottle: 'Ghi bình sữa', diaper: 'Thay tã', breast: 'Bắt đầu bú mẹ', sleep: 'Ghi giấc ngủ',
  vaccination: 'Thêm lịch tiêm chủng',
  medication: 'Lịch uống thuốc', meal: 'Ghi ăn uống', growth: 'Ghi chiều cao, cân nặng', activity: 'Ghi hoạt động',
  'new-baby': 'Thêm bé', invite: 'Mời người chăm sóc', join: 'Tham gia gia đình', signout: 'Đăng xuất trên thiết bị', backup: 'Sao lưu và khôi phục', rename: 'Đổi tên hồ sơ', 'bug-report': 'Báo lỗi app' };

export function Tracker({ store, localOnly = false }: { store: LocalStore; localOnly?: boolean }) {
  const view = useStore(store);
  const sync = useSync(store, !localOnly);
  const { theme, toggleTheme } = useTheme();
  const content = useRef<HTMLElement>(null);
  const [screen, setScreen] = useState<Screen>('today');
  const [selected, setSelected] = useState('');
  const [invitationToken, setInvitationToken] = useState(() => localOnly ? '' : browserInvitationToken());
  const [panel, setPanel] = useState<Panel>(() => invitationToken ? 'join' : null);
  const [quickTimer, setQuickTimer] = useState<LocalEvent>();
  const [activityKind, setActivityKind] = useState<ActivityKind>('bath');
  const [vaccinationStatus, setVaccinationStatus] = useState<VaccinationStatus>();
  const [renameTarget, setRenameTarget] = useState<RenameTarget>();
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const writing = useRef(false);
  const invitationOpened = useRef(false);
  const focusContentAfterWrite = useRef(false);
  const lastWrite = useRef(0);
  const [undo, setUndo] = useState<{ before: LocalEvent; after: EventBody } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [date, setDate] = useState('');
  const [filter, setFilter] = useState('all');
  const [milk, setMilk] = useState<'formula' | 'breast_milk' | 'mixed'>('formula');
  const baby = view.workspace.babies.find(b => b.id === selected) ?? view.workspace.babies[0];
  const family = view.workspace.families.find(f => f.id === baby?.family_id);
  const timezone = family?.timezone ?? 'Asia/Ho_Chi_Minh';
  const today = dayKey(now, timezone);
  const scope: Scope | null = baby ? { family_id: baby.family_id, baby_id: baby.id } : null;
  const events = view.events.filter(e => e.family_id === scope?.family_id && e.baby_id === scope?.baby_id);
  const active = view.events.filter(e => e.family_id === family?.id && isRunning(e.body));
  const mine = active.filter(e => e.baby_id === baby?.id);
  const own = view.workspace.memberships.some(m => m.family_id === family?.id && m.user_id === store.db.userId && m.role === 'owner');
  const pending = view.operations.filter(op => op.family_id === family?.id);
  const conflicted = pending.filter(op => op.conflict).length;
  const blocked = pending.filter(op => op.blocked && !op.conflict).length;
  const quarantined = view.operations.filter(op => !view.workspace.families.some(f => f.id === op.family_id)).length;
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let alive = true;
    void store.db.state.get('selectedBaby').then(row => { if (alive && typeof row?.value === 'string') setSelected(row.value); }).catch(() => {});
    return () => { alive = false; };
  }, [store]);
  useEffect(() => { setPanel(null); setUndo(null); setNotice(''); setDate(''); }, [baby?.id]);
  useEffect(() => {
    if (localOnly || invitationOpened.current) return;
    const token = invitationToken || browserInvitationToken();
    if (token) { invitationOpened.current = true; setInvitationToken(token); openPanel('join'); }
  }, [localOnly, invitationToken]);
  useEffect(() => {
    if (!notice || panel) return;
    const timer = scheduleToastDismiss(() => { setNotice(''); setUndo(null); });
    return () => clearTimeout(timer);
  }, [notice, panel]);
  useLayoutEffect(() => {
    // Deletion and undo remove their triggers, sometimes after the dialog has closed.
    if (!panel && focusContentAfterWrite.current) {
      focusContentAfterWrite.current = false;
      content.current?.focus({ preventScroll: true });
    }
  }, [panel, saving]);

  function openPanel(next: Panel) {
    setNotice(''); setPanel(next);
    // Capture the timer at opening so a concurrent edit cannot silently be overwritten.
    setQuickTimer(isQuickPanel(next) ? mine.find(event => event.body.type === next) : undefined);
  }
  function navigate(next: Screen) {
    setScreen(next);
    content.current?.scrollTo({ top: 0 });
    content.current?.focus({ preventScroll: true });
  }
  function openVaccination(event?: LocalEvent, status?: VaccinationStatus) {
    setVaccinationStatus(status); openPanel(event ?? 'vaccination');
  }
  function openCare(type: QuickEventType | CareEventType, kind: ActivityKind = 'bath') {
    setActivityKind(kind); openPanel(type);
  }
  async function write(action: () => Promise<void>, successMessage: string, focusContent = false) {
    if (writing.current || Date.now() - lastWrite.current < 350) return;
    writing.current = true; lastWrite.current = Date.now(); setSaving(true); setNotice('');
    try {
      await action(); setNotice(successMessage); focusContentAfterWrite.current = focusContent;
      setPanel(null); sync.kick();
    }
    catch (error) { setNotice(error instanceof DataError ? error.message : 'Chưa lưu được trên thiết bị. Không đóng app; hãy kiểm tra dung lượng/quyền lưu trữ.'); }
    finally { writing.current = false; setSaving(false); }
  }
  function create(body: EventBody) {
    if (!scope) return;
    const target = { ...scope };
    void write(async () => { await store.save(target, crypto.randomUUID(), body); setUndo(null); }, body.type === 'vaccination' ? 'Đã lưu lịch tiêm.' : 'Đã lưu ghi nhận.');
  }
  function change(event: LocalEvent, body: EventBody, removable = false) {
    void write(async () => {
      await saveUnchangedEvent(store, event, body);
      setUndo(removable ? { before: event, after: body } : null);
    }, removable ? 'Đã xóa ghi nhận.' : body.type === 'vaccination' ? 'Đã cập nhật lịch tiêm.' : 'Đã cập nhật ghi nhận.', removable || event.body.type === 'vaccination');
  }
  function retryBlocked() {
    if (!family || !blocked) return;
    void write(async () => { await store.retryBlocked(family.id); }, `Đã đưa ${blocked} bản ghi vào hàng chờ gửi lại.`);
  }
  function timer(event: LocalEvent, action: 'stop' | 'switch') {
    try { change(event, changeTimer(event.body, action)); }
    catch (error) { setNotice(error instanceof DataError ? error.message : 'Không đổi được timer.'); }
  }
  async function restore() {
    if (!undo) return;
    const saved = undo;
    await write(async () => {
      await saveUnchangedEvent(store, { ...saved.before, body: saved.after }, saved.before.body);
      setUndo(null);
    }, 'Đã khôi phục ghi nhận.', true);
  }
  const journalDay = screen === 'journal' ? date || today : today;
  const visible = journalEvents(events, journalDay, timezone, screen === 'today' ? 'all' : filter);
  const summary = summarizeDay(events, journalDay, timezone, now);
  const summaryTitle = journalDay === today ? 'Ngày hôm nay' : `Tổng hợp ngày ${formatDate(journalDay)}`;
  const timeLabel = (time: string) => new Intl.DateTimeFormat('vi', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(time));
  const syncLabel = localOnly ? 'Chỉ trên thiết bị · chưa xác nhận phiên cloud' : !sync.online ? 'Offline · ghi trên máy vẫn hoạt động' : sync.busy ? 'Đang đồng bộ…'
    : sync.message ? 'Chưa hoàn tất đồng bộ'
    : pending.length ? `${pending.length} thay đổi chờ cloud` : view.lastContact ? 'Đã đồng bộ lần gần nhất' : 'Chưa xác nhận cloud';
  const syncDetail = syncLabel + (!localOnly && view.lastContact && !pending.length ? ` · ${timeLabel(new Date(view.lastContact).toISOString())}` : '');
  const syncAction = localOnly ? 'Kiểm tra phiên' : 'Thử đồng bộ';
  const syncOffline = localOnly || !sync.online;
  const syncWarning = syncOffline || !!sync.message;

  if (!view.ready) return <LoadingScreen detail="Đang mở dữ liệu trên thiết bị…" />;
  if (view.error) return <main className="welcome"><h1>Chưa mở được bộ nhớ thiết bị</h1><p>Kiểm tra quyền lưu trữ hoặc dung lượng. Không xóa dữ liệu trình duyệt nếu còn thay đổi chưa gửi.</p></main>;
  return <div className="app">
    <a className="skip-link" href="#content">Đến nội dung</a>
    <header className="header">
      <button className="baby-button" onClick={() => openPanel('switch')} disabled={!baby} aria-label={baby ? `Đổi bé, đang chọn ${baby.nickname}` : 'Chào gia đình mới'}>
        <span className="avatar" aria-hidden="true">{baby?.nickname.slice(0, 1) ?? 'n'}</span>
        <span className="baby-info"><strong>{baby?.nickname ?? 'Chào gia đình mới'}</strong><small>{family?.name ?? 'Bắt đầu hành trình bên con'}</small></span>
        {baby && <Icon name="down" />}</button>
      <div className="header-actions"><div className="sync-control">
        <button className="icon-button sync-button" data-offline={syncOffline} data-warning={syncWarning} data-busy={sync.busy}
          aria-busy={!syncOffline && sync.busy}
          aria-label={`${syncDetail}. ${syncAction}`} title={`${syncDetail}. ${syncAction}`}
          onClick={() => localOnly ? authEvents.dispatchEvent(new Event('recheck')) : sync.kick()} disabled={sync.busy || (!localOnly && !sync.online)}>
          <Icon name={syncOffline ? 'offline' : sync.busy ? 'loading' : sync.message ? 'info' : pending.length || !view.lastContact ? 'swap' : 'cloud'} /></button>
        <span className="sr-only" role="status">{syncDetail}</span><span className="sync-tooltip" aria-hidden="true">{syncDetail}</span>
      </div><button className="icon-button theme-button" aria-label={theme === 'dark' ? 'Bật chế độ sáng' : 'Bật chế độ tối'} onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'sleep'} /></button></div>
    </header>
    {notice && !panel && <div className="notice" role="status"><span>{notice}</span>{undo && <button disabled={saving} onClick={restore}>Hoàn tác</button>}<button className="icon-button" aria-label="Đóng thông báo" onClick={() => setNotice('')}><Icon name="close" /></button></div>}
    <main id="content" className="content" ref={content} tabIndex={-1} aria-label={screens.find(([key]) => key === screen)![1]}>
      {localOnly && <p className="banner">Đang dùng dữ liệu đã lưu trên thiết bị. Ghi nhận mới vẫn được giữ trên máy; đồng bộ và quản lý gia đình chờ xác thực lại. Quyền truy cập cloud có thể đã thay đổi.</p>}
      {sync.message && <p className="banner" role="status">{sync.message}</p>}
      {blocked > 0 && <p className="banner" role="alert">{blocked} bản ghi bị cloud từ chối nhưng vẫn được giữ trên thiết bị. <button className="text-button" disabled={saving || sync.busy} onClick={retryBlocked}>Thử gửi lại</button></p>}
      {conflicted > 0 && <p className="banner" role="alert">{conflicted} bản ghi có xung đột. Cả bản local và phản hồi cloud được giữ; chưa có màn hình giải quyết trong bản thử này.</p>}
      {quarantined > 0 && <p className="banner">Có {quarantined} thay đổi được cách ly vì quyền gia đình không còn khả dụng. Không tự xóa dữ liệu.</p>}
      {!baby ? <section className="card stack"><span className="eyebrow">CHÀO MỪNG ĐẾN VỚI NÔI</span><h1>Gia đình của bạn</h1>{localOnly ? <p>Chưa có hồ sơ khả dụng trên máy. Kết nối mạng và xác nhận phiên để tải nhật ký hoặc tạo gia đình.</p> : <OnlineSetup store={store} onDone={sync.kick} />}
        <div className="row"><button disabled={localOnly} onClick={() => openPanel('join')}>Tôi có mã mời</button><button onClick={() => openPanel('backup')}>Sao lưu và khôi phục</button><button className="text-button" onClick={() => openPanel('signout')}>Đăng xuất</button></div></section>
        : <>
          <div className="page-title"><span className="eyebrow">{new Intl.DateTimeFormat('vi', { dateStyle: 'full', timeZone: timezone }).format(now)}</span><h1>{screens.find(([key]) => key === screen)![1]}</h1><p>{descriptions[screen]}</p></div>
          {active.length > 0 && <section aria-label="Timer trong gia đình" className="timers">{active.map(event => <article className="timer card" key={event.id}>
            <div className="timer-top"><span className="event-icon"><Icon name={event.body.type} /></span><div><strong>{labels[event.body.type]} · {view.workspace.babies.find(b => b.id === event.baby_id)?.nickname}</strong>
              <small>Từ {timeLabel(event.body.started_at)}{event.body.type === 'breast' ? ` · bên ${event.body.payload.segments.at(-1)!.side === 'left' ? 'trái' : 'phải'}` : ''}</small></div><span className="running-pill">Đang chạy</span></div>
            <p className="timer-value">{duration(now - Date.parse(event.body.started_at))}</p>
            <div className="row">{event.body.type === 'breast' && <button disabled={saving} onClick={() => timer(event, 'switch')}><Icon name="swap" />Đổi bên</button>}
              <button className="primary" disabled={saving} onClick={() => timer(event, 'stop')}>{event.body.type === 'sleep' ? 'Đã thức' : 'Kết thúc'}</button></div>
          </article>)}</section>}
          {(screen === 'today' || screen === 'journal') && <section aria-label={summaryTitle}><div className="section-heading"><h2>{summaryTitle}</h2><small>{baby.nickname}</small></div>
            <Metrics summary={summary} />
          </section>}
          {(screen === 'today' || screen === 'journal') && <section><div className="section-heading"><h2>{screen === 'today' ? 'Nhịp hôm nay' : `Nhật ký · ${baby.nickname}`}</h2>
            {screen === 'today' ? <button className="text-button" onClick={() => navigate('journal')}>Xem nhật ký<Icon name="chevron" /></button> : <small>{visible.length} hoạt động</small>}</div>
            {screen === 'journal' && <div className="row journal-filters"><JournalDateInput key={baby.id} value={journalDay} onChange={setDate} />
              <label>Hoạt động<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Tất cả</option>{Object.entries(labels).filter(([key]) => key !== 'vaccination').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>}
            {!visible.length && <div className="empty"><Icon name="journal" /><h3>{screen === 'journal' ? 'Chưa có hoạt động phù hợp.' : 'Một khoảng trống nhỏ, sẵn sàng để ghi.'}</h3><p>{screen === 'journal' ? 'Thử chọn ngày hoặc hoạt động khác. Khi ghi nhanh, bạn có thể chọn ngày/giờ để ghi bù.' : `Chạm một trong bốn nút bên dưới để ghi cho ${baby.nickname}.`}</p></div>}
            <Journal events={visible} timezone={timezone} onSelect={openPanel} />
          </section>}
          {screen === 'journal' && <section className="card stack"><div className="section-heading"><h2>7 ngày gần nhất</h2><Icon name="insights" /></div><p>Đã ghi {events.filter(e => isJournalBody(e.body) && Date.parse(e.body.started_at) >= now - 7 * 86_400_000).length} hoạt động cho {baby.nickname}.</p><p className="muted">Mỗi ghi nhận là một chút an tâm. Biểu đồ theo ngày sẽ được bổ sung; bạn có thể xuất bản sao lưu ở màn Gia đình.</p></section>}
          {screen === 'care' && scope && <section className="stack">
            <CareActions babyName={baby.nickname} running={mine} saving={saving} onAction={openCare} />
            <MedicationSchedule events={events} scope={scope} babyName={baby.nickname} timezone={timezone} now={now} saving={saving}
              onAdd={() => openCare('medication')} onEdit={openPanel} />
            <VaccinationSchedule events={events} scope={scope} babyName={baby.nickname} timezone={timezone} now={now} saving={saving}
              onAdd={status => openVaccination(undefined, status)} onEdit={event => openVaccination(event)} onComplete={event => openVaccination(event, 'completed')} />
          </section>}
          {screen === 'family' && <section className="stack"><article className="card stack">
            {family && <FamilyProfiles family={family} babies={view.workspace.babies} owner={own} memberCount={view.workspace.memberships.filter(m => m.family_id === family.id).length}
              canEdit={!localOnly && sync.online} onRename={target => { setRenameTarget(target); openPanel('rename'); }} />}
            {own && <div className="family-actions"><button disabled={localOnly} onClick={() => openPanel('new-baby')}><Icon name="plus" />Thêm bé</button><button disabled={localOnly} onClick={() => openPanel('invite')}><Icon name="family" />Mời người chăm sóc</button></div>}</article>
            <div className="settings-group">
              <button className="setting-row" disabled={localOnly} onClick={() => openPanel('join')}><Icon name="family" /><span><strong>Nhận lời mời</strong><small>Cùng người thân chăm sóc bé</small></span><Icon name="chevron" /></button>
              <button className="setting-row" onClick={() => openPanel('backup')}><Icon name="journal" /><span><strong>Sao lưu và khôi phục</strong><small>Tệp riêng trên máy · không ghi đè nhật ký</small></span><Icon name="chevron" /></button>
              <button className="setting-row" onClick={() => openPanel('bug-report')}><Icon name="bug" /><span><strong>Báo lỗi app</strong><small>Gửi mô tả sự cố tới nhóm phát triển</small></span><Icon name="chevron" /></button>
              <ThemeSwitch />
            </div>
            <div className="settings-group"><button className="setting-row danger" onClick={() => openPanel('signout')}><Icon name="logout" /><span><strong>Đăng xuất</strong><small>Giữ lại dữ liệu chưa gửi trên thiết bị</small></span><Icon name="chevron" /></button></div>
            <OfflineSettings />
          </section>}
        </>}
    </main>
    {baby && <footer className="footer"><QuickActions babyName={baby.nickname} running={mine} saving={saving} onAction={openPanel} />
      <nav className="bottom-nav" aria-label="Điều hướng chính">{screens.map(([key, label]) => <button key={key} aria-current={screen === key ? 'page' : undefined} onClick={() => navigate(key)}><Icon name={key} />{label}</button>)}</nav></footer>}
    {panel && <Sheet title={typeof panel === 'object' ? panel.body.type === 'vaccination' ? 'Cập nhật lịch tiêm chủng' : 'Chi tiết ghi nhận' : isQuickPanel(panel) && quickTimer ? panel === 'sleep' ? 'Kết thúc giấc ngủ' : 'Kết thúc bú mẹ' : panelTitles[panel]} onClose={() => setPanel(null)} dismissOnBackdrop={panel === 'switch'}>
      {baby && (typeof panel === 'object' || isQuickPanel(panel) || panel === 'vaccination' || isCareType(panel)) && <p className="sheet-scope">{baby.nickname} · {family?.name}</p>}
      {panel === 'switch' && view.workspace.families.map(f => <section key={f.id}><h3>{f.name}</h3>{view.workspace.babies.filter(b => b.family_id === f.id).map(b => <button className="baby-option" key={b.id} onClick={() => {
        setSelected(b.id); setPanel(null); void store.db.state.put({ key: 'selectedBaby', value: b.id }).catch(() => setNotice('Chưa lưu được lựa chọn bé.'));
      }} aria-pressed={baby?.id === b.id}><span className="avatar" aria-hidden="true">{b.nickname.slice(0, 1)}</span><span>{b.nickname}</span>{baby?.id === b.id && <Icon name="check" />}</button>)}</section>)}
      {isQuickPanel(panel) && <QuickRecord key={panel} type={panel} running={quickTimer?.body} timezone={timezone} saving={saving} milk={milk} onMilkChange={setMilk}
        onSave={body => quickTimer ? change(quickTimer, body) : create(body)} />}
      {(panel === 'vaccination' || (typeof panel === 'object' && panel.body.type === 'vaccination')) && <VaccinationForm
        key={`${typeof panel === 'object' ? panel.id : 'new'}:${vaccinationStatus ?? 'edit'}`} timezone={timezone} saving={saving} initialStatus={vaccinationStatus}
        body={typeof panel === 'object' && panel.body.type === 'vaccination' ? panel.body : undefined}
        onSave={body => typeof panel === 'object' ? change(panel, body) : create(body)}
        onDelete={typeof panel === 'object' ? () => change(panel, { ...panel.body, deleted: true }, true) : undefined} />}
      {typeof panel === 'string' && isCareType(panel) && <CareForm key={panel} type={panel} kind={activityKind} timezone={timezone} saving={saving} onSave={create} />}
      {typeof panel === 'object' && isCareBody(panel.body) && <CareForm key={panel.id} type={panel.body.type} body={panel.body} timezone={timezone} saving={saving}
        onSave={body => change(panel, body)} onDelete={() => change(panel, { ...panel.body, deleted: true }, true)} />}
      {typeof panel === 'object' && isQuickBody(panel.body) && <JournalEntryForm key={panel.id} body={panel.body} timezone={timezone} saving={saving}
        onSave={body => change(panel, body)} onDelete={() => change(panel, { ...panel.body, deleted: true }, true)} />}
      {panel === 'backup' && <BackupPanel store={store} localOnly={localOnly} onRestored={sync.kick} />}
      {panel === 'bug-report' && <BugReport />}
      {!localOnly && own && panel === 'rename' && renameTarget && <RenameProfile store={store} target={renameTarget}
        onDone={() => { setPanel(null); setNotice('Đã cập nhật tên.'); sync.kick(); }} />}
      {!localOnly && panel === 'new-baby' && <OnlineSetup store={store} familyId={family?.id} onDone={message => { setPanel(null); setNotice(message); sync.kick(); }} />}
      {!localOnly && (panel === 'invite' || panel === 'join') && <Invitation store={store} familyId={panel === 'invite' ? family?.id : undefined}
        initialToken={panel === 'join' ? invitationToken : undefined} onDone={() => { setInvitationToken(''); setPanel(null); setNotice('Đã tham gia gia đình.'); sync.kick(); }} />}
      {panel === 'signout' && <div className="stack"><p>Còn {view.operations.length} thay đổi chưa được cloud xác nhận. Đăng xuất sẽ giữ bản local riêng cho tài khoản này, không xóa; chỉ mở lại khi đăng nhập đúng tài khoản.</p><p>Trên máy dùng chung, không coi cache trình duyệt là dữ liệu đã mã hóa. Chưa có chức năng dọn cache trong bản thử này.</p>
        <p>Nếu web và ứng dụng màn hình chính dùng chung phiên từ lúc cài, đăng xuất sẽ ngắt phiên của cả hai. Cần mạng để xác nhận đăng xuất.</p>
        <button className="primary" onClick={() => { void signOut().catch(() => setNotice('Chưa đăng xuất được. Vui lòng thử lại khi có mạng.')); }}>Đăng xuất, giữ dữ liệu chưa gửi</button></div>}
      {notice && <p className="form-feedback" role="alert">{notice}</p>}
    </Sheet>}
  </div>;
}