import { useState, type FormEvent } from 'react';

const issueEndpoint = 'https://github.com/Duyng37/baby-tracker/issues/new';

export type ReportEnvironment = { userAgent: string; online: boolean; installed: boolean };

export function bugReportUrl(description: string, environment: ReportEnvironment) {
  const url = new URL(issueEndpoint);
  const mode = environment.installed ? 'Ứng dụng đã cài' : 'Trình duyệt web';
  url.searchParams.set('title', '[Báo lỗi app] ');
  url.searchParams.set('body', `### Mô tả lỗi\n${description.trim()}\n\n### Môi trường\n- Thiết bị/trình duyệt: ${environment.userAgent}\n- Kết nối: ${environment.online ? 'Online' : 'Offline'}\n- Chế độ: ${mode}`);
  return url.href;
}

export function BugReport() {
  const [description, setDescription] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const installed = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
    window.location.assign(bugReportUrl(description, { userAgent: navigator.userAgent, online: navigator.onLine, installed }));
  }
  return <form className="stack" onSubmit={submit}>
    <p className="sheet-intro">Mô tả sự cố để mở một báo cáo đã điền sẵn trên GitHub. Bạn có thể xem lại trước khi gửi.</p>
    <label>Mô tả lỗi<textarea required rows={6} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)}
      placeholder="Bạn đang làm gì, điều gì đã xảy ra và bạn mong đợi điều gì?" /></label>
    <small>Không nhập tên bé, thông tin gia đình hoặc nội dung nhật ký. Báo cáo chỉ tự thêm thông tin trình duyệt, trạng thái mạng và chế độ mở app.</small>
    <button className="primary">Mở GitHub để gửi</button>
  </form>;
}