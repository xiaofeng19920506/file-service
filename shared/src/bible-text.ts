import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { englishBookNameFromLabel, nivBookFileName, chiunBookFileName } from './bible-book-id.js';
import { parseScriptureReference } from './scripture-reference.js';

export type BibleVerse = {
  verse: number;
  text: string;
};

type BibleChapterJson = {
  chapter: number | string;
  verses: BibleVerse[];
};

type BibleBookJson = {
  name?: string;
  book?: string;
  chapters: BibleChapterJson[];
};

type BiblePassage = {
  zh: BibleVerse[];
  en: BibleVerse[];
};

const dataRoot = resolveBibleDataRoot();

function resolveBibleDataRoot(): string {
  const here = import.meta.dirname;
  const candidates = [
    join(here, '../data/bible'),
    join(process.cwd(), 'shared/data/bible'),
    join(process.cwd(), '../shared/data/bible'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'zh-chiun', 'Proverbs.json'))) return dir;
  }
  return candidates[0]!;
}

function normalizeChineseText(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/；/g, '，')
    .replace(/。+$/g, '')
    .trim();
}

function normalizeEnglishText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

async function readBookJson(dir: string, fileName: string): Promise<BibleBookJson> {
  const raw = await readFile(join(dir, `${fileName}.json`), 'utf8');
  return JSON.parse(raw) as BibleBookJson;
}

export async function loadScripturePassage(
  bookLabel: string,
  reference: string,
): Promise<BiblePassage | null> {
  const parsed = parseScriptureReference(reference);
  const englishBook = englishBookNameFromLabel(bookLabel);
  if (!parsed || !englishBook) return null;

  const [zhBook, enBook] = await Promise.all([
    readBookJson(join(dataRoot, 'zh-chiun'), chiunBookFileName(englishBook)),
    readBookJson(join(dataRoot, 'en-niv'), nivBookFileName(englishBook)),
  ]);

  const zhChapter = zhBook.chapters.find((c) => Number(c.chapter) === parsed.chapter);
  const enChapter = enBook.chapters.find((c) => Number(c.chapter) === parsed.chapter);
  if (!zhChapter || !enChapter) return null;

  const zh = zhChapter.verses
    .filter((v) => v.verse >= parsed.startVerse && v.verse <= parsed.endVerse)
    .map((v) => ({ verse: v.verse, text: normalizeChineseText(v.text) }));
  const en = enChapter.verses
    .filter((v) => Number(v.verse) >= parsed.startVerse && Number(v.verse) <= parsed.endVerse)
    .map((v) => ({ verse: Number(v.verse), text: normalizeEnglishText(v.text) }));

  if (!zh.length || !en.length) return null;
  return { zh, en };
}

/** 中文 slide 5：节号 + 经文，节与节之间空格（与模板一致） */
export function formatChineseVerseBlock(verses: BibleVerse[]): string {
  return verses.map((v) => `${v.verse} ${v.text}`).join(' ');
}

/** 英文 slide 6：每节一行，节号 + 经文 */
export function formatEnglishVerseLine(verse: BibleVerse): string {
  return `${verse.verse} ${verse.text}`;
}

export type ScriptureSlideBodies = {
  /** 中文经文页（slide 5 模板，可继续复制） */
  chinesePages: string[];
  /** 英文经文页（slide 6 模板，每页多行） */
  englishPages: string[][];
};

/** 中文 29pt 每行约容纳字数（按投影实测校准：~22 字/行） */
export const SCRIPTURE_ZH_CHARS_PER_LINE = 22;

/** 中文每页视觉行数：最少 10 行、最多 11 行 */
export const SCRIPTURE_ZH_PAGE_MIN_VISUAL_LINES = 10;
export const SCRIPTURE_ZH_PAGE_MAX_VISUAL_LINES = 11;

/** 中文每页字数上下限（由行数 × 每行字数推导） */
export const SCRIPTURE_ZH_PAGE_MIN_CHARS =
  SCRIPTURE_ZH_PAGE_MIN_VISUAL_LINES * SCRIPTURE_ZH_CHARS_PER_LINE;
export const SCRIPTURE_ZH_PAGE_MAX_CHARS =
  SCRIPTURE_ZH_PAGE_MAX_VISUAL_LINES * SCRIPTURE_ZH_CHARS_PER_LINE;

/** 英文 22pt 每行约容纳字符数（偏保守，配合 noAutofit 分页） */
export const SCRIPTURE_EN_CHARS_PER_LINE = 52;

