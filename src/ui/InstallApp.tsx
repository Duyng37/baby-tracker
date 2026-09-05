import type { InstallState } from '../pwa/install';
import { installLabel } from '../pwa/install-platform';
import { Icon } from './Icon';

type InstallProps = { state: InstallState; onInstall: () => void };
export function InstallCard({ state, onInstall, onLater }: InstallProps & { onLater: () => void }) {
  if (state.installed || state.dismissedUntil > Date.now()) return null;
  return <section className="card install-card" aria-label="Mở Nôi nhanh hơn">
    <div className="install-heading"><Icon name="install" /><div><h2>Mở Nôi nhanh hơn</h2>
      <p>{state.platform.mobile ? 'Thêm Nôi vào màn hình chính để mở nhật ký bằng một chạm, không cần tìm lại trang web.' : 'Thêm Nôi vào thiết bị để mở nhật ký nhanh hơn, không cần tìm lại trang web.'}</p></div></div>
    <div className="row"><button type="button" onClick={onInstall} disabled={state.busy} aria-busy={state.busy}>{installLabel(state.platform)}</button>
      <button type="button" className="text-button" onClick={onLater} disabled={state.busy}>Để sau</button></div>
  </section>;
}

export function InstallSetting({ state, onInstall }: InstallProps) {
  if (state.installed) return null;
  return <button type="button" className="setting-row" onClick={onInstall} disabled={state.busy} aria-busy={state.busy}>
    <Icon name="install" /><span><strong>{installLabel(state.platform)}</strong><small>Mở nhật ký nhanh hơn · không cần tìm lại trang web</small></span><Icon name="chevron" />
  </button>;
}

export function InstallHelp({ state, onInstall }: InstallProps) {
  if (state.installed) return <p role="status">Nôi đã được cài hoặc đang mở ở chế độ ứng dụng. Bạn không cần thêm lại.</p>;
  const { kind, embedded } = state.platform;
  return <div className="stack install-help">
    <p className="sheet-intro">Đặt Nôi cạnh các ứng dụng bạn thường dùng để mở nhật ký nhanh hơn.</p>
    {state.canPrompt && <button type="button" className="primary" disabled={state.busy} onClick={onInstall}>Mở hộp thoại cài Nôi</button>}
    {!state.canPrompt && <p className="muted">Nếu chưa có hộp thoại cài đặt, bạn có thể làm theo các bước dưới đây.</p>}
    {embedded ? <>
      <h3>Mở bằng trình duyệt trước</h3>
      <ol className="install-steps"><li>Mở menu <strong>⋯</strong> hoặc <strong>⋮</strong> của Zalo, Facebook hoặc ứng dụng đang dùng.</li>
        <li>Chọn <strong>Mở bằng trình duyệt</strong> (Safari trên iPhone/iPad, Chrome trên Android).</li>
        <li>Nếu không thấy mục này, sao chép địa chỉ trang rồi dán vào Safari hoặc Chrome. Mở Nôi và bấm nút thêm một lần nữa.</li></ol>
    </> : kind === 'ios-safari' || kind === 'ios-other' ? <>
      <h3>Trên iPhone hoặc iPad</h3>
      {kind === 'ios-other' && <p>Trong trình duyệt hiện tại, tìm mục <strong>Thêm vào Màn hình chính</strong> trong menu hoặc bảng Chia sẻ. Nếu không có, mở địa chỉ trang này bằng Safari rồi làm theo hướng dẫn:</p>}
      <ol className="install-steps"><li>Trong Safari, chạm <span className="install-inline"><Icon name="share" /><strong>Chia sẻ</strong></span>. Tùy giao diện, nút này có thể nằm trong menu <strong>⋯</strong>.</li>
        <li>Cuộn xuống, chọn <strong>Thêm vào MH chính</strong> (Add to Home Screen). Nếu chưa thấy, chọn <strong>Sửa tác vụ</strong> để thêm mục này.</li>
        <li>Nếu có tùy chọn <strong>Mở dưới dạng ứng dụng web</strong>, hãy bật lên. Chạm <strong>Thêm</strong> để xác nhận.</li></ol>
    </> : kind === 'android' ? <>
      <h3>Trên Android</h3>
      <ol className="install-steps"><li>Mở menu <strong>⋮</strong> hoặc <strong>⋯</strong> của trình duyệt.</li>
        <li>Chọn <strong>Cài đặt ứng dụng</strong> hoặc <strong>Thêm vào màn hình chính</strong>.</li>
        <li>Chạm <strong>Cài đặt</strong> hoặc <strong>Thêm</strong> và làm theo xác nhận trên thiết bị.</li></ol>
    </> : kind === 'mac-safari' ? <>
      <h3>Trong Safari trên máy Mac</h3>
      <ol className="install-steps"><li>Mở menu <strong>Tệp</strong> (File) trên thanh menu.</li>
        <li>Chọn <strong>Thêm vào Dock</strong> (Add to Dock), rồi chọn <strong>Thêm</strong>.</li></ol>
      <p className="muted">Nếu không có mục này, hãy cập nhật macOS/Safari hoặc mở Nôi bằng Chrome hay Edge.</p>
    </> : <>
      <h3>Trong trình duyệt của bạn</h3>
      <ol className="install-steps"><li>Tìm biểu tượng cài đặt trên thanh địa chỉ hoặc mở menu trình duyệt.</li>
        <li>Tìm mục <strong>Cài đặt Nôi</strong>, <strong>Cài đặt trang này dưới dạng ứng dụng</strong> hoặc <strong>Thêm vào màn hình chính</strong>, rồi xác nhận.</li></ol>
      <p className="muted">Nếu không có mục cài đặt, thử mở Nôi bằng Chrome hoặc Edge; trên iPhone/iPad hãy dùng Safari. Bạn vẫn có thể dùng Nôi ngay trong trình duyệt.</p>
    </>}
    <p className="muted">Tên và vị trí menu có thể khác theo phiên bản trình duyệt. Nếu đã thêm Nôi, hãy tìm biểu tượng Nôi trên thiết bị.</p>
    <div className="disclaimer"><Icon name="info" /><p className="muted">Sau khi thêm, mở Nôi từ biểu tượng mới khi còn mạng và đợi nhật ký tải về. Cài ứng dụng không thay thế sao lưu dữ liệu.</p></div>
  </div>;
}