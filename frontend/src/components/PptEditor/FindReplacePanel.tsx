import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import { countText } from '../../lib/ppt-ops/text';

/** 查找 / 替换：作用于当前页 */
export default function FindReplacePanel({
  mode,
  slideXml,
  onReplaceAll,
  onClose,
}: {
  mode: 'find' | 'replace';
  slideXml: string | null;
  onReplaceAll: (search: string, replacement: string, matchCase: boolean) => number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [replaced, setReplaced] = useState<number | null>(null);

  useEffect(() => {
    setReplaced(null);
  }, [search, replacement, matchCase, slideXml]);

  const matches = useMemo(
    () => (slideXml && search ? countText(slideXml, search, matchCase) : 0),
    [matchCase, search, slideXml],
  );

  return (
    <div className="ppt-find-panel" role="dialog" aria-label={t(`ppt.ribbon.${mode}Title`)}>
      <div className="ppt-find-head">
        <strong>{t(`ppt.ribbon.${mode}Title`)}</strong>
        <button type="button" className="ppt-find-close" onClick={onClose} aria-label={t('common.close')}>
          ×
        </button>
      </div>

      <label className="ppt-rb-field">
        <span>{t('ppt.ribbon.findPlaceholder')}</span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      </label>

      {mode === 'replace' && (
        <label className="ppt-rb-field">
          <span>{t('ppt.ribbon.replacePlaceholder')}</span>
          <input value={replacement} onChange={(e) => setReplacement(e.target.value)} />
        </label>
      )}

      <label className="ppt-find-case">
        <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
        <span>{t('ppt.ribbon.matchCase')}</span>
      </label>

      <p className="ppt-find-status" aria-live="polite">
        {replaced != null
          ? t('ppt.ribbon.replacedCount', { count: replaced })
          : search
            ? matches > 0
              ? t('ppt.ribbon.matchCount', { count: matches })
              : t('ppt.ribbon.noMatch')
            : ''}
      </p>

      {mode === 'replace' && (
        <div className="ppt-rb-form-actions">
          <button
            type="button"
            className="ppt-rb-menu-item is-primary"
            disabled={!search || matches === 0}
            onClick={() => setReplaced(onReplaceAll(search, replacement, matchCase))}
          >
            {t('ppt.ribbon.replaceAll')}
          </button>
        </div>
      )}
    </div>
  );
}