/** 英文每页视觉行数：最少 13 行、最多 14 行 */
export const SCRIPTURE_EN_PAGE_MIN_VISUAL_LINES = 13;
export const SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES = 14;

/** @deprecated 使用 SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES */
export const SCRIPTURE_EN_PAGE_MAX_LINES = SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES;

/** @deprecated 使用 SCRIPTURE_ZH_PAGE_MAX_CHARS */
export const SCRIPTURE_SLIDE5_ZH_MAX_CHARS = SCRIPTURE_ZH_PAGE_MAX_CHARS;
/** @deprecated 使用 SCRIPTURE_ZH_PAGE_MAX_CHARS */
export const SCRIPTURE_SLIDE6_ZH_MAX_CHARS = SCRIPTURE_ZH_PAGE_MAX_CHARS;
/** @deprecated 使用 SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES */
export const SCRIPTURE_SLIDE6_EN_MAX_LINES = SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES;

/** 估算一段中文经文块在 slide 上占用的视觉行数 */
export function estimateChineseBlockVisualLines(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / SCRIPTURE_ZH_CHARS_PER_LINE));
}

type LineEstimate = (text: string) => number;

/** 取文本头部，不超过指定视觉行数 */
function takeHeadVisualLines(
  text: string,
  maxVisualLines: number,
  charsPerLine: number,
  estimate: LineEstimate,
): [string, string] {
  const trimmed = text.trim();
  if (!trimmed) return ['', ''];
  if (estimate(trimmed) <= maxVisualLines) return [trimmed, ''];

  const maxChars = maxVisualLines * charsPerLine;
  let end = Math.min(maxChars, trimmed.length);
  if (end < trimmed.length) {
    const lastSpace = trimmed.slice(0, end).lastIndexOf(' ');
    if (lastSpace > end * 0.35) end = lastSpace;
  }

  let head = trimmed.slice(0, end).trim();
  if (!head.length) {
    head = trimmed.slice(0, maxChars);
    return [head, trimmed.slice(maxChars).trim()];
  }

  while (head.length > 0 && estimate(head) > maxVisualLines) {
    end = Math.max(1, Math.floor(end * 0.85));
    head = trimmed.slice(0, end).trim();
  }

  return [head, trimmed.slice(end).trim()];
}

function splitTextToMaxVisualLines(
  text: string,
  maxLines: number,
  charsPerLine: number,
  estimate: LineEstimate,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (estimate(trimmed) <= maxLines) return [trimmed];

  const pages: string[] = [];
  let remaining = trimmed;
  while (remaining.length > 0) {
    const [head, tail] = takeHeadVisualLines(remaining, maxLines, charsPerLine, estimate);
    if (!head.length) break;
    pages.push(head);
    remaining = tail;
  }
  return pages;
}

function packTextPiecesToPages(
  pieces: string[],
  estimate: LineEstimate,
  charsPerLine: number,
  minLines: number,
  maxLines: number,
): string[][] {
  const pages: string[][] = [];
  let current: string[] = [];
  let usedLines = 0;

  const flush = () => {
    if (current.length) {
      pages.push(current);
      current = [];
      usedLines = 0;
    }
  };

  const room = () => maxLines - usedLines;

  for (let piece of pieces) {
    piece = piece.trim();
    if (!piece) continue;

    while (piece) {
      const pieceLines = estimate(piece);

      if (!current.length) {
        if (pieceLines <= maxLines) {
          current.push(piece);
          usedLines = pieceLines;
          piece = '';
        } else {
          const [head, tail] = takeHeadVisualLines(piece, maxLines, charsPerLine, estimate);
          current.push(head);
          usedLines = estimate(head);
          flush();
          piece = tail;
        }
        continue;
      }

      if (pieceLines <= room()) {
        current.push(piece);
        usedLines += pieceLines;
        piece = '';
        continue;
      }

      if (usedLines >= minLines) {
        flush();
        continue;
      }

      const fillRoom = room();
      if (fillRoom > 0) {
        const [head, tail] = takeHeadVisualLines(piece, fillRoom, charsPerLine, estimate);
        if (head) {
          current.push(head);
          usedLines += estimate(head);
        }
        flush();
        piece = tail;
      } else {
        flush();
      }
    }
  }

  flush();

  if (pages.length >= 2) {
    const lastIdx = pages.length - 1;
    const lastLines = pages[lastIdx]!.reduce((sum, p) => sum + estimate(p), 0);
    if (lastLines < minLines) {
      const prevIdx = lastIdx - 1;
      const prevLines = pages[prevIdx]!.reduce((sum, p) => sum + estimate(p), 0);
      if (prevLines + lastLines <= maxLines) {
        pages[prevIdx] = [...pages[prevIdx]!, ...pages[lastIdx]!];
        pages.pop();
      }
    }
  }

  return pages;
}

