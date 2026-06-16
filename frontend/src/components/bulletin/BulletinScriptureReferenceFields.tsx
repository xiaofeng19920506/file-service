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

function verseOptions(count: number, min = 1): number[] {
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
    return <p className="bulletin-field-hint">{t('bulletin.scriptureSelectBookFirst')}</p>;
  }

  const hasChapter = parsed !== null;

  return (
    <div className="bulletin-scripture-reference">
      <label className="bulletin-field bulletin-scripture-reference-chapter">
        {t('bulletin.scriptureChapter')}
        <select
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
          {verseOptions(chapterCount).map((chapter) => (
            <option key={chapter} value={chapter}>
              {t('bulletin.scriptureChapterOption', { chapter })}
            </option>
          ))}
        </select>
      </label>

      {!hasChapter ? (
        <p className="bulletin-field-hint bulletin-scripture-reference-hint">
          {t('bulletin.scriptureSelectChapterFirst')}
        </p>
      ) : (
        <>
          <label className="bulletin-field">
            {t('bulletin.scriptureStartVerse')}
            <select
              value={parsed.startVerse}
              disabled={disabled}
              onChange={(e) => {
                const startVerse = Number(e.target.value);
                if (!startVerse) return;
                apply({ startVerse, endVerse: Math.max(parsed.endVerse, startVerse) });
              }}
            >
              {verseOptions(verseCount).map((verse) => (
                <option key={verse} value={verse}>
                  {t('bulletin.scriptureVerseOption', { verse })}
                </option>
              ))}
            </select>
          </label>

          <label className="bulletin-field">
            {t('bulletin.scriptureEndVerse')}
            <select
              value={parsed.endVerse}
              disabled={disabled}
              onChange={(e) => {
                const endVerse = Number(e.target.value);
                if (!endVerse) return;
                apply({ endVerse });
              }}
            >
              {verseOptions(verseCount, parsed.startVerse).map((verse) => (
                <option key={verse} value={verse}>
                  {t('bulletin.scriptureVerseOption', { verse })}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  );
}
