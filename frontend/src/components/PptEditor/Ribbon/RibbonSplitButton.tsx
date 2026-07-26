import type { ReactNode } from 'react';
import RibbonIcon, { type RibbonIconName } from './icons';
import { RibbonPopoverPanel, useRibbonPopover } from './RibbonPopover';

/**
 * 拆分按钮：左/上半执行主命令，右/下半展开菜单。
 * 未提供 onClick 时整个按钮只负责展开菜单。
 */
export default function RibbonSplitButton({
  icon,
  label,
  size = 'small',
  onClick,
  disabled,
  active = false,
  menuTitle,
  children,
  swatch,
}: {
  icon: RibbonIconName;
  label: string;
  size?: 'large' | 'small' | 'icon';
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  menuTitle?: string;
  /** 下拉内容，收到 close 用于点选后关闭 */
  children: (close: () => void) => ReactNode;
  /** 颜色条（字体颜色/填充色按钮下方色块） */
  swatch?: string | null;
}) {
  const { open, setOpen, wrapRef, panelRef } = useRibbonPopover();
  const close = () => setOpen(false);

  return (
    <div className={`ppt-rb-split ppt-rb-split--${size}`} ref={wrapRef}>
      {onClick ? (
        <button
          type="button"
          className={`ppt-rb-btn ppt-rb-btn--${size} ppt-rb-split-main${active ? ' is-active' : ''}`}
          onMouseDown={(e) => {
            if (!disabled) e.preventDefault();
          }}
          onClick={onClick}
          disabled={disabled}
          title={label}
          aria-label={label}
        >
          <span className="ppt-rb-split-icon-wrap">
            <RibbonIcon name={icon} />
            {swatch !== undefined && (
              <span
                className="ppt-rb-swatch"
                style={{ background: swatch ?? 'transparent' }}
                aria-hidden
              />
            )}
          </span>
          {size !== 'icon' && <span className="ppt-rb-btn-label">{label}</span>}
        </button>
      ) : null}
      <button
        type="button"
        className={`ppt-rb-btn ppt-rb-split-arrow ppt-rb-split-arrow--${size}${onClick ? '' : ' ppt-rb-split-solo'}${open ? ' is-open' : ''}`}
        onMouseDown={(e) => {
          if (!disabled) e.preventDefault();
        }}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={onClick ? `${label} 选项` : label}
        aria-label={onClick ? `${label} 选项` : label}
        aria-expanded={open}
      >
        {!onClick && (
          <span className="ppt-rb-split-icon-wrap">
            <RibbonIcon name={icon} />
            {swatch !== undefined && (
              <span
                className="ppt-rb-swatch"
                style={{ background: swatch ?? 'transparent' }}
                aria-hidden
              />
            )}
          </span>
        )}
        {!onClick && size !== 'icon' && <span className="ppt-rb-btn-label">{label}</span>}
        <svg className="ppt-rb-caret" viewBox="0 0 8 5" width={8} height={5} aria-hidden>
          <path d="M0 0h8L4 5z" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <RibbonPopoverPanel title={menuTitle} anchorRef={wrapRef} panelRef={panelRef}>
          {children(close)}
        </RibbonPopoverPanel>
      )}
    </div>
  );
}
