import { useEffect, useRef, useState } from 'react';
import type { LocalStore } from '../data/store';
import { exportBackup, previewRestore, type RestoreReport } from '../data/backup';
import { maxBackupBytes, parseBackup, type Backup } from '../data/backup-format';
import { projectId } from '../cloud/supabase';
import { restoreWithCloud } from '../cloud/restore-backup';
import { DataError } from '../domain/events';
import { CloudError } from '../sync/engine';

export function BackupReport({ report }: { report: RestoreReport }) {
  return <dl className="backup-report">
    <dt>Ghi nhận còn thiếu có thể thêm</dt><dd>{report.added}</dd>
    <dt>Đã có cùng nội dung</dt><dd>{report.identical}</dd>
    <dt>Khác nội dung — giữ bản hiện tại</dt><dd>{report.different}</dd>
    <dt>Hồ sơ không còn quyền/không có trên cloud</dt><dd>{report.unavailable}</dd>
    <dt>Đã xóa trong bản sao lưu — bỏ qua</dt><dd>{report.deleted}</dd>
    <dt>Timer chưa kết thúc — không khởi động lại</dt><dd>{report.running}</dd>
  </dl>;
}
export function BackupPanel({ store, localOnly, onRestored }: { store: LocalStore; localOnly: boolean; onRestored: () => void }) {
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const lifetime = useRef(new AbortController());
  const [message, setMessage] = useState('');
  const [backup, setBackup] = useState<Backup | null>(null);
  const [report, setReport] = useState<RestoreReport | null>(null);
  const [download, setDownload] = useState<{ url: string; name: string; count: number } | null>(null);
  useEffect(() => {
    lifetime.current = new AbortController();
    return () => lifetime.current.abort();
  }, []);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download.url); }, [download]);
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setMessage('');
    const signal = lifetime.current.signal;
    try { await action(signal); }
    catch (error) {
      if (!signal.aborted) setMessage(error instanceof DataError || error instanceof CloudError ? error.message : 'Chưa xử lý được bản sao lưu. Dữ liệu hiện tại được giữ nguyên; hãy thử lại.');
    } finally { working.current = false; if (!signal.aborted) setBusy(false); }
  }
  return <div className="stack" aria-busy={busy}>
    <div className="banner">Tệp chứa tên bé và nhật ký, không được mã hóa. Chỉ lưu ở nơi riêng tư; không gửi lên chat công khai. Không chứa token/cookie hay khóa đăng nhập.</div>
    <section className="stack"><h3>Xuất bản sao lưu</h3>
      <p className="muted">Lưu trạng thái ghi nhận hiện có trên máy của các gia đình bạn còn quyền, kể cả ghi nhận chưa đồng bộ và đã xóa. Không xuất lịch sử hàng đợi, quyền thành viên hay dữ liệu chỉ có trên cloud chưa tải về.</p>
      <button disabled={busy} onClick={() => { void run(async signal => {
        const value = await exportBackup(store, projectId); signal.throwIfAborted();
        const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: 'application/json' }));
        setDownload({ url, name: `noi-backup-${value.exportedAt.slice(0, 10)}.json`, count: value.events.length });
      }); }}>{busy ? 'Đang xử lý…' : 'Chuẩn bị tệp sao lưu'}</button>
      {download && <><p>{download.count} ghi nhận trong tệp đã chuẩn bị.</p><a className="download-link" href={download.url} download={download.name}>Tải bản sao lưu</a></>}
    </section>
    <section className="stack"><h3>Khôi phục từ tệp</h3>
      <p className="muted">Chỉ khôi phục vào đúng tài khoản/project và hồ sơ còn quyền. Cần mạng để đối chiếu cloud trước; chỉ thêm ghi nhận còn thiếu, không ghi đè, không tái tạo gia đình/bé hoặc mở lại timer cũ. Tối đa 10 MB / 20.000 ghi nhận.</p>
      <label>Chọn tệp sao lưu JSON<input type="file" accept=".json,application/json" disabled={busy} onChange={event => {
        const file = event.currentTarget.files?.[0]; setBackup(null); setReport(null);
        if (!file) return;
        void run(async signal => {
          if (file.size > maxBackupBytes) throw new DataError('Tệp sao lưu tối đa 10 MB.');
          const value = parseBackup(await file.text()); signal.throwIfAborted();
          const preview = await previewRestore(store, value, projectId); signal.throwIfAborted();
          setBackup(value); setReport(preview);
        });
      }} /></label>
      {backup && report && <div className="card stack"><p>Bản sao lưu ngày {new Date(backup.exportedAt).toLocaleString('vi')} · {backup.events.length} ghi nhận.</p>
        <BackupReport report={report} /><p className="muted">Đây là đối chiếu với dữ liệu trên máy. Số lượng có thể thay đổi sau khi tải bản mới nhất từ cloud.</p>
        <button className="primary" disabled={busy || localOnly} onClick={() => { void run(async signal => {
          const result = await restoreWithCloud(store, backup, projectId, AbortSignal.any([signal, AbortSignal.timeout(120_000)]));
          signal.throwIfAborted(); setReport(result); setBackup(null);
          setMessage(`Đã thêm ${result.added} ghi nhận trên máy; các bản hiện có được giữ nguyên. Ghi nhận mới đang chờ cloud xác nhận.`);
          onRestored();
        }); }}>{busy ? 'Đang đối chiếu và khôi phục…' : 'Đối chiếu cloud và khôi phục'}</button>
      </div>}
      {localOnly && <p className="form-feedback">Bạn vẫn xuất được bản sao lưu. Khôi phục cần kết nối mạng và xác nhận lại phiên đăng nhập.</p>}
    </section>
    {message && <p className="form-feedback" role="status">{message}</p>}
  </div>;
}