import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LocalStore } from '../data/store';
import { useStore } from '../data/useStore';
import { useSync } from '../sync/useSync';
import { changeTimer, DataError, isRunning } from '../domain/events';
import { dayKey, duration, labels, summarize } from '../domain/summary';
import type { EventBody, LocalEvent, QuickEventType, Scope, VaccinationStatus } from '../domain/types';
import { signOut } from '../cloud/supabase';
import { Sheet } from './Sheet';
import { OnlineSetup } from './OnlineSetup';
import { Invitation } from './Invitation';
import { Icon } from './Icon';
import { LoadingScreen } from './LoadingScreen';
import { eventDetail, Journal, journalEvents } from './Journal';
import { JournalDateInput } from './JournalDateInput';
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
import { scheduleToastDismiss } from './toast';
import type { RenameTarget } from '../cloud/rename-profile';

type Screen = 'today' | 'journal' | 'insights' | 'family';
type Panel = null | 'switch' | EventBody['type'] | 'new-family' | 'new-baby' | 'invite' | 'join' | 'signout' | 'backup' | 'rename' | LocalEvent;
function isQuickPanel(panel: Panel): panel is QuickEventType {
  return typeof panel === 'string' && ['bottle', 'diaper', 'breast', 'sleep'].includes(panel);
}
const screens: [Screen, string][] = [['today', 'Hôm nay'], ['journal', 'Nhật ký'], ['insights', 'Tổng quan'], ['family', 'Gia đình']];
const descriptions: Record<Screen, string> = {
  today: 'Từng điều nhỏ, cùng con lớn lên.', journal: 'Nhớ giúp bạn những nhịp sinh hoạt của con.',
  insights: 'Nhìn lại nhẹ nhàng, không so sánh.', family: 'Cùng nhau chăm bé, sẻ chia mỗi ngày.',
};
const panelTitles = { switch: 'Chọn bé', bottle: 'Ghi bình sữa', diaper: 'Thay tã', breast: 'Bắt đầu bú mẹ', sleep: 'Ghi giấc ngủ',
  vaccination: 'Thêm lịch tiêm chủng',
  'new-family': 'Thêm gia đình', 'new-baby': 'Thêm bé', invite: 'Mời người chăm sóc', join: 'Tham gia gia đình', signout: 'Đăng xuất trên thiết bị', backup: 'Sao lưu và khôi phục', rename: 'Đổi tên hồ sơ' };

