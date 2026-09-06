import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authEvents, configured, projectId, signIn } from './cloud/supabase';
import { deviceMemory, watchDeviceSession } from './cloud/device-access';
import { TrackerDB } from './data/database';
import { LocalStore } from './data/store';
import { Icon } from './ui/Icon';
import { BrandMark } from './ui/BrandMark';
import { LoadingScreen } from './ui/LoadingScreen';
import { Tracker } from './ui/Tracker';
import { useTheme } from './ui/theme';
import { capturePendingInvitation } from './ui/invitation-link';
import { AppWindowGate } from './ui/AppWindowGate';

const Account = lazy(() => import('./Account'));

// Local dev convenience: skip the Google sign-in flow entirely (use ?login to see the real flow).
// Never active in production builds or test runs.
const localTestUser = '00000000-0000-4000-8000-000000000000';
const localBypass = import.meta.env.DEV && !import.meta.env.VITEST
  && typeof window !== 'undefined' && !new URLSearchParams(window.location.search).has('login');

// Fixed IDs so repeated dev reloads seed exactly once into the same namespaced database.
const localFamilyId = '10000000-0000-4000-8000-000000000001';
const localBabyId = '10000000-0000-4000-8000-000000000002';
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

// Seeds a demo family/baby and a few sample records so the journal opens ready to explore.
// Runs only in the local bypass database; real accounts always use their own workspace.
async function seedLocalDevData(store: LocalStore) {
  await store.db.open();
  const workspace = await store.workspace();
  if (workspace.families.length || workspace.babies.length) return;
  await store.saveWorkspace({
    families: [{ id: localFamilyId, name: 'Nhà của Bông', timezone: 'Asia/Ho_Chi_Minh', sync_cursor: '0' }],
    babies: [{ id: localBabyId, family_id: localFamilyId, nickname: 'Bông', birth_date: null }],
    memberships: [{ family_id: localFamilyId, user_id: store.db.userId, role: 'owner' }],
  });
  const scope = { family_id: localFamilyId, baby_id: localBabyId };
  const samples: { id: string; body: Parameters<LocalStore['save']>[2] }[] = [
    { id: '20000000-0000-4000-8000-000000000001', body: { type: 'bottle', started_at: iso(-3 * 3_600_000), ended_at: null, note: '', deleted: false, payload: { amount_ml: 90, milk: 'formula' } } },
    { id: '20000000-0000-4000-8000-000000000002', body: { type: 'diaper', started_at: iso(-2 * 3_600_000), ended_at: null, note: '', deleted: false, payload: { kind: 'wet' } } },
    { id: '20000000-0000-4000-8000-000000000003', body: { type: 'sleep', started_at: iso(-90 * 60_000), ended_at: iso(-30 * 60_000), note: '', deleted: false, payload: {} } },
  ];
  for (const sample of samples) await store.save(scope, sample.id, sample.body);
}

// Local dev entry: same shell as Account, plus one-time demo data seeding.
function LocalDevAccount() {
  const store = useMemo(() => new LocalStore(new TrackerDB(projectId, localTestUser)), []);
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    void seedLocalDevData(store).finally(() => setSeeded(true));
    return () => store.db.close();
  }, [store]);
  return seeded ? <Tracker store={store} localOnly /> : <LoadingScreen detail="Đang chuẩn bị giao diện nhật ký…" />;
}

