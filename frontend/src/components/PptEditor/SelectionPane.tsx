import { useMemo } from 'react';
import { useI18n } from '../../i18n';
import { describeElements } from '../../lib/ppt-ops/shape';
import RibbonIcon, { type RibbonIconName } from './Ribbon/icons';

const ICONS: Record<string, RibbonIconName> = {
  sp: 'shapes',
  pic: 'picture',
  graphicFrame: 'table',
  grpSp: 'arrange',
  cxnSp: 'shapes',
};

/** 选择窗格：列出本页所有元素，可点选与调层级 */
export default function SelectionPane({
  slideXml,
  selectedElementId,
  onSelect,
  onOrder,
  onClose,
}: {
  slideXml: string | null;
  selectedElementId: number | null;
  onSelect: (id: number) => void;
  onOrder: (action: 'forward' | 'backward') => void;
  onClose: () => void;
}) {
  const { t } = useI18n();

  const items = useMemo(() => (slideXml ? describeElements(slideXml) : []), [slideXml]);

  const label = (item: (typeof items)[number]) => {
    if (item.text) return item.text;
    if (item.name) return item.name;
    if (item.tag === 'pic') return t('ppt.ribbon.elementPicture');
    if (item.tag === 'graphicFrame') return t('ppt.ribbon.elementTable');
    return item.hasText ? t('ppt.ribbon.elementText') : t('ppt.ribbon.elementShape');
  };

  return (
    <aside className="ppt-selection-pane" aria-label={t('ppt.ribbon.selectionPaneTitle')}>
      <div className="ppt-selection-head">
        <strong>{t('ppt.ribbon.selectionPaneTitle')}</strong>
        <button
          type="button"
          className="ppt-find-close"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          ×
        </button>
      </div>

      <div className="ppt-selection-order">
        <button type="button" className="ppt-rb-menu-item" onClick={() => onOrder('forward')}>
          {t('ppt.ribbon.bringForward')}
        </button>
        <button type="button" className="ppt-rb-menu-item" onClick={() => onOrder('backward')}>
          {t('ppt.ribbon.sendBackward')}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="ppt-rb-empty">{t('ppt.ribbon.selectionEmpty')}</p>
      ) : (
        <ul className="ppt-selection-list">
          {[...items].reverse().map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`ppt-selection-item${selectedElementId === item.id ? ' is-active' : ''}`}
                onClick={() => onSelect(item.id)}
                title={label(item)}
              >
                <RibbonIcon name={ICONS[item.tag] ?? 'placeholder'} />
                <span>{label(item)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
