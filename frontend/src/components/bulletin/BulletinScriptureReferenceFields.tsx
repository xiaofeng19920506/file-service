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
          value={parsed?.chapter != null ? String(parsed.chapter) : ''}
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
            <option key={chapter} value={String(chapter)}>
              {chapter}
            </option>
          ))}
        </select>
      </label>

      {!hasChapter ? (
        <p className="bulletin-scripture-picker-hint">{t('bulletin.scriptureSelectChapterFirst')}</p>
      ) : (
        <>
          <label className="bulletin-scripture-picker-field">
            <span className="bulletin-scripture-picker-label">{t('bulletin.scriptureStartVerse')}</span>
            <select
              className="bulletin-scripture-picker-select"
              value={String(parsed.startVerse)}
              disabled={disabled}
              onChange={(e) => {
                const startVerse = Number(e.target.value);
                if (!startVerse) return;
                apply({ startVerse, endVerse: Math.max(parsed.endVerse, startVerse) });
              }}
            >
              {numberOptions(verseCount).map((verse) => (
                <option key={verse} value={String(verse)}>
                  {verse}
                </option>
              ))}
            </select>
          </label>

          <label className="bulletin-scripture-picker-field">
            <span className="bulletin-scripture-picker-label">{t('bulletin.scriptureEndVerse')}</span>
            <select
              className="bulletin-scripture-picker-select"
              value={String(parsed.endVerse)}
              disabled={disabled}
              onChange={(e) => {
                const endVerse = Number(e.target.value);
                if (!endVerse) return;
                apply({ endVerse });
              }}
            >
              {numberOptions(verseCount, parsed.startVerse).map((verse) => (
                <option key={verse} value={String(verse)}>
                  {verse}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  );
}
