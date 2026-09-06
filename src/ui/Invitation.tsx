import { useEffect, useRef, useState } from 'react';
import { authenticatedTransport } from '../cloud/supabase';
import type { LocalStore } from '../data/store';
import { Icon } from './Icon';

export function invitationShareText(token: string, currentUrl: string) {
  const website = new URL(currentUrl);
  website.search = '';
  website.hash = '';
  return `Chăm sóc bé cùng tôi trên Nôi:\n${website.href}\n\nMã mời: ${token}`;
}

export function Invitation({ store, familyId, onDone }: { store: LocalStore; familyId?: string; onDone: () => void }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied'>('idle');
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
    setCopyState('copying');
    try {
      await navigator.clipboard.writeText(invitationShareText(token, window.location.href));
      setCopyState('copied');
      setMessage({ text: 'Đã sao chép link website và mã mời.', error: false });
    } catch {
      setCopyState('idle');
      setMessage({ text: 'Không thể sao chép tự động. Hãy kiểm tra quyền clipboard của trình duyệt rồi thử lại.', error: true });
    }
  }
  return <div className="stack">
    <p className="sheet-intro">Mã mời cấp quyền người chăm sóc, dùng một lần trong 48 giờ. Chỉ chia sẻ riêng với người bạn muốn mời; không gửi qua chat với trợ lý.</p>
    {familyId ? token ? <><label>Mã mời — chỉ hiển thị lần này<textarea readOnly value={token} spellCheck={false} /></label>
      <button className="primary" disabled={copyState === 'copying'} onClick={() => { void copyInvitation(); }}>
        <Icon name={copyState === 'copied' ? 'check' : 'copy'} />{copyState === 'copying' ? 'Đang sao chép…' : copyState === 'copied' ? 'Đã sao chép' : 'Sao chép link và mã mời'}
      </button></>
      : <button className="primary" disabled={busy} onClick={submit}>{busy ? 'Đang tạo mã…' : 'Tạo mã mời'}</button>
      : <form className="stack" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <label>Mã được người thân gửi<input type="password" autoComplete="off" placeholder="Nhập mã mời của bạn" required disabled={busy} value={token} onChange={e => setToken(e.target.value)} /></label>
        <button className="primary" disabled={busy}>{busy ? 'Đang xác nhận…' : 'Tham gia gia đình'}</button>
      </form>}
    {message && <p className={message.error ? 'form-error' : 'form-feedback'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
  </div>;
}