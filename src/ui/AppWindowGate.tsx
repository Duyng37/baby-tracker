import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { isAppWindow, subscribeAppWindow } from '../pwa/app-window';
import { trapDialogTab } from './dialog-focus';
import { Icon } from './Icon';

export function AppWindowGate({ children }: { children: ReactNode }) {
  const appWindow = useSyncExternalStore(subscribeAppWindow, isAppWindow, isAppWindow);
  // Memory only: a reload/new page shows the reminder again, but normal re-renders do not.
  const [dismissed, setDismissed] = useState(false);
  // Defer Account/Tracker until dismissal so its sheets cannot cover the reminder.
  return appWindow || dismissed ? children : <InstallReminder onClose={() => setDismissed(true)} />;
}

export function InstallReminder({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  const [imageFailed, setImageFailed] = useState(false);
  const id = useId();
  const show = () => {
    const dialog = ref.current;
    if (!mounted.current || !dialog || dialog.open) return;
    dialog.showModal(); heading.current?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    mounted.current = true; show();
    const dialog = ref.current;
    return () => { mounted.current = false; dialog?.close(); };
  }, []);
  return <main className="install-gate">
    <span className="brand" aria-hidden="true">nôi.</span>
    <dialog ref={ref} className="install-reminder" aria-labelledby={id} aria-describedby={`${id}-next`} aria-modal="true"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClose={() => { if (mounted.current && !ref.current?.open) onClose(); }}
      onKeyDown={event => trapDialogTab(event.currentTarget, event)}>
      <button className="icon-button install-reminder-close" type="button" onClick={onClose} aria-label="Đóng hướng dẫn cài Nôi"><Icon name="close" /></button>
      <h1 id={id} ref={heading} tabIndex={-1}>Thêm Nôi vào màn hình chính để mở nhanh hơn, không cần tìm lại trang web</h1>
      {!imageFailed ? <picture className="install-guide">
        <source media="(prefers-reduced-motion: reduce)" srcSet="/install-guide-still-v1.gif" />
        <img src="/install-guide-v1.gif" width="240" height="490" decoding="async"
          alt="Hướng dẫn thao tác thêm Nôi vào màn hình chính" onError={() => setImageFailed(true)} />
      </picture> : <div className="install-guide-error" role="alert"><p>Chưa tải được hình hướng dẫn.</p>
        <p>Trên iPhone/iPad: mở Safari → Chia sẻ → Thêm vào MH chính → Thêm.</p>
        <p>Trên Android hoặc máy tính: mở menu Chrome/Edge → Cài đặt ứng dụng hoặc Thêm vào màn hình chính.</p></div>}
      <p id={`${id}-next`}>Sau khi thêm, hãy mở Nôi từ biểu tượng ứng dụng trên thiết bị. Bạn cũng có thể đóng hướng dẫn để tiếp tục dùng trên trình duyệt.</p>
    </dialog>
  </main>;
}