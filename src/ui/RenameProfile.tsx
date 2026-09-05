import { useEffect, useRef, useState, type FormEvent } from 'react';
import { renameProfile, type RenameTarget } from '../cloud/rename-profile';
import type { LocalStore } from '../data/store';
import { DataError } from '../domain/events';
import { CloudError } from '../sync/engine';

export function RenameProfile({ store, target, onDone }: { store: LocalStore; target: RenameTarget; onDone: () => void }) {
  const [name, setName] = useState(target.name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const locked = useRef(false);
  const lifetime = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    return () => controller.abort();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    if (!navigator.onLine) { setMessage('Đổi tên cần kết nối mạng. Nội dung bạn nhập vẫn được giữ ở đây.'); return; }
    locked.current = true; setBusy(true); setMessage('');
    try {
      const signal = AbortSignal.any([lifetime.current.signal, AbortSignal.timeout(20_000)]);
      await renameProfile(store, target, name, signal);
      if (!lifetime.current.signal.aborted) onDone();
    } catch (error) {
      if (!lifetime.current.signal.aborted) setMessage(error instanceof DataError ? error.message
        : error instanceof CloudError && ['auth', 'forbidden'].includes(error.kind) ? error.message
        : 'Chưa xác nhận được tên mới. Nội dung vẫn được giữ; kết nối mạng rồi thử lưu lại.');
    } finally { locked.current = false; if (!lifetime.current.signal.aborted) setBusy(false); }
  }
  return <form className="stack" onSubmit={submit}>
    <p className="sheet-intro">Đổi tên không làm mất nhật ký của bé. Cần mạng để lưu thay đổi cho cả gia đình.</p>
    <label>{target.type === 'family' ? 'Tên gia đình' : 'Tên gọi của bé'}<input name="name" value={name} onChange={event => setName(event.target.value)} required maxLength={80} disabled={busy} autoComplete="off" /></label>
    {message && <p className="form-error" role="alert">{message}</p>}
    <button className="primary" disabled={busy || !name.trim() || name.trim() === target.name}>{busy ? 'Đang lưu…' : 'Lưu tên mới'}</button>
  </form>;
}