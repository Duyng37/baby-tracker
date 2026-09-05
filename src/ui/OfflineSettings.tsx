import { useEffect, useState, useSyncExternalStore } from 'react';
import { offlineStatus, subscribeOfflineStatus, type OfflineStatus } from '../pwa/register';
import { Icon } from './Icon';

const labels: Record<OfflineStatus, string> = {
  unsupported: 'Cache offline chưa khả dụng trong trình duyệt hoặc môi trường này.',
  preparing: 'Đang chuẩn bị giao diện để mở khi mất mạng…',
  ready: 'Giao diện đã được lưu để mở khi mất mạng.',
  update: 'Có phiên bản mới. Đóng mọi tab/cửa sổ Nôi rồi mở lại khi có mạng để cập nhật.',
  error: 'Chưa lưu được giao diện offline. Kết nối mạng và tải lại trang để thử lại.',
};
export function OfflineSettings() {
  const status = useSyncExternalStore(subscribeOfflineStatus, offlineStatus, () => 'unsupported' as const);
  const [persistent, setPersistent] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let alive = true;
    void navigator.storage?.persisted?.().then(value => { if (alive) setPersistent(value); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return <article className="card stack"><div className="section-heading"><h2>Dùng khi mất mạng</h2><Icon name="offline" /></div>
    <p role="status">{labels[status]}</p>
    <p className="muted">Đăng nhập và mở nhật ký ít nhất một lần trên chính trình duyệt/PWA này khi có mạng. Khi chưa xác nhận được phiên, chọn “Mở nhật ký trên thiết bị”; ghi nhận sẽ chờ xác thực lại trước khi đồng bộ.</p>
    <button disabled={persistent} onClick={() => {
      void navigator.storage?.persist?.().then(granted => {
        setPersistent(granted); setMessage(granted ? 'Trình duyệt đã cấp lưu trữ bền vững.' : 'Trình duyệt chưa cấp quyền. Bạn vẫn có thể dùng app; hãy sao lưu thường xuyên.');
      }).catch(() => setMessage('Chưa xin được quyền lưu trữ. Hãy sao lưu thường xuyên.'));
      if (!navigator.storage?.persist) setMessage('Trình duyệt không hỗ trợ yêu cầu này. Hãy sao lưu thường xuyên.');
    }}>{persistent ? 'Đã bật lưu trữ bền vững' : 'Ưu tiên giữ dữ liệu trên máy'}</button>
    {message && <p role="status">{message}</p>}
    <p className="muted">Trình duyệt vẫn có thể mất dữ liệu nếu bạn xóa bộ nhớ hoặc thiết bị hỏng. Sao lưu tệp riêng vẫn cần thiết; máy dùng chung không có lớp khóa/mã hóa dữ liệu local riêng.</p>
  </article>;
}