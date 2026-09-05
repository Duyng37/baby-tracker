import { useEffect, useRef, useState } from 'react';
import { LocalStore } from '../data/store';
import { useStore } from '../data/useStore';
import { useSync } from '../sync/useSync';
import { changeTimer, DataError, isRunning, startTimer } from '../domain/events';
import { dayKey, duration, labels, summarize } from '../domain/summary';
import type { EventBody, LocalEvent, Scope } from '../domain/types';
import { supabase } from '../cloud/supabase';
import { Sheet } from './Sheet';
import { OnlineSetup } from './OnlineSetup';
import { Invitation } from './Invitation';

type Screen = 'today' | 'journal' | 'insights' | 'family';
type Panel = null | 'switch' | 'bottle' | 'diaper' | 'breast' | 'new-family' | 'new-baby' | 'invite' | 'join' | 'signout' | LocalEvent;
const screens: [Screen, string][] = [['today', 'Hôm nay'], ['journal', 'Nhật ký'], ['insights', 'Tổng quan'], ['family', 'Gia đình']];

export function Tracker({ store }: { store: LocalStore }) {
  const view = useStore(store);
  const sync = useSync(store);
  const [screen, setScreen] = useState<Screen>('today');
  const [selected, setSelected] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const writing = useRef(false);
  const lastWrite = useRef(0);
  const [undo, setUndo] = useState<{ before: LocalEvent; after: EventBody } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [date, setDate] = useState('');
  const [filter, setFilter] = useState('all');
  const [dark, setDark] = useState(false);
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

  async function write(action: () => Promise<void>) {
    if (writing.current || Date.now() - lastWrite.current < 350) return;
    writing.current = true; lastWrite.current = Date.now(); setSaving(true); setNotice('');
    try { await action(); setPanel(null); setNotice('Đã lưu trên máy · chờ cloud xác nhận.'); sync.kick(); }
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
      await store.save(event, event.id, body, event.version);
      setUndo(removable ? { before: event, after: body } : null);
    });
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
      const latest = (await store.list(saved.before)).find(e => e.id === saved.before.id);
      if (!latest || JSON.stringify(latest.body) !== JSON.stringify(saved.after)) throw new DataError('Bản ghi đã thay đổi, không thể hoàn tác bản cũ.');
      await store.save(latest, latest.id, saved.before.body, latest.version); setUndo(null);
    });
  }
  const visible = events.filter(e => !e.body.deleted && (filter === 'all' || e.body.type === filter)
    && dayKey(Date.parse(e.body.started_at), timezone) === (screen === 'today' ? today : date || today))
    .sort((a, b) => Date.parse(b.body.started_at) - Date.parse(a.body.started_at));
  const summary = summarize(events, now - 86_400_000, now);
  const timeLabel = (time: string) => new Intl.DateTimeFormat('vi', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(time));
  const syncLabel = !sync.online ? 'Offline · ghi trên máy vẫn hoạt động' : sync.busy ? 'Đang đồng bộ…'
    : sync.message ? 'Chưa hoàn tất đồng bộ'
    : pending.length ? `${pending.length} thay đổi chờ cloud` : view.lastContact ? 'Đã đồng bộ lần gần nhất' : 'Chưa xác nhận cloud';

  if (!view.ready) return <main className="welcome"><p>Đang mở dữ liệu trên thiết bị…</p></main>;
  if (view.error) return <main className="welcome"><h1>Chưa mở được bộ nhớ thiết bị</h1><p>Kiểm tra quyền lưu trữ hoặc dung lượng. Không xóa dữ liệu trình duyệt nếu còn thay đổi chưa gửi.</p></main>;
  return <div className={`app ${dark ? 'dark' : ''}`}>
    <a className="skip-link" href="#content">Đến nội dung</a>
    <header className="header"><div><span className="eyebrow">NÔI · NHẬT KÝ CỦA BÉ</span>
      <button className="baby-button" onClick={() => setPanel('switch')} disabled={!baby}>{baby?.nickname ?? 'Chào gia đình mới'} <span aria-hidden="true">⌄</span></button>
      <small>{family?.name ?? 'Bắt đầu hành trình bên con'}</small></div>
      <button aria-label={dark ? 'Bật chế độ sáng' : 'Bật chế độ tối'} onClick={() => setDark(!dark)}>{dark ? '☀' : '☾'}</button>
    </header>
    <div className="sync-bar"><span role="status">{syncLabel}{view.lastContact && !pending.length ? ` · ${timeLabel(new Date(view.lastContact).toISOString())}` : ''}</span>
      <button onClick={sync.kick} disabled={sync.busy || !sync.online}>Thử đồng bộ</button></div>
    {sync.message && <p className="banner" role="status">{sync.message}</p>}
    {conflicted > 0 && <p className="banner" role="alert">{conflicted} bản ghi có xung đột/lỗi. Cả bản local và phản hồi cloud được giữ; chưa có màn hình giải quyết trong bản thử này.</p>}
    {quarantined > 0 && <p className="banner">Có {quarantined} thay đổi được cách ly vì quyền gia đình không còn khả dụng. Không tự xóa dữ liệu.</p>}
    <main id="content" className="content">
      {!baby ? <section className="card"><h1>Gia đình của bạn</h1><OnlineSetup store={store} onDone={sync.kick} />
        <button onClick={() => setPanel('join')}>Tôi có mã mời</button><button onClick={() => setPanel('signout')}>Đăng xuất</button></section>
        : <>
          <div className="page-title"><span className="eyebrow">{new Intl.DateTimeFormat('vi', { dateStyle: 'full', timeZone: timezone }).format(now)}</span><h1>{screens.find(([key]) => key === screen)![1]}</h1></div>
          {active.length > 0 && <section aria-label="Timer trong gia đình" className="timers">{active.map(event => <article className="timer card" key={event.id}>
            <div><strong>{labels[event.body.type]} · {view.workspace.babies.find(b => b.id === event.baby_id)?.nickname}</strong>
              <p>{duration(now - Date.parse(event.body.started_at))}{event.body.type === 'breast' ? ` · bên ${event.body.payload.segments.at(-1)!.side === 'left' ? 'trái' : 'phải'}` : ''}</p></div>
            <div className="row">{event.body.type === 'breast' && <button disabled={saving} onClick={() => timer(event, 'switch')}>Đổi bên</button>}
              <button className="primary" disabled={saving} onClick={() => timer(event, 'stop')}>{event.body.type === 'sleep' ? 'Đã thức' : 'Kết thúc'}</button></div>
          </article>)}</section>}
          {(screen === 'today' || screen === 'insights') && <section aria-label="Tổng hợp 24 giờ qua"><h2>24 giờ qua · {baby.nickname}</h2>
            <div className="stats"><article className="card"><small>Sữa bình</small><strong>{summary.bottle} ml</strong></article><article className="card"><small>Thay tã</small><strong>{summary.diapers} lần</strong></article>
              <article className="card"><small>Ngủ</small><strong>{duration(summary.sleep)}</strong></article><article className="card"><small>Bú mẹ</small><strong>{duration(summary.breast)}</strong></article></div>
            <p className="muted">Tính cả timer đang chạy. Đây là nhật ký, không phải đánh giá sức khỏe hay hướng dẫn lượng sữa.</p>
          </section>}
          {(screen === 'today' || screen === 'journal') && <section><h2>Nhật ký · {baby.nickname}</h2>
            {screen === 'journal' && <div className="row"><label>Ngày<input type="date" value={date || today} onChange={e => setDate(e.target.value)} /></label>
              <label>Hoạt động<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Tất cả</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>}
            {!visible.length && <div className="card empty"><h3>Một khoảng trống nhỏ, sẵn sàng để ghi.</h3><p>Chạm một trong bốn nút bên dưới để ghi cho {baby.nickname}.</p></div>}
            <ol className="journal">{visible.map(event => <li key={event.id} className="card"><div className="row between"><strong>{labels[event.body.type]}</strong><time>{timeLabel(event.body.started_at)}</time></div>
              {event.body.type === 'bottle' && <p>{event.body.payload.amount_ml} ml · {event.body.payload.milk === 'formula' ? 'Sữa công thức' : event.body.payload.milk === 'breast_milk' ? 'Sữa mẹ vắt' : 'Hỗn hợp'}</p>}
              {event.body.type === 'diaper' && <p>{{ wet: 'Tã ướt', dirty: 'Tã bẩn', mixed: 'Cả hai' }[event.body.payload.kind]}</p>}
              {event.body.ended_at && <p>{duration(Date.parse(event.body.ended_at) - Date.parse(event.body.started_at))}</p>}
              {event.body.note && <p>{event.body.note}</p>}
              {!isRunning(event.body) && <div className="row"><button onClick={() => setPanel(event)}>Ghi chú</button><button disabled={saving} onClick={() => change(event, { ...event.body, deleted: true }, true)}>Xóa</button></div>}
            </li>)}</ol>
          </section>}
          {screen === 'insights' && <section className="card"><h2>7 ngày gần nhất</h2><p>Đã ghi {events.filter(e => !e.body.deleted && Date.parse(e.body.started_at) >= now - 7 * 86_400_000).length} hoạt động cho {baby.nickname}.</p><p className="muted">Biểu đồ theo ngày và xuất dữ liệu sẽ được bổ sung. Không tổng hợp lẫn các bé.</p></section>}
          {screen === 'family' && <section className="stack"><article className="card"><h2>{family?.name}</h2><p>Vai trò: {own ? 'Chủ gia đình' : 'Người chăm sóc'} · {view.workspace.memberships.filter(m => m.family_id === family?.id).length} thành viên</p>
            <ul>{view.workspace.babies.filter(b => b.family_id === family?.id).map(b => <li key={b.id}>{b.nickname}</li>)}</ul>
            {own && <div className="row"><button onClick={() => setPanel('new-baby')}>Thêm bé</button><button onClick={() => setPanel('invite')}>Mời người chăm sóc</button></div>}</article>
            <article className="card stack"><button onClick={() => setPanel('new-family')}>Tạo gia đình khác</button><button onClick={() => setPanel('join')}>Nhận lời mời</button><button onClick={() => setPanel('signout')}>Đăng xuất</button></article>
            <p className="muted">Bản thử nghiệm: dữ liệu lưu IndexedDB rồi gửi Supabase. Chưa có cache PWA để mở lại app khi mất mạng; chưa có backup/restore. Không dùng dữ liệu bé thật lúc này.</p>
          </section>}
        </>}
    </main>
    {notice && <div className="notice" role="status">{notice}{undo && <button disabled={saving} onClick={restore}>Hoàn tác</button>}<button aria-label="Đóng thông báo" onClick={() => setNotice('')}>×</button></div>}
    {baby && <footer className="footer"><div className="quick-actions" aria-label={`Ghi nhanh cho ${baby.nickname}`}>
      <button disabled={saving} onClick={() => mine.find(e => e.body.type === 'breast') ? timer(mine.find(e => e.body.type === 'breast')!, 'stop') : setPanel('breast')}>Bú mẹ</button>
      <button disabled={saving} onClick={() => setPanel('bottle')}>Bình sữa</button><button disabled={saving} onClick={() => setPanel('diaper')}>Thay tã</button>
      <button disabled={saving} onClick={() => mine.find(e => e.body.type === 'sleep') ? timer(mine.find(e => e.body.type === 'sleep')!, 'stop') : create(startTimer('sleep'))}>{mine.some(e => e.body.type === 'sleep') ? 'Đã thức' : 'Ngủ'}</button>
    </div><nav className="bottom-nav" aria-label="Điều hướng chính">{screens.map(([key, label]) => <button key={key} aria-current={screen === key ? 'page' : undefined} onClick={() => setScreen(key)}>{label}</button>)}</nav></footer>}
    {panel && <Sheet title={panel === 'switch' ? 'Chọn bé' : panel === 'signout' ? 'Đăng xuất trên thiết bị' : `Gia đình & ghi nhận${baby ? ` · ${baby.nickname}` : ''}`} onClose={() => setPanel(null)}>
      {panel === 'switch' && view.workspace.families.map(f => <section key={f.id}><h3>{f.name}</h3>{view.workspace.babies.filter(b => b.family_id === f.id).map(b => <button className="baby-option" key={b.id} onClick={() => {
        setSelected(b.id); setPanel(null); void store.db.state.put({ key: 'selectedBaby', value: b.id }).catch(() => setNotice('Chưa lưu được lựa chọn bé.'));
      }}>{b.nickname}{baby?.id === b.id ? ' ✓' : ''}</button>)}</section>)}
      {panel === 'bottle' && <div className="stack"><label>Loại sữa<select value={milk} onChange={e => setMilk(e.target.value as typeof milk)}><option value="formula">Công thức</option><option value="breast_milk">Sữa mẹ vắt</option><option value="mixed">Hỗn hợp</option></select></label><div className="presets">{[60, 90, 120, 150, 180, 210].map(amount => <button disabled={saving} key={amount} onClick={() => record('bottle', amount)}>{amount} ml</button>)}</div>
        <form className="row" onSubmit={e => { e.preventDefault(); record('bottle', Number(new FormData(e.currentTarget).get('amount'))); }}><label>Lượng khác (ml)<input name="amount" type="number" min="0.1" max="2000" step="0.1" required /></label><button disabled={saving}>Ghi</button></form></div>}
      {panel === 'diaper' && <div className="presets">{[['wet', 'Ướt'], ['dirty', 'Bẩn'], ['mixed', 'Cả hai']].map(([kind, label]) => <button key={kind} disabled={saving} onClick={() => record('diaper', kind)}>{label}</button>)}</div>}
      {panel === 'breast' && <div className="presets"><button disabled={saving} onClick={() => create(startTimer('breast', 'left'))}>Bên trái</button><button disabled={saving} onClick={() => create(startTimer('breast', 'right'))}>Bên phải</button></div>}
      {typeof panel === 'object' && <form className="stack" onSubmit={e => { e.preventDefault(); change(panel, { ...panel.body, note: String(new FormData(e.currentTarget).get('note') ?? '') }); }}><label>Ghi chú<textarea name="note" maxLength={500} defaultValue={panel.body.note} /></label><button className="primary" disabled={saving}>Lưu trên máy</button></form>}
      {(panel === 'new-family' || panel === 'new-baby') && <OnlineSetup store={store} familyId={panel === 'new-baby' ? family?.id : undefined} onDone={() => { setPanel(null); sync.kick(); }} />}
      {(panel === 'invite' || panel === 'join') && <Invitation store={store} familyId={panel === 'invite' ? family?.id : undefined} onDone={() => { setPanel(null); sync.kick(); }} />}
      {panel === 'signout' && <div className="stack"><p>Còn {view.operations.length} thay đổi chưa được cloud xác nhận. Đăng xuất sẽ giữ bản local riêng cho tài khoản này, không xóa; chỉ mở lại khi đăng nhập đúng tài khoản.</p><p>Trên máy dùng chung, không coi cache trình duyệt là dữ liệu đã mã hóa. Chưa có chức năng dọn cache trong bản thử này.</p>
        <button className="primary" onClick={async () => { const result = await supabase!.auth.signOut({ scope: 'local' }); if (result.error) setNotice('Chưa đăng xuất được. Vui lòng thử lại.'); }}>Đăng xuất, giữ dữ liệu chưa gửi</button></div>}
      {notice && <p role="alert">{notice}</p>}
    </Sheet>}
  </div>;
}