export function Tracker({ store, localOnly = false }: { store: LocalStore; localOnly?: boolean }) {
  const view = useStore(store);
  const sync = useSync(store, !localOnly);
  const { theme, toggleTheme } = useTheme();
  const content = useRef<HTMLElement>(null);
  const [screen, setScreen] = useState<Screen>('today');
  const [selected, setSelected] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [quickTimer, setQuickTimer] = useState<LocalEvent>();
  const [vaccinationStatus, setVaccinationStatus] = useState<VaccinationStatus>();
  const [renameTarget, setRenameTarget] = useState<RenameTarget>();
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const writing = useRef(false);
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
  const conflicted = pending.filter(op => op.conflict || op.blocked).length;
  const quarantined = view.operations.filter(op => !view.workspace.families.some(f => f.id === op.family_id)).length;
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let alive = true;
    void store.db.state.get('selectedBaby').then(row => { if (alive && typeof row?.value === 'string') setSelected(row.value); }).catch(() => {});
    return () => { alive = false; };
  }, [store]);
  useEffect(() => { setPanel(null); setUndo(null); setNotice(''); setDate(''); }, [baby?.id]);
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
  const visible = journalEvents(events, screen === 'today' ? today : date || today, timezone, screen === 'today' ? 'all' : filter);
  const summary = summarize(events, now - 86_400_000, now);
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
      {conflicted > 0 && <p className="banner" role="alert">{conflicted} bản ghi có xung đột/lỗi. Cả bản local và phản hồi cloud được giữ; chưa có màn hình giải quyết trong bản thử này.</p>}
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
          {(screen === 'today' || screen === 'insights') && <section aria-label="Tổng hợp 24 giờ qua"><div className="section-heading"><h2>24 giờ qua</h2><small>{baby.nickname}</small></div>
            <Metrics summary={summary} />
            <div className="disclaimer"><Icon name="info" /><p className="muted">Tính cả timer đang chạy. Đây là nhật ký, không phải đánh giá sức khỏe hay hướng dẫn lượng sữa.</p></div>
          </section>}
          {(screen === 'today' || screen === 'journal') && <section><div className="section-heading"><h2>{screen === 'today' ? 'Nhịp hôm nay' : `Nhật ký · ${baby.nickname}`}</h2>
            {screen === 'today' ? <button className="text-button" onClick={() => navigate('journal')}>Xem nhật ký<Icon name="chevron" /></button> : <small>{visible.length} hoạt động</small>}</div>
            {screen === 'journal' && <div className="row journal-filters"><JournalDateInput key={baby.id} value={date || today} onChange={setDate} />
              <label>Hoạt động<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Tất cả</option>{Object.entries(labels).filter(([key]) => key !== 'vaccination').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>}
            {!visible.length && <div className="empty"><Icon name="journal" /><h3>{screen === 'journal' ? 'Chưa có hoạt động phù hợp.' : 'Một khoảng trống nhỏ, sẵn sàng để ghi.'}</h3><p>{screen === 'journal' ? 'Thử chọn ngày hoặc hoạt động khác. Khi ghi nhanh, bạn có thể chọn ngày/giờ để ghi bù.' : `Chạm một trong bốn nút bên dưới để ghi cho ${baby.nickname}.`}</p></div>}
            <Journal events={visible} timezone={timezone} onSelect={openPanel} />
          </section>}
          {screen === 'insights' && <section className="card stack"><div className="section-heading"><h2>7 ngày gần nhất</h2><Icon name="insights" /></div><p>Đã ghi {events.filter(e => !e.body.deleted && e.body.type !== 'vaccination' && Date.parse(e.body.started_at) >= now - 7 * 86_400_000).length} hoạt động cho {baby.nickname}.</p><p className="muted">Mỗi ghi nhận là một chút an tâm. Biểu đồ theo ngày sẽ được bổ sung; bạn có thể xuất bản sao lưu ở màn Gia đình.</p></section>}
          {screen === 'family' && <section className="stack"><article className="card stack">
            {family && <FamilyProfiles family={family} babies={view.workspace.babies} owner={own} memberCount={view.workspace.memberships.filter(m => m.family_id === family.id).length}
              canEdit={!localOnly && sync.online} onRename={target => { setRenameTarget(target); openPanel('rename'); }} />}
            {own && <div className="family-actions"><button disabled={localOnly} onClick={() => openPanel('new-baby')}><Icon name="plus" />Thêm bé</button><button disabled={localOnly} onClick={() => openPanel('invite')}><Icon name="family" />Mời người chăm sóc</button></div>}</article>
            {scope && <VaccinationSchedule events={events} scope={scope} babyName={baby.nickname} timezone={timezone} now={now} saving={saving}
              onAdd={status => openVaccination(undefined, status)} onEdit={event => openVaccination(event)} onComplete={event => openVaccination(event, 'completed')} />}
            <div className="settings-group">
              <button className="setting-row" disabled={localOnly} onClick={() => openPanel('new-family')}><Icon name="plus" /><span><strong>Tạo gia đình khác</strong><small>Mỗi gia đình một không gian riêng</small></span><Icon name="chevron" /></button>
              <button className="setting-row" disabled={localOnly} onClick={() => openPanel('join')}><Icon name="family" /><span><strong>Nhận lời mời</strong><small>Cùng người thân chăm sóc bé</small></span><Icon name="chevron" /></button>
              <button className="setting-row" onClick={() => openPanel('backup')}><Icon name="journal" /><span><strong>Sao lưu và khôi phục</strong><small>Tệp riêng trên máy · không ghi đè nhật ký</small></span><Icon name="chevron" /></button>
              <ThemeSwitch />
            </div>
            <div className="settings-group"><button className="setting-row danger" onClick={() => openPanel('signout')}><Icon name="logout" /><span><strong>Đăng xuất</strong><small>Giữ lại dữ liệu chưa gửi trên thiết bị</small></span><Icon name="chevron" /></button></div>
            <OfflineSettings />
            <div className="disclaimer"><Icon name="info" /><p className="muted">Dữ liệu được lưu trên thiết bị rồi đồng bộ với Supabase. Hãy giữ bản sao lưu riêng; đồng bộ không thay thế sao lưu. Xung đột đồng bộ cần được kiểm tra, app không tự chọn bản thắng.</p></div>
          </section>}
        </>}
    </main>
    {baby && <footer className="footer"><QuickActions babyName={baby.nickname} running={mine} saving={saving} onAction={openPanel} />
      <nav className="bottom-nav" aria-label="Điều hướng chính">{screens.map(([key, label]) => <button key={key} aria-current={screen === key ? 'page' : undefined} onClick={() => navigate(key)}><Icon name={key} />{label}</button>)}</nav></footer>}
    {panel && <Sheet title={typeof panel === 'object' ? panel.body.type === 'vaccination' ? 'Cập nhật lịch tiêm chủng' : 'Chi tiết ghi nhận' : isQuickPanel(panel) && quickTimer ? panel === 'sleep' ? 'Kết thúc giấc ngủ' : 'Kết thúc bú mẹ' : panelTitles[panel]} onClose={() => setPanel(null)} dismissOnBackdrop={panel === 'switch'}>
      {baby && (typeof panel === 'object' || isQuickPanel(panel) || panel === 'vaccination') && <p className="sheet-scope">{baby.nickname} · {family?.name}</p>}
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
      {typeof panel === 'object' && panel.body.type !== 'vaccination' && <form className="stack" onSubmit={e => { e.preventDefault(); change(panel, { ...panel.body, note: String(new FormData(e.currentTarget).get('note') ?? '') }); }}><div className="card stack"><p className="sheet-intro">{labels[panel.body.type]} · {timeLabel(panel.body.started_at)}</p><p>{eventDetail(panel.body)}</p></div><label>Ghi chú<textarea name="note" maxLength={500} placeholder="Một điều nhỏ bạn muốn nhớ…" defaultValue={panel.body.note} /></label><button className="primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu trên máy'}</button><button type="button" className="danger-button" disabled={saving} onClick={() => change(panel, { ...panel.body, deleted: true }, true)}>Xóa ghi nhận</button></form>}
      {panel === 'backup' && <BackupPanel store={store} localOnly={localOnly} onRestored={sync.kick} />}
      {!localOnly && own && panel === 'rename' && renameTarget && <RenameProfile store={store} target={renameTarget}
        onDone={() => { setPanel(null); setNotice('Đã cập nhật tên.'); sync.kick(); }} />}
      {!localOnly && (panel === 'new-family' || panel === 'new-baby') && <OnlineSetup store={store} familyId={panel === 'new-baby' ? family?.id : undefined} onDone={message => { setPanel(null); setNotice(message); sync.kick(); }} />}
      {!localOnly && (panel === 'invite' || panel === 'join') && <Invitation store={store} familyId={panel === 'invite' ? family?.id : undefined} onDone={() => { setPanel(null); setNotice('Đã tham gia gia đình.'); sync.kick(); }} />}
      {panel === 'signout' && <div className="stack"><p>Còn {view.operations.length} thay đổi chưa được cloud xác nhận. Đăng xuất sẽ giữ bản local riêng cho tài khoản này, không xóa; chỉ mở lại khi đăng nhập đúng tài khoản.</p><p>Trên máy dùng chung, không coi cache trình duyệt là dữ liệu đã mã hóa. Chưa có chức năng dọn cache trong bản thử này.</p>
        <p>Nếu web và ứng dụng màn hình chính dùng chung phiên từ lúc cài, đăng xuất sẽ ngắt phiên của cả hai. Cần mạng để xác nhận đăng xuất.</p>
        <button className="primary" onClick={() => { void signOut().catch(() => setNotice('Chưa đăng xuất được. Vui lòng thử lại khi có mạng.')); }}>Đăng xuất, giữ dữ liệu chưa gửi</button></div>}
      {notice && <p className="form-feedback" role="alert">{notice}</p>}
    </Sheet>}
  </div>;
}