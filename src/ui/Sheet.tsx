import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="sheet" aria-labelledby={id} onCancel={onClose}>
    <div className="sheet-heading"><h2 id={id}>{title}</h2><button type="button" onClick={onClose} aria-label="Đóng">×</button></div>
    {children}
  </dialog>;
}