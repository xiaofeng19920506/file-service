import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * Ribbon 下拉：点击外部或 Esc 关闭。
 * 浮层通过 portal 挂到 body，避免被 `.ppt-rb-panel { overflow-x: auto }` 裁切。
 */
export function useRibbonPopover<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<T | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
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

  return { open, setOpen, wrapRef, panelRef };
}

const POPOVER_MAX_HEIGHT = 340;
const VIEWPORT_PAD = 8;

function computePopoverStyle(anchor: HTMLElement): CSSProperties {
  const r = anchor.getBoundingClientRect();
  const minWidth = Math.max(r.width, 168);
  const spaceBelow = window.innerHeight - r.bottom - VIEWPORT_PAD;
  const spaceAbove = r.top - VIEWPORT_PAD;
  const placeAbove = spaceBelow < 140 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(
    POPOVER_MAX_HEIGHT,
    Math.max(120, placeAbove ? spaceAbove : spaceBelow),
  );

  let left = r.left;
  if (left + minWidth > window.innerWidth - VIEWPORT_PAD) {
    left = window.innerWidth - minWidth - VIEWPORT_PAD;
  }
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;

  if (placeAbove) {
    return {
      position: 'fixed',
      top: Math.max(VIEWPORT_PAD, r.top - 2 - maxHeight),
      left,
      minWidth,
      maxHeight,
      zIndex: 5600,
    };
  }

  return {
    position: 'fixed',
    top: r.bottom + 2,
    left,
    minWidth,
    maxHeight,
    zIndex: 5600,
  };
}

export function RibbonPopoverPanel({
  children,
  className,
  title,
  anchorRef,
  panelRef,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  anchorRef: RefObject<HTMLElement | null>;
  panelRef?: RefObject<HTMLDivElement | null>;
}) {
  const localPanelRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({
    position: 'fixed',
    top: -9999,
    left: 0,
    visibility: 'hidden',
    zIndex: 5600,
  });

  useLayoutEffect(() => {
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      setStyle(computePopoverStyle(anchor));
    };
    update();
    window.addEventListener('resize', update);
    // 捕获阶段：ribbon 横向滚动、画布滚动都会触发
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef]);

  const setRefs = (node: HTMLDivElement | null) => {
    localPanelRef.current = node;
    if (panelRef) {
      (panelRef as { current: HTMLDivElement | null }).current = node;
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={setRefs}
      className={className ? `ppt-rb-popover ${className}` : 'ppt-rb-popover'}
      role="dialog"
      aria-label={title}
      style={style}
    >
      {title && <p className="ppt-rb-popover-title">{title}</p>}
      {children}
    </div>,
    document.body,
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
