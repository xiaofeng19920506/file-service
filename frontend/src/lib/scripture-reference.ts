export type ScriptureReferenceParts = {
  chapter: number;
  startVerse: number;
  endVerse: number;
};

const REFERENCE_RE = /^\s*(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?\s*$/;

/** 解析存库经节，如 `15:1-11`、`3:16` */
export function parseScriptureReference(reference: string): ScriptureReferenceParts | null {
  const match = reference.trim().match(REFERENCE_RE);
  if (!match) return null;
  const chapter = Number(match[1]);
  const startVerse = Number(match[2]);
  const endVerse = match[3] ? Number(match[3]) : startVerse;
  if (!chapter || !startVerse || !endVerse) return null;
  return {
    chapter,
    startVerse: Math.min(startVerse, endVerse),
    endVerse: Math.max(startVerse, endVerse),
  };
}

/** 格式化为 PPT 补丁用的经节字符串 */
export function formatScriptureReference(parts: ScriptureReferenceParts): string {
  const { chapter, startVerse, endVerse } = parts;
  if (chapter < 1 || startVerse < 1 || endVerse < 1) return '';
  if (startVerse === endVerse) return `${chapter}:${startVerse}`;
  return `${chapter}:${startVerse}-${endVerse}`;
}

export function clampScriptureReference(
  book: string,
  parts: ScriptureReferenceParts | null,
  getChapterCount: (book: string) => number,
  getVerseCount: (book: string, chapter: number) => number,
): ScriptureReferenceParts | null {
  if (!book || !parts) return null;
  const chapterCount = getChapterCount(book);
  if (!chapterCount) return null;

  const chapter = Math.min(Math.max(1, parts.chapter), chapterCount);
  const verseCount = getVerseCount(book, chapter);
  if (!verseCount) return null;

  const startVerse = Math.min(Math.max(1, parts.startVerse), verseCount);
  const endVerse = Math.min(Math.max(startVerse, parts.endVerse), verseCount);
  return { chapter, startVerse, endVerse };
}
