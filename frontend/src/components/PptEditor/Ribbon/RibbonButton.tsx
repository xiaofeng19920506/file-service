import type { ReactNode } from 'react';
import RibbonIcon, { type RibbonIconName } from './icons';

export type RibbonButtonProps = {
  icon?: RibbonIconName;
  label: string;
  /** large=大图标带文字（竖排），small=小图标+文字（横排），icon=仅图标 */
  size?: 'large' | 'small' | 'icon';
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  /** 未实现命令的提示 */
  notImplemented?: boolean;
  notImplementedHint?: string;
  children?: ReactNode;
};

export default function RibbonButton({
  icon,
  label,
  size = 'small',
  onClick,
  disabled,
  active = false,
  title,
  notImplemented = false,
  notImplementedHint,
  children,
}: RibbonButtonProps) {
  const isDisabled = disabled || notImplemented || !onClick;
  const tooltip = notImplemented && notImplementedHint ? `${label} · ${notImplementedHint}` : title || label;

  return (
    <button
      type="button"
      className={`ppt-rb-btn ppt-rb-btn--${size}${active ? ' is-active' : ''}${notImplemented ? ' is-todo' : ''}`}
      onClick={onClick}
      disabled={isDisabled}
      title={tooltip}
      aria-label={label}
      aria-pressed={active || undefined}
    >
      {children ?? (icon ? <RibbonIcon name={icon} /> : null)}
      {size !== 'icon' && <span className="ppt-rb-btn-label">{label}</span>}
    </button>
  );
}