export function App() {
  const { theme, toggleTheme } = useTheme();
  const [userId, setUserId] = useState<string | null>(localBypass ? localTestUser : null);
  const [ready, setReady] = useState(!configured || localBypass);
  const [sessionKnown, setSessionKnown] = useState(localBypass);
  const [signingIn, setSigningIn] = useState(false);
  const [message, setMessage] = useState('');
  const [localOnly, setLocalOnly] = useState(localBypass);
  const [candidate, setCandidate] = useState<string | null>(null);
  useEffect(() => {
    capturePendingInvitation(window.location.href, window.sessionStorage,
      path => window.history.replaceState(null, '', path));
    if (!configured || localBypass) return;
    const failed = new URLSearchParams(window.location.search).get('auth') === 'failed';
    // The server consumes OAuth codes. Also remove stale legacy callback parameters.
    if (window.location.search || window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    return watchDeviceSession(state => {
      if (state.userId !== undefined) { setUserId(state.userId); setSessionKnown(true); }
      setLocalOnly(state.localOnly); setCandidate(state.candidate);
      setReady(true);
      setMessage(state.message || (failed && !state.userId ? 'Đăng nhập chưa hoàn tất. Hãy bắt đầu lại; nếu vẫn lỗi, kiểm tra cấu hình callback và cookie.' : ''));
    }, deviceMemory(projectId));
  }, []);
  useEffect(() => {
    // In local bypass there is no session watcher; honor sign-out by returning to the login screen.
    if (!localBypass) return;
    const signedOut = () => { window.location.assign('/?login'); };
    authEvents.addEventListener('signed-out', signedOut);
    return () => authEvents.removeEventListener('signed-out', signedOut);
  }, []);
  if (localBypass) return <AppWindowGate><LocalDevAccount /></AppWindowGate>;
  if (!configured) return <main className="welcome"><span className="brand">nôi.</span><h1>Nền ứng dụng đã sẵn sàng để kết nối.</h1>
    <p>Chưa có cấu hình Supabase hợp lệ. Bản này không dùng dữ liệu demo và không giả lập thành công cloud.</p>
    <ol><li>Cấu hình <code>VITE_SUPABASE_URL</code> cho frontend.</li><li>Cấu hình riêng các biến server theo <code>docs/auth-pwa.md</code>.</li>
      <li>Chạy migration và cấu hình callback Google, rồi redeploy hoặc khởi động lại dev server.</li></ol>
    <p className="muted">Không đưa secret key hoặc khóa mã hóa vào biến VITE_*.</p></main>;
  if (!ready) return <LoadingScreen detail="Đang mở phiên trên thiết bị…" />;
  if (!sessionKnown) return <main className="welcome"><span className="brand">nôi.</span><h1>Chưa khôi phục được phiên</h1>
    <p role="status">{message}</p><p>Ứng dụng sẽ tự thử lại, chưa cần đăng nhập lại Google.</p>
    {candidate && <><p>Chỉ mở trên thiết bị riêng: dữ liệu của tài khoản đã dùng trên máy chưa được mã hóa riêng. Đây không phải xác nhận quyền truy cập cloud.</p>
      <button className="primary" onClick={() => { setUserId(candidate); setLocalOnly(true); setSessionKnown(true); }}>Mở nhật ký trên thiết bị</button></>}
    <button onClick={() => authEvents.dispatchEvent(new Event('recheck'))}>Thử khôi phục phiên</button></main>;
  if (userId) return <AppWindowGate><Suspense fallback={<LoadingScreen detail="Đang chuẩn bị giao diện nhật ký…" />}><Account key={userId} userId={userId} localOnly={localOnly} /></Suspense></AppWindowGate>;
  return <main className="welcome"><div className="welcome-top"><span className="brand"><BrandMark />nôi.</span>
    <button className="icon-button theme-button" aria-label={theme === 'dark' ? 'Bật chế độ sáng' : 'Bật chế độ tối'} onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'sleep'} /></button></div>
    <span className="eyebrow">NHỮNG NGÀY ĐẦU, BÊN CON</span>
    <h1>Ít thao tác hơn.<br />Thêm thời gian <span>bên con.</span></h1><p>Nhật ký bú, ngủ, thay tã và nhiều hơn nữa. Cả gia đình cùng chăm sóc, mỗi bé một không gian riêng.</p>
    <div className="welcome-features"><span><Icon name="check" /> Ghi nhanh, nhẹ nhàng</span><span><Icon name="family" /> Cùng người thân</span></div>
    <button className="primary" disabled={signingIn} onClick={() => {
      // Local dev bypass: the Google flow is skipped and the app opens immediately.
      if (import.meta.env.DEV && !import.meta.env.VITEST) { window.location.assign('/'); return; }
      setSigningIn(true); void signIn().catch(() => {
        setSigningIn(false); setMessage('Chưa đăng nhập được. Kiểm tra mạng và cấu hình máy chủ/Google OAuth.');
      });
    }}>{signingIn ? 'Đang chuyển đến Google…' : 'Tiếp tục với Google'}</button>
    {message && <><p className="form-error" role="alert">{message}</p><button onClick={() => authEvents.dispatchEvent(new Event('recheck'))}>Thử khôi phục phiên</button></>}
    <p className="muted">Đăng nhập lần đầu cần mạng. Sau khi giao diện đã được lưu và tài khoản đã xác nhận trên thiết bị này, bạn có thể mở nhật ký khi mất mạng. Phiên đăng nhập dùng cookie bảo mật.</p>
  </main>;
}

export class SafeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main className="welcome"><h1>Chưa mở được ứng dụng</h1><p>Hãy tải lại trang. Không xóa dữ liệu trình duyệt nếu còn thay đổi chưa đồng bộ.</p></main> : this.props.children;
  }
}