import type { ReactNode } from 'react';
import RibbonSplitButton from './RibbonSplitButton';
import type { RibbonIconName } from './icons';

export type GalleryItem<T extends string = string> = {
  id: T;
  label: string;
  preview?: ReactNode;
};

/** 图库下拉（版式、形状、艺术字） */
export default function RibbonGallery<T extends string>({
  icon,
  label,
  items,
  onPick,
  disabled,
  size = 'large',
  columns = 5,
  menuTitle,
  activeId,
}: {
  icon: RibbonIconName;
  label: string;
  items: GalleryItem<T>[];
  onPick?: (id: T) => void;
  disabled?: boolean;
  size?: 'large' | 'small' | 'icon';
  columns?: number;
  menuTitle?: string;
  activeId?: string | null;
}) {
  return (
    <RibbonSplitButton
      icon={icon}
      label={label}
      size={size}
      disabled={disabled || !onPick || items.length === 0}
      menuTitle={menuTitle ?? label}
    >
      {(close) => (
        <div
          className="ppt-rb-gallery"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`ppt-rb-gallery-item${activeId === item.id ? ' is-active' : ''}`}
              title={item.label}
              onClick={() => {
                onPick?.(item.id);
                close();
              }}
            >
              <span className="ppt-rb-gallery-preview">{item.preview}</span>
              <span className="ppt-rb-gallery-label">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </RibbonSplitButton>
  );
}
