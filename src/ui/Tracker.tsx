import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LocalStore } from '../data/store';
import { useStore } from '../data/useStore';
import { useSync } from '../sync/useSync';
import { changeTimer, DataError, isRunning, startTimer } from '../domain/events';
import { dayKey, duration, labels, summarize } from '../domain/summary';
import type { EventBody, LocalEvent, Scope } from '../domain/types';
import { signOut } from '../cloud/supabase';
import { Sheet } from './Sheet';
import { OnlineSetup } from './OnlineSetup';
import { Invitation } from './Invitation';
import { Icon } from './Icon';
import { eventDetail, Journal, journalEvents } from './Journal';
import { Metrics } from './Metrics';
import { useTheme } from './theme';
import { saveUnchangedEvent } from './event-edits';

type Screen = 'today' | 'journal' | 'insights' | 'family';
type Panel = null | 'switch' | 'bottle' | 'diaper' | 'breast' | 'new-family' | 'new-baby' | 'invite' | 'join' | 'signout' | LocalEvent;
const screens: [Screen, string][] = [['today', 'Hôm nay'], ['journal', 'Nhật ký'], ['insights', 'Tổng quan'], ['family', 'Gia đình']];
const descriptions: Record<Screen, string> = {
  today: 'Từng điều nhỏ, cùng con lớn lên.', journal: 'Nhớ giúp bạn những nhịp sinh hoạt của con.',
  insights: 'Nhìn lại nhẹ nhàng, không so sánh.', family: 'Cùng nhau chăm bé, sẻ chia mỗi ngày.',
};
const panelTitles = { switch: 'Chọn bé', bottle: 'Ghi bình sữa', diaper: 'Thay tã', breast: 'Bắt đầu bú mẹ',
  'new-family': 'Thêm gia đình', 'new-baby': 'Thêm bé', invite: 'Mời người chăm sóc', join: 'Tham gia gia đình', signout: 'Đăng xuất trên thiết bị' };

