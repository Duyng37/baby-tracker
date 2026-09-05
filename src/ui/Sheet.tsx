import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
import { trapDialogTab } from './dialog-focus';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    heading.current?.focus({ preventScroll: true });
    // Close before React removes the dialog. Passive cleanup runs too late to restore focus.
    return () => {
      dialog.close();
      const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>('#content');
      target?.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className="sheet" aria-labelledby={id}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => trapDialogTab(event.currentTarget, event)}>
    <div className="sheet-handle" aria-hidden="true" />
    <div className="sheet-heading"><div><span className="eyebrow">NÔI · BÊN CON MỖI NGÀY</span><h2 id={id} ref={heading} tabIndex={-1}>{title}</h2></div>
      <button className="icon-button" type="button" onClick={onClose} aria-label="Đóng"><Icon name="close" /></button></div>
    <div className="sheet-content">{children}</div>
  </dialog>;
}