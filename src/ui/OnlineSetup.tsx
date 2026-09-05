import { useEffect, useRef, useState, type FormEvent } from 'react';
import { authenticatedTransport } from '../cloud/supabase';
import type { LocalStore } from '../data/store';
import { CloudError } from '../sync/engine';

type Draft = { name: string; baby: string; familyId: string; babyId: string };
export function OnlineSetup({ store, familyId, onDone }: { store: LocalStore; familyId?: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [baby, setBaby] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const locked = useRef(false);
  const lifetime = useRef(new AbortController());
  const key = familyId ? `setup:baby:${familyId}` : 'setup:family';
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    void store.db.state.get(key).then(row => {
      if (controller.signal.aborted) return;
      if (row) { const saved = row.value as Draft; setDraft(saved); setName(saved.name); setBaby(saved.baby); }
      setReady(true);
    }).catch(() => { if (!controller.signal.aborted) setMessage('Không đọc được bộ nhớ thiết bị.'); });
    return () => controller.abort();
  }, [store, key]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current || !ready) return;
    if (!navigator.onLine) { setMessage('Tạo hồ sơ cần kết nối mạng.'); return; }
    locked.current = true; setBusy(true); setMessage('');
    try {
      const value = draft ?? { name: name.trim(), baby: baby.trim(), familyId: familyId ?? crypto.randomUUID(), babyId: crypto.randomUUID() };
      if (!value.baby || (!familyId && !value.name)) throw new Error();
      // Persist IDs and content before network: reload/lost response retries the same onboarding.
      await store.db.state.put({ key, value }); setDraft(value);
      const signal = AbortSignal.any([lifetime.current.signal, AbortSignal.timeout(20_000)]);
      const api = await authenticatedTransport(store.db.userId); signal.throwIfAborted();
      if (familyId) await api.rpc('add_baby', { p_family_id: value.familyId, p_baby_id: value.babyId, p_nickname: value.baby }, signal);
      else await api.rpc('create_family', { p_family_id: value.familyId, p_baby_id: value.babyId,
        p_name: value.name, p_nickname: value.baby, p_timezone: 'Asia/Ho_Chi_Minh' }, signal);
      const workspace = await api.workspace(signal); signal.throwIfAborted();
      await store.saveWorkspace(workspace);
      await store.db.state.delete(key); onDone();
    } catch (error) {
      if (!lifetime.current.signal.aborted) setMessage(error instanceof CloudError ? error.message : 'Chưa hoàn tất. Thử lại sẽ dùng đúng hồ sơ đã gửi, không tạo trùng.');
    } finally { locked.current = false; if (!lifetime.current.signal.aborted) setBusy(false); }
  }
  return <form onSubmit={submit} className="stack">
    <p className="sheet-intro">{familyId ? 'Thêm bé vào gia đình hiện tại.' : 'Tạo gia đình và bé đầu tiên. Mỗi gia đình có dữ liệu riêng.'} Cần mạng ở bước này.</p>
    {!familyId && <label>Tên gia đình<input required maxLength={80} placeholder="Ví dụ: Nhà của Bông" autoComplete="off" value={name} disabled={!!draft || busy || !ready} onChange={e => setName(e.target.value)} /></label>}
    <label>Tên gọi của bé<input required maxLength={80} placeholder="Tên thân thương của con" autoComplete="off" value={baby} disabled={!!draft || busy || !ready} onChange={e => setBaby(e.target.value)} /></label>
    {!familyId && <small>Múi giờ ban đầu: Việt Nam (Asia/Ho_Chi_Minh).</small>}
    {draft && <small>Đang giữ nguyên nội dung lần gửi trước để thử lại an toàn.</small>}
    {message && <p className="form-error" role="alert">{message}</p>}
    <button className="primary" disabled={busy || !ready}>{busy ? 'Đang tạo…' : draft ? 'Thử lại hồ sơ này' : 'Tạo hồ sơ'}</button>
  </form>;
}