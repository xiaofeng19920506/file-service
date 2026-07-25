import RibbonButton from './RibbonButton';
import type { RibbonIconName } from './icons';

/** 开关型按钮（加粗/斜体/网格线等） */
export default function RibbonToggle({
  icon,
  label,
  on,
  onToggle,
  disabled,
  shortcut,
  size = 'icon',
}: {
  icon: RibbonIconName;
  label: string;
  on?: boolean;
  onToggle?: () => void;
  disabled?: boolean;
  shortcut?: string;
  size?: 'large' | 'small' | 'icon';
}) {
  return (
    <RibbonButton
      icon={icon}
      label={label}
      size={size}
      active={!!on}
      disabled={disabled}
      onClick={onToggle}
      title={shortcut ? `${label} (${shortcut})` : label}
    />
  );
}
