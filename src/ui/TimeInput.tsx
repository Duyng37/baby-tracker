import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './Icon';

/** Accept HH:mm or four digits from a mobile numeric keyboard. */
export function parseTimeText(text: string): string | null {
  const match = /^([01][0-9]|2[0-3]):?([0-5][0-9])$/.exec(text);
  return match ? `${match[1]}:${match[2]}` : null;
}

export function TimeInput({ id, name, value, required, disabled, onChange, ariaLabel }: {
  id?: string; name?: string; value: string; required?: boolean; disabled?: boolean;
  onChange: (value: string) => void; ariaLabel: string;
}) {
  const popupId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState(['00', '00']);
  const selectionRef = useRef(selection);
  const expanded = open && !disabled;
  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }
  function show() {
    if (disabled) return;
    const next = (parseTimeText(value) ?? '00:00').split(':');
    selectionRef.current = next; setSelection(next); setOpen(true);
  }
  useEffect(() => {
    if (!expanded) return;
    const selected = root.current?.querySelectorAll<HTMLButtonElement>('.time-input-options button[aria-pressed="true"]');
    selected?.forEach(button => button.scrollIntoView({ block: 'nearest' }));
    selected?.[0]?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [expanded]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  function choose(column: number, next: string) {
    const selected = selectionRef.current.map((part, index) => index === column ? next : part);
    selectionRef.current = selected; setSelection(selected);
  }
  function move(event: KeyboardEvent<HTMLButtonElement>, column: number, number: number, count: number) {
    const next = event.key === 'ArrowDown' ? (number + 1) % count : event.key === 'ArrowUp' ? (number + count - 1) % count
      : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const text = String(next).padStart(2, '0'); choose(column, text);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-value="${text}"]`)?.focus();
  }
  return <div className="time-input" ref={root}
    onBlur={event => {
      // Mobile browsers can blur to no target when tapping a button inside the popup.
      // Closing here would unmount that button before its click; outside taps use pointerdown.
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close();
    }}
    onKeyDown={event => {
      if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); close(true); }
    }}>
    <div className="time-input-control"><input id={id} name={name} className="time-input-text" type="text" placeholder="HH:mm" maxLength={5}
      inputMode="numeric" autoComplete="off" spellCheck={false} pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
      value={value} required={required} disabled={disabled} aria-label={ariaLabel} aria-invalid={!!value && !parseTimeText(value)}
      onChange={event => { const text = event.currentTarget.value; onChange(parseTimeText(text) ?? text); }}
      onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); show(); } }} />
      <button ref={trigger} className="icon-button time-input-trigger" type="button" disabled={disabled}
        aria-label={`Mở bộ chọn giờ: ${ariaLabel}`} aria-haspopup="dialog" aria-expanded={expanded} aria-controls={expanded ? popupId : undefined}
        onClick={() => expanded ? close() : show()}><Icon name="clock" /></button></div>
    {expanded && <div id={popupId} className="time-input-popover" role="dialog" aria-label={ariaLabel}>
      <div className="time-input-heading"><strong>Chọn giờ</strong><output aria-label="Giờ đang chọn">{selection.join(':')}</output></div>
      <div className="time-input-columns">{[24, 60].map((count, column) => <div className="time-input-column" key={column}>
        <span className="time-input-caption">{column === 0 ? 'Giờ' : 'Phút'}</span>
        <div className="time-input-options" role="group" aria-label={column === 0 ? 'Giờ' : 'Phút'}>
          {Array.from({ length: count }, (_, number) => {
            const text = String(number).padStart(2, '0');
            return <button type="button" key={text} data-value={text} aria-label={`${text} ${column === 0 ? 'giờ' : 'phút'}`}
              aria-pressed={selection[column] === text} tabIndex={selection[column] === text ? 0 : -1}
              onClick={() => choose(column, text)} onKeyDown={event => move(event, column, number, count)}>{text}</button>;
          })}
        </div>
      </div>)}</div>
      <div className="time-input-actions"><button type="button" onClick={() => close(true)}>Hủy</button>
        <button type="button" className="primary" onClick={() => { onChange(selectionRef.current.join(':')); close(true); }}>Xong</button></div>
    </div>}
  </div>;
}