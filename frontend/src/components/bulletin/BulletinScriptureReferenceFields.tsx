import { useMemo } from 'react';
import { getChapterCount, getVerseCount } from '../../lib/bible-book-meta';
import {
  clampScriptureReference,
  formatScriptureReference,
  parseScriptureReference,
  type ScriptureReferenceParts,
} from '../../lib/scripture-reference';
import { useI18n } from '../../i18n';

type BulletinScriptureReferenceFieldsProps = {
  book: string;
  reference: string;
  disabled?: boolean;
  onChange: (reference: string) => void;
};

function numberOptions(count: number, min = 1): number[] {
  if (count < min) return [];
  return Array.from({ length: count - min + 1 }, (_, i) => i + min);
}

export default function BulletinScriptureReferenceFields({
  book,
  reference,
  disabled,
  onChange,
}: BulletinScriptureReferenceFieldsProps) {
  const { t } = useI18n();

  const parsed = useMemo(
    () => clampScriptureReference(book, parseScriptureReference(reference), getChapterCount, getVerseCount),
    [book, reference],
  );

  const chapterCount = book ? getChapterCount(book) : 0;
  const verseCount = book && parsed ? getVerseCount(book, parsed.chapter) : 0;

  const apply = (patch: Partial<ScriptureReferenceParts>) => {
    const base: ScriptureReferenceParts = parsed ?? { chapter: 1, startVerse: 1, endVerse: 1 };
    const next = clampScriptureReference(book, { ...base, ...patch }, getChapterCount, getVerseCount);
    onChange(next ? formatScriptureReference(next) : '');
  };

  if (!book) {
    return (
      <p className="bulletin-scripture-picker-hint">{t('bulletin.scriptureSelectBookFirst')}</p>
    );
  }

  const hasChapter = parsed !== null;

  return (
    <div className="bulletin-scripture-picker-body">
      <label className="bulletin-scripture-picker-field">
        <span className="bulletin-scripture-picker-label">{t('bulletin.scriptureChapter')}</span>
        <select
          className="bulletin-scripture-picker-select"
          value={parsed?.chapter ?? ''}
          disabled={disabled}
          onChange={(e) => {
            const chapter = Number(e.target.value);
            if (!chapter) {
              onChange('');
              return;
            }
            apply({ chapter, startVerse: 1, endVerse: 1 });
          }}
        >
          <option value="">{t('bulletin.scriptureChapterPlaceholder')}</option>
          {numberOptions(chapterCount).map((chapter) => (
            <option key={chapter} value={chapter}>
              {chapter}
            </option>
          ))}
        </select>
      </label>

      {!hasChapter ? (
        <p className="bulletin-scripture-picker-hint">{t('bulletin.scriptureSelectChapterFirst')}</p>
      ) : (
        <div className="bulletin-scripture-verse-range">
          <span className="bulletin-scripture-picker-label bulletin-scripture-verse-range-title">
            {t('bulletin.scriptureReference')}
          </span>
          <div className="bulletin-scripture-verse-range-row">
            <label className="bulletin-scripture-picker-field bulletin-scripture-picker-field--compact">
              <span className="bulletin-scripture-picker-sublabel">{t('bulletin.scriptureStartVerse')}</span>
              <select
                className="bulletin-scripture-picker-select"
                value={parsed.startVerse}
                disabled={disabled}
                onChange={(e) => {
                  const startVerse = Number(e.target.value);
                  if (!startVerse) return;
                  apply({ startVerse, endVerse: Math.max(parsed.endVerse, startVerse) });
                }}
              >
                {numberOptions(verseCount).map((verse) => (
                  <option key={verse} value={verse}>
                    {verse}
                  </option>
                ))}
              </select>
            </label>

            <span className="bulletin-scripture-verse-separator" aria-hidden>
              —
            </span>

            <label className="bulletin-scripture-picker-field bulletin-scripture-picker-field--compact">
              <span className="bulletin-scripture-picker-sublabel">{t('bulletin.scriptureEndVerse')}</span>
              <select
                className="bulletin-scripture-picker-select"
                value={parsed.endVerse}
                disabled={disabled}
                onChange={(e) => {
                  const endVerse = Number(e.target.value);
                  if (!endVerse) return;
                  apply({ endVerse });
                }}
              >
                {numberOptions(verseCount, parsed.startVerse).map((verse) => (
                  <option key={verse} value={verse}>
                    {verse}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
