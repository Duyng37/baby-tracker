import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { signIn, supabase } from './cloud/supabase';

const Account = lazy(() => import('./Account'));

export function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    let generation = 0;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      generation++;
      if (alive) { setUserId(session?.user.id ?? null); setReady(true); }
    });
    const initial = generation;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (initial === generation) setUserId(data.session?.user.id ?? null);
      setReady(true);
      if (error) setMessage('Chưa xác nhận phiên đăng nhập. Dữ liệu local chưa bị xóa.');
      // Never leave OAuth callback credentials in browser history or logs.
      if (window.location.search || window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    }).catch(() => { if (alive) { setReady(true); setMessage('Chưa mở được phiên đăng nhập. Vui lòng thử lại khi có mạng.'); } });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  if (!supabase) return <main className="welcome"><span className="brand">nôi.</span><h1>Nền ứng dụng đã sẵn sàng để kết nối.</h1>
    <p>Chưa có cấu hình Supabase hợp lệ. Bản này không dùng dữ liệu demo và không giả lập thành công cloud.</p>
    <ol><li>Tạo file <code>.env.local</code> theo <code>.env.example</code>.</li><li>Nhập URL project và publishable key trực tiếp trên máy, không qua chat.</li>
      <li>Chạy migration, bật Google OAuth theo <code>docs/setup.md</code>, rồi khởi động lại dev server.</li></ol>
    <p className="muted">Chỉ nhận publishable key dạng mới, không dùng service-role, secret key hoặc database password.</p></main>;
  if (!ready) return <main className="welcome"><p>Đang mở phiên trên thiết bị…</p></main>;
  if (userId) return <Suspense fallback={<main className="welcome">Đang mở nhật ký…</main>}><Account key={userId} userId={userId} /></Suspense>;
  return <main className="welcome"><span className="brand">nôi.</span><span className="eyebrow">NHỮNG NGÀY ĐẦU, BÊN CON</span>
    <h1>Ít thao tác hơn.<br />Thêm thời gian bên con.</h1><p>Nhật ký bú, ngủ và thay tã. Cả gia đình cùng chăm sóc, mỗi bé một không gian riêng.</p>
    <button className="primary" onClick={() => { void signIn().catch(() => setMessage('Chưa đăng nhập được. Kiểm tra mạng và cấu hình Google OAuth.')); }}>Tiếp tục với Google</button>
    {message && <p role="alert">{message}</p>}<p className="muted">Lần thiết lập đầu cần mạng. Bản thử nghiệm chưa hoàn tất PWA và kiểm thử cloud thực tế; chưa dùng dữ liệu bé thật.</p>
  </main>;
}

export class SafeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main className="welcome"><h1>Chưa mở được ứng dụng</h1><p>Hãy tải lại trang. Không xóa dữ liệu trình duyệt nếu còn thay đổi chưa đồng bộ.</p></main> : this.props.children;
  }
}