function takeHeadChars(text: string, maxChars: number): [string, string] {
  const trimmed = text.trim();
  if (!trimmed) return ['', ''];
  if (trimmed.length <= maxChars) return [trimmed, ''];

  let end = maxChars;
  const lastSpace = trimmed.slice(0, end).lastIndexOf(' ');
  if (lastSpace > end * 0.35) end = lastSpace;

  const head = trimmed.slice(0, end).trim();
  if (!head.length) {
    return [trimmed.slice(0, maxChars), trimmed.slice(maxChars).trim()];
  }
  return [head, trimmed.slice(end).trim()];
}

function fillChinesePagesFromNext(pages: string[]): string[] {
  const out = [...pages];

  for (let i = 0; i < out.length - 1; i++) {
    while (
      estimateChineseBlockVisualLines(out[i]!) < SCRIPTURE_ZH_PAGE_MIN_VISUAL_LINES &&
      i + 1 < out.length
    ) {
      const next = out[i + 1]!;
      const combined = `${out[i]!} ${next}`.trim();
      if (combined.length <= SCRIPTURE_ZH_PAGE_MAX_CHARS) {
        out[i] = combined;
        out.splice(i + 1, 1);
        continue;
      }

      const room = SCRIPTURE_ZH_PAGE_MAX_CHARS - out[i]!.length - 1;
      if (room <= 0) break;

      const [head, tail] = takeHeadChars(next, room);
      if (!head.length) break;

      out[i] = `${out[i]!} ${head}`.trim();
      if (tail.length) out[i + 1] = tail;
      else out.splice(i + 1, 1);
    }
  }

  return out;
}

function splitChineseBlockToMaxLines(text: string, maxLines: number): string[] {
  return splitTextToMaxVisualLines(
    text,
    maxLines,
    SCRIPTURE_ZH_CHARS_PER_LINE,
    estimateChineseBlockVisualLines,
  );
}

function paginateChineseVerses(verses: BibleVerse[]): string[] {
  if (!verses.length) return [];
  const draft: string[] = [];
  let current: BibleVerse[] = [];

  const blockText = (vs: BibleVerse[]) => formatChineseVerseBlock(vs);

  for (const verse of verses) {
    const candidate = [...current, verse];
    if (!current.length) {
      current = candidate;
      continue;
    }
    if (blockText(candidate).length <= SCRIPTURE_ZH_PAGE_MAX_CHARS) {
      current = candidate;
      continue;
    }
    draft.push(blockText(current));
    current = [verse];
  }

  if (current.length) draft.push(blockText(current));

  const splitPages = draft.flatMap((block) =>
    splitChineseBlockToMaxLines(block, SCRIPTURE_ZH_PAGE_MAX_VISUAL_LINES),
  );

  return fillChinesePagesFromNext(splitPages);
}

function paginateEnglishVerses(verses: BibleVerse[]): string[][] {
  const pieces: string[] = [];
  for (const verse of verses) {
    pieces.push(
      ...splitEnglishLineToMaxLines(
        formatEnglishVerseLine(verse),
        SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES,
      ),
    );
  }

  return packTextPiecesToPages(
    pieces,
    estimateEnglishLineVisualLines,
    SCRIPTURE_EN_CHARS_PER_LINE,
    SCRIPTURE_EN_PAGE_MIN_VISUAL_LINES,
    SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES,
  );
}

/** 估算一行英文经文（一节）在 slide 上占用的视觉行数 */
export function estimateEnglishLineVisualLines(line: string): number {
  const trimmed = line.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / SCRIPTURE_EN_CHARS_PER_LINE));
}

function splitEnglishLineToMaxLines(line: string, maxLines: number): string[] {
  return splitTextToMaxVisualLines(
    line,
    maxLines,
    SCRIPTURE_EN_CHARS_PER_LINE,
    estimateEnglishLineVisualLines,
  );
}

export function buildScriptureSlideBodies(passage: BiblePassage): ScriptureSlideBodies {
  return {
    chinesePages: paginateChineseVerses(passage.zh),
    englishPages: paginateEnglishVerses(passage.en),
  };
}

export async function resolveScriptureSlideBodies(
  bookLabel: string,
  reference: string,
): Promise<ScriptureSlideBodies | null> {
  const passage = await loadScripturePassage(bookLabel, reference);
  if (!passage) return null;
  return buildScriptureSlideBodies(passage);
}
