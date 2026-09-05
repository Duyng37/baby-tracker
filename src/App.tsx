import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { authEvents, configured, projectId, signIn } from './cloud/supabase';
import { deviceMemory, watchDeviceSession } from './cloud/device-access';
import { Icon } from './ui/Icon';
import { useTheme } from './ui/theme';

const Account = lazy(() => import('./Account'));

export function App() {
  const { theme, toggleTheme } = useTheme();
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(!configured);
  const [sessionKnown, setSessionKnown] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [message, setMessage] = useState('');
  const [localOnly, setLocalOnly] = useState(false);
  const [candidate, setCandidate] = useState<string | null>(null);
  useEffect(() => {
    if (!configured) return;
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
  if (!configured) return <main className="welcome"><span className="brand">nôi.</span><h1>Nền ứng dụng đã sẵn sàng để kết nối.</h1>
    <p>Chưa có cấu hình Supabase hợp lệ. Bản này không dùng dữ liệu demo và không giả lập thành công cloud.</p>
    <ol><li>Cấu hình <code>VITE_SUPABASE_URL</code> cho frontend.</li><li>Cấu hình riêng các biến server theo <code>docs/auth-pwa.md</code>.</li>
      <li>Chạy migration và cấu hình callback Google, rồi redeploy hoặc khởi động lại dev server.</li></ol>
    <p className="muted">Không đưa secret key hoặc khóa mã hóa vào biến VITE_*.</p></main>;
  if (!ready) return <main className="welcome"><p>Đang mở phiên trên thiết bị…</p></main>;
  if (!sessionKnown) return <main className="welcome"><span className="brand">nôi.</span><h1>Chưa khôi phục được phiên</h1>
    <p role="status">{message}</p><p>Ứng dụng sẽ tự thử lại, chưa cần đăng nhập lại Google.</p>
    {candidate && <><p>Chỉ mở trên thiết bị riêng: dữ liệu của tài khoản đã dùng trên máy chưa được mã hóa riêng. Đây không phải xác nhận quyền truy cập cloud.</p>
      <button className="primary" onClick={() => { setUserId(candidate); setLocalOnly(true); setSessionKnown(true); }}>Mở nhật ký trên thiết bị</button></>}
    <button onClick={() => authEvents.dispatchEvent(new Event('recheck'))}>Thử khôi phục phiên</button></main>;
  if (userId) return <Suspense fallback={<main className="welcome">Đang mở nhật ký…</main>}><Account key={userId} userId={userId} localOnly={localOnly} /></Suspense>;
  return <main className="welcome"><div className="welcome-top"><span className="brand"><span className="brand-mark" aria-hidden="true">n</span>nôi.</span>
    <button className="icon-button theme-button" aria-label={theme === 'dark' ? 'Bật chế độ sáng' : 'Bật chế độ tối'} onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'sleep'} /></button></div>
    <span className="eyebrow">NHỮNG NGÀY ĐẦU, BÊN CON</span>
    <h1>Ít thao tác hơn.<br />Thêm thời gian <span>bên con.</span></h1><p>Nhật ký bú, ngủ và thay tã. Cả gia đình cùng chăm sóc, mỗi bé một không gian riêng.</p>
    <div className="welcome-features"><span><Icon name="check" /> Ghi nhanh, nhẹ nhàng</span><span><Icon name="family" /> Cùng người thân</span></div>
    <button className="primary" disabled={signingIn} onClick={() => { setSigningIn(true); void signIn().catch(() => {
      setSigningIn(false); setMessage('Chưa đăng nhập được. Kiểm tra mạng và cấu hình máy chủ/Google OAuth.');
    }); }}>{signingIn ? 'Đang chuyển đến Google…' : 'Tiếp tục với Google'}</button>
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