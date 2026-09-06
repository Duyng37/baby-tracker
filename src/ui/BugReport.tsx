import { useEffect, useRef, useState, type FormEvent } from 'react';
import { authenticatedTransport } from '../cloud/supabase';
import type { LocalStore } from '../data/store';
import { CloudError } from '../sync/engine';

export type ReportEnvironment = { userAgent: string; online: boolean; installed: boolean };

export async function submitBugReport(store: LocalStore, description: string, environment: ReportEnvironment, signal: AbortSignal) {
  const api = await authenticatedTransport(store.db.userId); signal.throwIfAborted();
  const result = await api.rpc('report_app_bug', { p_description: description.trim(), p_user_agent: environment.userAgent.slice(0, 500),
    p_online: environment.online, p_installed: environment.installed }, signal) as { status?: unknown } | null;
  if (result?.status !== 'created' && result?.status !== 'rate_limited') throw new Error('invalid response');
  return result.status;
}

export function BugReport({ store, localOnly, onDone }: { store: LocalStore; localOnly: boolean; onDone: () => void }) {
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const locked = useRef(false);
  const lifetime = useRef(new AbortController());
  useEffect(() => { const life = new AbortController(); lifetime.current = life; return () => life.abort(); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    if (localOnly) { setMessage('Cần xác nhận lại phiên cloud trước khi gửi báo lỗi.'); return; }
    if (!navigator.onLine) { setMessage('Cần kết nối mạng để gửi báo lỗi.'); return; }
    locked.current = true; setBusy(true); setMessage('');
    const installed = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
    try {
      const signal = AbortSignal.any([lifetime.current.signal, AbortSignal.timeout(20_000)]);
      const status = await submitBugReport(store, description, { userAgent: navigator.userAgent, online: navigator.onLine, installed }, signal);
      if (status === 'rate_limited') setMessage('Bạn đã gửi nhiều báo lỗi gần đây. Vui lòng thử lại sau một giờ.');
      else onDone();
    } catch (error) {
      if (!lifetime.current.signal.aborted) setMessage(error instanceof CloudError && error.kind === 'auth'
        ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi gửi báo lỗi.' : 'Chưa gửi được báo lỗi. Vui lòng kiểm tra mạng và thử lại.');
    } finally { locked.current = false; if (!lifetime.current.signal.aborted) setBusy(false); }
  }
  return <form className="stack" onSubmit={submit}>
    <p className="sheet-intro">Mô tả sự cố để gửi trực tiếp tới nhóm phát triển.</p>
    <label>Mô tả lỗi<textarea required minLength={10} rows={6} maxLength={2000} value={description} disabled={busy} onChange={event => setDescription(event.target.value)}
      placeholder="Bạn đang làm gì, điều gì đã xảy ra và bạn mong đợi điều gì?" /></label>
    <small>Không nhập tên bé, thông tin gia đình hoặc nội dung nhật ký. Báo cáo chỉ tự thêm thông tin trình duyệt và chế độ mở app.</small>
    {message && <p className="form-error" role="alert">{message}</p>}
    <button className="primary" disabled={busy || localOnly}>{busy ? 'Đang gửi…' : 'Gửi báo lỗi'}</button>
  </form>;
}