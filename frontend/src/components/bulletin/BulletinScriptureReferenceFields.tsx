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

  const hasChapter = parsed !== null;
  const fieldsDisabled = Boolean(disabled) || !book;

  return (
    <div className="bulletin-scripture-picker-body">
      <label className="bulletin-scripture-picker-field">
        <span className="bulletin-scripture-picker-label">{t('bulletin.scriptureChapter')}</span>
        <select
          className="bulletin-scripture-picker-select"
          value={parsed?.chapter != null ? String(parsed.chapter) : ''}
          disabled={fieldsDisabled}
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

      <label className="bulletin-scripture-picker-field">
        <span className="bulletin-scripture-picker-label">{t('bulletin.scriptureStartVerse')}</span>
        <select
          className="bulletin-scripture-picker-select"
          value={hasChapter ? String(parsed.startVerse) : ''}
          disabled={fieldsDisabled || !hasChapter}
          onChange={(e) => {
            const startVerse = Number(e.target.value);
            if (!startVerse || !parsed) return;
            apply({ startVerse, endVerse: Math.max(parsed.endVerse, startVerse) });
          }}
        >
          {!hasChapter ? (
            <option value="">{t('bulletin.scriptureStartVerse')}</option>
          ) : (
            numberOptions(verseCount).map((verse) => (
              <option key={verse} value={String(verse)}>
                {verse}
              </option>
            ))
          )}
        </select>
      </label>

      <label className="bulletin-scripture-picker-field">
        <span className="bulletin-scripture-picker-label">{t('bulletin.scriptureEndVerse')}</span>
        <select
          className="bulletin-scripture-picker-select"
          value={hasChapter ? String(parsed.endVerse) : ''}
          disabled={fieldsDisabled || !hasChapter}
          onChange={(e) => {
            const endVerse = Number(e.target.value);
            if (!endVerse) return;
            apply({ endVerse });
          }}
        >
          {!hasChapter ? (
            <option value="">{t('bulletin.scriptureEndVerse')}</option>
          ) : (
            numberOptions(verseCount, parsed.startVerse).map((verse) => (
              <option key={verse} value={String(verse)}>
                {verse}
              </option>
            ))
          )}
        </select>
      </label>
    </div>
  );
}
