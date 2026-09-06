import { useEffect, useRef, useState } from 'react';
import { authenticatedTransport } from '../cloud/supabase';
import type { LocalStore } from '../data/store';
import { Icon } from './Icon';
import { invitationShareText } from './invitation-link';

export function Invitation({ store, familyId, initialToken = '', onDone }: {
  store: LocalStore; familyId?: string; initialToken?: string; onDone: () => void;
}) {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(initialToken
    ? { text: 'Mã mời đã được điền từ liên kết. Hãy xác nhận để tham gia gia đình.', error: false } : null);
  const [action, setAction] = useState<'idle' | 'copying' | 'copied' | 'sharing'>('idle');
  const lock = useRef(false);
  const controller = useRef(new AbortController());
  useEffect(() => { const life = new AbortController(); controller.current = life; return () => life.abort(); }, []);
  async function submit() {
    if (lock.current || !navigator.onLine) { setMessage({ text: 'Thao tác lời mời cần mạng.', error: true }); return; }
    lock.current = true; setBusy(true); setMessage(null);
    try {
      const api = await authenticatedTransport(store.db.userId);
      const signal = AbortSignal.any([controller.current.signal, AbortSignal.timeout(20_000)]);
      signal.throwIfAborted();
      const result = await api.rpc(familyId ? 'create_invitation' : 'accept_invitation', familyId ? { p_family_id: familyId } : { p_token: token.trim() }, signal) as Record<string, unknown>;
      signal.throwIfAborted();
      if (familyId && typeof result.token === 'string') {
        setToken(result.token); setMessage({ text: 'Đã tạo mã mời. Hãy sao chép và gửi riêng cho người thân.', error: false }); return;
      }
      setToken('');
      await store.saveWorkspace(await api.workspace(signal));
      if (result.status === 'accepted') onDone();
      else setMessage({ text: result.status === 'rate_limited' ? 'Đã thử quá nhiều lần. Vui lòng chờ rồi thử lại.' : 'Mã không hợp lệ, đã dùng hoặc hết hạn.', error: true });
    } catch {
      if (!controller.current.signal.aborted) setMessage({ text: 'Chưa xác nhận kết quả. Hãy làm mới gia đình trước khi thử lại; tạo mã mời không chống trùng.', error: true });
    } finally { lock.current = false; if (!controller.current.signal.aborted) setBusy(false); }
  }
  async function copyInvitation() {
    setAction('copying');
    try {
      await navigator.clipboard.writeText(invitationShareText(token, window.location.href));
      setAction('copied');
      setMessage({ text: 'Đã sao chép link tham gia và mã dự phòng.', error: false });
    } catch {
      setAction('idle');
      setMessage({ text: 'Không thể sao chép tự động. Hãy kiểm tra quyền clipboard của trình duyệt rồi thử lại.', error: true });
    }
  }
  async function shareInvitation() {
    setAction('sharing');
    try {
      await navigator.share({ title: 'Lời mời chăm bé trên Nôi', text: invitationShareText(token, window.location.href) });
      setAction('idle');
      setMessage({ text: 'Đã chia sẻ lời mời.', error: false });
    } catch (error) {
      setAction('idle');
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage({ text: 'Không thể mở chia sẻ trên thiết bị này. Bạn vẫn có thể sao chép link mời.', error: true });
    }
  }
  const canShare = typeof navigator.share === 'function';
  const working = action === 'copying' || action === 'sharing';
  return <div className="stack">
    <p className="sheet-intro">Mã mời cấp quyền người chăm sóc, dùng một lần trong 48 giờ. Chỉ chia sẻ riêng với người bạn muốn mời; không gửi qua chat với trợ lý.</p>
    {familyId ? token ? <><label>Mã mời dự phòng — chỉ hiển thị lần này<textarea readOnly value={token} spellCheck={false} /></label>
      <div className="stack">{canShare && <button className="primary" disabled={working} onClick={() => { void shareInvitation(); }}>
        <Icon name="share" />{action === 'sharing' ? 'Đang mở chia sẻ…' : 'Chia sẻ lời mời'}
      </button>}
      <button className={canShare ? '' : 'primary'} disabled={working} onClick={() => { void copyInvitation(); }}>
        <Icon name={action === 'copied' ? 'check' : 'copy'} />{action === 'copying' ? 'Đang sao chép…' : action === 'copied' ? 'Đã sao chép' : 'Sao chép link mời'}
      </button></div></>
      : <button className="primary" disabled={busy} onClick={submit}>{busy ? 'Đang tạo mã…' : 'Tạo mã mời'}</button>
      : <form className="stack" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <label>Mã được người thân gửi<input type="password" autoComplete="off" placeholder="Nhập mã mời của bạn" required disabled={busy} value={token} onChange={e => setToken(e.target.value)} /></label>
        <button className="primary" disabled={busy}>{busy ? 'Đang xác nhận…' : 'Tham gia gia đình'}</button>
      </form>}
    {message && <p className={message.error ? 'form-error' : 'form-feedback'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
  </div>;
}