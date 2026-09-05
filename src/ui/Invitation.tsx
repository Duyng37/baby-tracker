import { useEffect, useRef, useState } from 'react';
import { authenticatedTransport } from '../cloud/supabase';
import type { LocalStore } from '../data/store';

export function Invitation({ store, familyId, onDone }: { store: LocalStore; familyId?: string; onDone: () => void }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const controller = useRef(new AbortController());
  useEffect(() => { const life = new AbortController(); controller.current = life; return () => life.abort(); }, []);
  async function submit() {
    if (lock.current || !navigator.onLine) { setMessage('Thao tác lời mời cần mạng.'); return; }
    lock.current = true; setBusy(true); setMessage('');
    try {
      const api = await authenticatedTransport(store.db.userId);
      const signal = AbortSignal.any([controller.current.signal, AbortSignal.timeout(20_000)]);
      signal.throwIfAborted();
      const result = await api.rpc(familyId ? 'create_invitation' : 'accept_invitation', familyId ? { p_family_id: familyId } : { p_token: token.trim() }, signal) as Record<string, unknown>;
      signal.throwIfAborted();
      if (familyId && typeof result.token === 'string') { setToken(result.token); return; }
      setToken('');
      await store.saveWorkspace(await api.workspace(signal));
      if (result.status === 'accepted') onDone();
      else setMessage(result.status === 'rate_limited' ? 'Đã thử quá nhiều lần. Vui lòng chờ rồi thử lại.' : 'Mã không hợp lệ, đã dùng hoặc hết hạn.');
    } catch {
      if (!controller.current.signal.aborted) setMessage('Chưa xác nhận kết quả. Hãy làm mới gia đình trước khi thử lại; tạo mã mời không chống trùng.');
    } finally { lock.current = false; if (!controller.current.signal.aborted) setBusy(false); }
  }
  return <div className="stack">
    <p className="sheet-intro">Mã mời cấp quyền người chăm sóc, dùng một lần trong 48 giờ. Chỉ chia sẻ riêng với người bạn muốn mời; không gửi qua chat với trợ lý.</p>
    {familyId ? token ? <label>Mã mời — chỉ hiển thị lần này<textarea readOnly value={token} spellCheck={false} /></label>
      : <button className="primary" disabled={busy} onClick={submit}>{busy ? 'Đang tạo mã…' : 'Tạo mã mời'}</button>
      : <form className="stack" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <label>Mã được người thân gửi<input type="password" autoComplete="off" placeholder="Nhập mã mời của bạn" required disabled={busy} value={token} onChange={e => setToken(e.target.value)} /></label>
        <button className="primary" disabled={busy}>{busy ? 'Đang xác nhận…' : 'Tham gia gia đình'}</button>
      </form>}
    {message && <p className="form-error" role="alert">{message}</p>}
  </div>;
}