export function Tracker({ store }: { store: LocalStore }) {
  const view = useStore(store);
  const sync = useSync(store);
  const { theme, toggleTheme } = useTheme();
  const content = useRef<HTMLElement>(null);
  const [screen, setScreen] = useState<Screen>('today');
  const [selected, setSelected] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
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
  useLayoutEffect(() => {
    // Deletion and undo remove their triggers, sometimes after the dialog has closed.
    if (!panel && focusContentAfterWrite.current) {
      focusContentAfterWrite.current = false;
      content.current?.focus({ preventScroll: true });
    }
  }, [panel, saving]);

  function openPanel(next: Panel) { setNotice(''); setPanel(next); }
  function navigate(next: Screen) {
    setScreen(next);
    content.current?.scrollTo({ top: 0 });
    content.current?.focus({ preventScroll: true });
  }
  async function write(action: () => Promise<void>, focusContent = false) {
    if (writing.current || Date.now() - lastWrite.current < 350) return;
    writing.current = true; lastWrite.current = Date.now(); setSaving(true); setNotice('');
    try {
      await action(); focusContentAfterWrite.current = focusContent;
      setPanel(null); setNotice('Đã lưu trên máy · chờ cloud xác nhận.'); sync.kick();
    }
    catch (error) { setNotice(error instanceof DataError ? error.message : 'Chưa lưu được trên thiết bị. Không đóng app; hãy kiểm tra dung lượng/quyền lưu trữ.'); }
    finally { writing.current = false; setSaving(false); }
  }
  function create(body: EventBody) {
    if (!scope) return;
    const target = { ...scope };
    void write(async () => { await store.save(target, crypto.randomUUID(), body); setUndo(null); });
  }
  function change(event: LocalEvent, body: EventBody, removable = false) {
    void write(async () => {
      await saveUnchangedEvent(store, event, body);
      setUndo(removable ? { before: event, after: body } : null);
    }, removable);
  }
  function timer(event: LocalEvent, action: 'stop' | 'switch') {
    try { change(event, changeTimer(event.body, action)); }
    catch (error) { setNotice(error instanceof DataError ? error.message : 'Không đổi được timer.'); }
  }
  function record(kind: 'bottle' | 'diaper', value: number | string) {
    const common = { started_at: new Date().toISOString(), ended_at: null, note: '', deleted: false };
    create(kind === 'bottle' ? { ...common, type: 'bottle', payload: { amount_ml: Number(value), milk } }
      : { ...common, type: 'diaper', payload: { kind: value as 'wet' | 'dirty' | 'mixed' } });
  }
  async function restore() {
    if (!undo) return;
    const saved = undo;
    await write(async () => {
      await saveUnchangedEvent(store, { ...saved.before, body: saved.after }, saved.before.body);
      setUndo(null);
    }, true);
  }
  const visible = journalEvents(events, screen === 'today' ? today : date || today, timezone, screen === 'today' ? 'all' : filter);
  const summary = summarize(events, now - 86_400_000, now);
  const timeLabel = (time: string) => new Intl.DateTimeFormat('vi', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(time));
  const syncLabel = !sync.online ? 'Offline · ghi trên máy vẫn hoạt động' : sync.busy ? 'Đang đồng bộ…'
    : sync.message ? 'Chưa hoàn tất đồng bộ'
    : pending.length ? `${pending.length} thay đổi chờ cloud` : view.lastContact ? 'Đã đồng bộ lần gần nhất' : 'Chưa xác nhận cloud';

  if (!view.ready) return <main className="welcome"><p>Đang mở dữ liệu trên thiết bị…</p></main>;
  if (view.error) return <main className="welcome"><h1>Chưa mở được bộ nhớ thiết bị</h1><p>Kiểm tra quyền lưu trữ hoặc dung lượng. Không xóa dữ liệu trình duyệt nếu còn thay đổi chưa gửi.</p></main>;
  return <div className="app">
    <a className="skip-link" href="#content">Đến nội dung</a>
    <header className="header">
      <button className="baby-button" onClick={() => openPanel('switch')} disabled={!baby} aria-label={baby ? `Đổi bé, đang chọn ${baby.nickname}` : 'Chào gia đình mới'}>
        <span className="avatar" aria-hidden="true">{baby?.nickname.slice(0, 1) ?? 'n'}</span>
        <span className="baby-info"><strong>{baby?.nickname ?? 'Chào gia đình mới'}</strong><small>{family?.name ?? 'Bắt đầu hành trình bên con'}</small></span>
        {baby && <Icon name="down" />}</button>
      <button className="icon-button theme-button" aria-label={theme === 'dark' ? 'Bật chế độ sáng' : 'Bật chế độ tối'} onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'sleep'} /></button>
    </header>
    <div className="sync-bar" data-offline={!sync.online}><span className="sync-status" role="status"><Icon name={sync.online ? 'cloud' : 'offline'} /><span>{syncLabel}{view.lastContact && !pending.length ? ` · ${timeLabel(new Date(view.lastContact).toISOString())}` : ''}</span></span>
      <button className="text-button" onClick={sync.kick} disabled={sync.busy || !sync.online}>{sync.busy ? 'Đang gửi…' : 'Thử đồng bộ'}</button></div>
    <main id="content" className="content" ref={content} tabIndex={-1} aria-label={screens.find(([key]) => key === screen)![1]}>
      {sync.message && <p className="banner" role="status">{sync.message}</p>}
      {conflicted > 0 && <p className="banner" role="alert">{conflicted} bản ghi có xung đột/lỗi. Cả bản local và phản hồi cloud được giữ; chưa có màn hình giải quyết trong bản thử này.</p>}
      {quarantined > 0 && <p className="banner">Có {quarantined} thay đổi được cách ly vì quyền gia đình không còn khả dụng. Không tự xóa dữ liệu.</p>}
      {!baby ? <section className="card stack"><span className="eyebrow">CHÀO MỪNG ĐẾN VỚI NÔI</span><h1>Gia đình của bạn</h1><OnlineSetup store={store} onDone={sync.kick} />
        <div className="row"><button onClick={() => openPanel('join')}>Tôi có mã mời</button><button className="text-button" onClick={() => openPanel('signout')}>Đăng xuất</button></div></section>
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
            {screen === 'journal' && <div className="row journal-filters"><label>Ngày<input type="date" value={date || today} onChange={e => setDate(e.target.value)} /></label>
              <label>Hoạt động<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Tất cả</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>}
            {!visible.length && <div className="empty"><Icon name="journal" /><h3>{screen === 'journal' ? 'Chưa có hoạt động phù hợp.' : 'Một khoảng trống nhỏ, sẵn sàng để ghi.'}</h3><p>{screen === 'journal' ? 'Thử chọn ngày hoặc hoạt động khác. Các nút bên dưới luôn ghi cho thời điểm hiện tại.' : `Chạm một trong bốn nút bên dưới để ghi cho ${baby.nickname}.`}</p></div>}
            <Journal events={visible} timezone={timezone} onSelect={openPanel} />
          </section>}
          {screen === 'insights' && <section className="card stack"><div className="section-heading"><h2>7 ngày gần nhất</h2><Icon name="insights" /></div><p>Đã ghi {events.filter(e => !e.body.deleted && Date.parse(e.body.started_at) >= now - 7 * 86_400_000).length} hoạt động cho {baby.nickname}.</p><p className="muted">Mỗi ghi nhận là một chút an tâm. Biểu đồ theo ngày và xuất dữ liệu sẽ được bổ sung; không tổng hợp lẫn các bé.</p></section>}
          {screen === 'family' && <section className="stack"><article className="card stack"><div className="profile-card"><span className="avatar"><Icon name="family" /></span><div><h2>{family?.name}</h2><p>{own ? 'Chủ gia đình' : 'Người chăm sóc'} · {view.workspace.memberships.filter(m => m.family_id === family?.id).length} thành viên</p></div></div>
            <ul className="baby-list" aria-label="Các bé trong gia đình">{view.workspace.babies.filter(b => b.family_id === family?.id).map(b => <li key={b.id}>{b.nickname}</li>)}</ul>
            {own && <div className="row"><button onClick={() => openPanel('new-baby')}><Icon name="plus" />Thêm bé</button><button onClick={() => openPanel('invite')}><Icon name="family" />Mời người chăm sóc</button></div>}</article>
            <div className="settings-group">
              <button className="setting-row" onClick={() => openPanel('new-family')}><Icon name="plus" /><span><strong>Tạo gia đình khác</strong><small>Mỗi gia đình một không gian riêng</small></span><Icon name="chevron" /></button>
              <button className="setting-row" onClick={() => openPanel('join')}><Icon name="family" /><span><strong>Nhận lời mời</strong><small>Cùng người thân chăm sóc bé</small></span><Icon name="chevron" /></button>
              <button className="setting-row" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Bật chế độ sáng' : 'Bật chế độ tối'}><Icon name={theme === 'dark' ? 'sun' : 'sleep'} /><span><strong>Chế độ ban đêm</strong><small>{theme === 'dark' ? 'Đang bật · chạm để dùng giao diện sáng' : 'Đang tắt · dịu mắt khi chăm bé lúc khuya'}</small></span><Icon name="chevron" /></button>
            </div>
            <div className="settings-group"><button className="setting-row danger" onClick={() => openPanel('signout')}><Icon name="logout" /><span><strong>Đăng xuất</strong><small>Giữ lại dữ liệu chưa gửi trên thiết bị</small></span><Icon name="chevron" /></button></div>
            <div className="disclaimer"><Icon name="info" /><p className="muted">Bản thử nghiệm: dữ liệu lưu IndexedDB rồi gửi Supabase. Chưa có cache PWA để mở lại app khi mất mạng; chưa có backup/restore. Không dùng dữ liệu bé thật lúc này.</p></div>
          </section>}
        </>}
    </main>
    {notice && !panel && <div className="notice" role="status"><span>{notice}</span>{undo && <button disabled={saving} onClick={restore}>Hoàn tác</button>}<button className="icon-button" aria-label="Đóng thông báo" onClick={() => setNotice('')}><Icon name="close" /></button></div>}
    {baby && <footer className={`footer${screen === 'today' ? '' : ' footer--compact'}`}><div className="quick-heading"><strong>Ghi nhận nhanh</strong><small>Một chút ghi nhớ, thêm phần an tâm</small></div>
      <div className="quick-actions" role="group" aria-label={`Ghi nhanh cho ${baby.nickname}`}>
      <button className="quick-button" data-running={mine.some(e => e.body.type === 'breast')} disabled={saving} onClick={() => mine.find(e => e.body.type === 'breast') ? timer(mine.find(e => e.body.type === 'breast')!, 'stop') : openPanel('breast')}><Icon name="breast" /><span><strong>{mine.some(e => e.body.type === 'breast') ? 'Kết thúc bú' : 'Bú mẹ'}</strong><small>{mine.some(e => e.body.type === 'breast') ? 'Chạm để kết thúc' : 'Bắt đầu bên trái / phải'}</small></span></button>
      <button className="quick-button" disabled={saving} onClick={() => openPanel('bottle')}><Icon name="bottle" /><span><strong>Bình sữa</strong><small>Ghi lượng sữa của con</small></span></button>
      <button className="quick-button" disabled={saving} onClick={() => openPanel('diaper')}><Icon name="diaper" /><span><strong>Thay tã</strong><small>Ướt, bẩn hoặc cả hai</small></span></button>
      <button className="quick-button" data-running={mine.some(e => e.body.type === 'sleep')} disabled={saving} onClick={() => mine.find(e => e.body.type === 'sleep') ? timer(mine.find(e => e.body.type === 'sleep')!, 'stop') : create(startTimer('sleep'))}><Icon name="sleep" /><span><strong>{mine.some(e => e.body.type === 'sleep') ? 'Đã thức' : 'Ngủ'}</strong><small>{mine.some(e => e.body.type === 'sleep') ? 'Kết thúc giấc ngủ' : 'Chạm khi con vào giấc'}</small></span></button>
    </div><nav className="bottom-nav" aria-label="Điều hướng chính">{screens.map(([key, label]) => <button key={key} aria-current={screen === key ? 'page' : undefined} onClick={() => navigate(key)}><Icon name={key} />{label}</button>)}</nav></footer>}
    {panel && <Sheet title={typeof panel === 'object' ? 'Chi tiết ghi nhận' : panelTitles[panel]} onClose={() => setPanel(null)}>
      {baby && (typeof panel === 'object' || ['bottle', 'diaper', 'breast'].includes(panel)) && <p className="sheet-scope">{baby.nickname} · {family?.name}</p>}
      {panel === 'switch' && view.workspace.families.map(f => <section key={f.id}><h3>{f.name}</h3>{view.workspace.babies.filter(b => b.family_id === f.id).map(b => <button className="baby-option" key={b.id} onClick={() => {
        setSelected(b.id); setPanel(null); void store.db.state.put({ key: 'selectedBaby', value: b.id }).catch(() => setNotice('Chưa lưu được lựa chọn bé.'));
      }} aria-pressed={baby?.id === b.id}><span className="avatar" aria-hidden="true">{b.nickname.slice(0, 1)}</span><span>{b.nickname}</span>{baby?.id === b.id && <Icon name="check" />}</button>)}</section>)}
      {panel === 'bottle' && <div className="stack"><p className="sheet-intro">Chọn lượng sữa để lưu ngay, hoặc nhập lượng khác bên dưới.</p><label>Loại sữa<select value={milk} onChange={e => setMilk(e.target.value as typeof milk)}><option value="formula">Công thức</option><option value="breast_milk">Sữa mẹ vắt</option><option value="mixed">Hỗn hợp</option></select></label><div className="presets" role="group" aria-label="Lượng sữa ghi nhanh">{[60, 90, 120, 150, 180, 210].map(amount => <button disabled={saving} key={amount} onClick={() => record('bottle', amount)}>{amount}<small>ml</small></button>)}</div>
        <form className="row form-row" onSubmit={e => { e.preventDefault(); record('bottle', Number(new FormData(e.currentTarget).get('amount'))); }}><label>Lượng khác (ml)<input name="amount" type="number" inputMode="decimal" placeholder="Ví dụ: 100" min="0.1" max="2000" step="0.1" required /></label><button className="primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Ghi lại'}</button></form><p className="muted">Các mức trên chỉ giúp nhập nhanh, không phải khuyến cáo lượng sữa.</p></div>}
      {panel === 'diaper' && <div className="stack"><p className="sheet-intro">Tã của con thế nào? Chạm một lựa chọn để ghi lại ngay.</p><div className="presets">{[['wet', 'Ướt'], ['dirty', 'Bẩn'], ['mixed', 'Cả hai']].map(([kind, label]) => <button key={kind} disabled={saving} onClick={() => record('diaper', kind)}><Icon name="diaper" />{label}</button>)}</div></div>}
      {panel === 'breast' && <div className="stack"><p className="sheet-intro">Con bắt đầu bú bên nào? Bạn có thể đổi bên khi đang ghi.</p><div className="presets presets--two"><button disabled={saving} onClick={() => create(startTimer('breast', 'left'))}><Icon name="breast" />Bên trái</button><button disabled={saving} onClick={() => create(startTimer('breast', 'right'))}><Icon name="breast" />Bên phải</button></div></div>}
      {typeof panel === 'object' && <form className="stack" onSubmit={e => { e.preventDefault(); change(panel, { ...panel.body, note: String(new FormData(e.currentTarget).get('note') ?? '') }); }}><div className="card stack"><p className="sheet-intro">{labels[panel.body.type]} · {timeLabel(panel.body.started_at)}</p><p>{eventDetail(panel.body)}</p></div><label>Ghi chú<textarea name="note" maxLength={500} placeholder="Một điều nhỏ bạn muốn nhớ…" defaultValue={panel.body.note} /></label><button className="primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu trên máy'}</button><button type="button" className="danger-button" disabled={saving} onClick={() => change(panel, { ...panel.body, deleted: true }, true)}>Xóa ghi nhận</button></form>}
      {(panel === 'new-family' || panel === 'new-baby') && <OnlineSetup store={store} familyId={panel === 'new-baby' ? family?.id : undefined} onDone={() => { setPanel(null); sync.kick(); }} />}
      {(panel === 'invite' || panel === 'join') && <Invitation store={store} familyId={panel === 'invite' ? family?.id : undefined} onDone={() => { setPanel(null); sync.kick(); }} />}
      {panel === 'signout' && <div className="stack"><p>Còn {view.operations.length} thay đổi chưa được cloud xác nhận. Đăng xuất sẽ giữ bản local riêng cho tài khoản này, không xóa; chỉ mở lại khi đăng nhập đúng tài khoản.</p><p>Trên máy dùng chung, không coi cache trình duyệt là dữ liệu đã mã hóa. Chưa có chức năng dọn cache trong bản thử này.</p>
        <p>Nếu web và ứng dụng màn hình chính dùng chung phiên từ lúc cài, đăng xuất sẽ ngắt phiên của cả hai. Cần mạng để xác nhận đăng xuất.</p>
        <button className="primary" onClick={() => { void signOut().catch(() => setNotice('Chưa đăng xuất được. Vui lòng thử lại khi có mạng.')); }}>Đăng xuất, giữ dữ liệu chưa gửi</button></div>}
      {notice && <p className="form-feedback" role="alert">{notice}</p>}
    </Sheet>}
  </div>;
}