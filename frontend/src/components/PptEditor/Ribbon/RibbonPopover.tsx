import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Ribbon 下拉浮层：点击外部或 Esc 关闭 */
export function useRibbonPopover<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<T | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return { open, setOpen, wrapRef };
}

export function RibbonPopoverPanel({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div
      className={className ? `ppt-rb-popover ${className}` : 'ppt-rb-popover'}
      role="dialog"
      aria-label={title}
    >
      {title && <p className="ppt-rb-popover-title">{title}</p>}
      {children}
    </div>
  );
}

export function RibbonMenuItem({
  children,
  onClick,
  active = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ppt-rb-menu-item${active ? ' is-active' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
