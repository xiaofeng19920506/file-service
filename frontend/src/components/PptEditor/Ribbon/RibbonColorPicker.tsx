import { useI18n } from '../../../i18n';
import RibbonSplitButton from './RibbonSplitButton';
import type { RibbonIconName } from './icons';
import { STANDARD_COLORS, THEME_COLORS } from './types';

/** 颜色选择：主题色 + 标准色 + 无填充 + 自定义 */
export default function RibbonColorPicker({
  icon,
  label,
  value,
  onPick,
  disabled,
  allowNone = false,
  size = 'small',
}: {
  icon: RibbonIconName;
  label: string;
  value?: string | null;
  onPick?: (hex: string | null) => void;
  disabled?: boolean;
  allowNone?: boolean;
  size?: 'large' | 'small' | 'icon';
}) {
  const { t } = useI18n();

  return (
    <RibbonSplitButton
      icon={icon}
      label={label}
      size={size}
      disabled={disabled || !onPick}
      swatch={value ?? null}
      onClick={onPick && value ? () => onPick(value) : undefined}
      menuTitle={label}
    >
      {(close) => (
        <div className="ppt-rb-colors">
          <p className="ppt-rb-colors-heading">{t('ppt.ribbon.themeColors')}</p>
          <div className="ppt-rb-swatch-grid">
            {THEME_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`ppt-rb-swatch-btn${value?.toUpperCase() === c ? ' is-active' : ''}`}
                style={{ background: c }}
                title={c}
                aria-label={c}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick?.(c);
                  close();
                }}
              />
            ))}
          </div>
          <p className="ppt-rb-colors-heading">{t('ppt.ribbon.standardColors')}</p>
          <div className="ppt-rb-swatch-grid">
            {STANDARD_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`ppt-rb-swatch-btn${value?.toUpperCase() === c ? ' is-active' : ''}`}
                style={{ background: c }}
                title={c}
                aria-label={c}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick?.(c);
                  close();
                }}
              />
            ))}
          </div>
          <div className="ppt-rb-colors-footer">
            {allowNone && (
              <button
                type="button"
                className="ppt-rb-menu-item"
                onClick={() => {
                  onPick?.(null);
                  close();
                }}
              >
                {t('ppt.ribbon.noFill')}
              </button>
            )}
            <label className="ppt-rb-menu-item ppt-rb-custom-color">
              <span>{t('ppt.ribbon.moreColors')}</span>
              <input
                type="color"
                value={value ?? '#000000'}
                onChange={(e) => onPick?.(e.target.value.toUpperCase())}
              />
            </label>
          </div>
        </div>
      )}
    </RibbonSplitButton>
  );
}
