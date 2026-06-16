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

/** 中文 28pt 每行约容纳字数（偏保守，配合 noAutofit 分页） */
export const SCRIPTURE_ZH_CHARS_PER_LINE = 19;

/** 中文每页约可容纳的视觉行数（含自动换行） */
export const SCRIPTURE_ZH_PAGE_MAX_VISUAL_LINES = 12;

/** @deprecated 使用 SCRIPTURE_ZH_CHARS_PER_LINE / SCRIPTURE_ZH_PAGE_MAX_VISUAL_LINES */
export const SCRIPTURE_ZH_PAGE_MAX_CHARS = SCRIPTURE_ZH_CHARS_PER_LINE * SCRIPTURE_ZH_PAGE_MAX_VISUAL_LINES;

/** 英文 22pt 每行约容纳字符数（偏保守避免底部裁切） */
export const SCRIPTURE_EN_CHARS_PER_LINE = 52;

/** 英文每页约可容纳的视觉行数（含节内自动换行） */
export const SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES = 10;

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

function paginateChineseVerses(verses: BibleVerse[]): string[] {
  if (!verses.length) return [];
  const pages: string[] = [];
  let current: BibleVerse[] = [];

  for (const verse of verses) {
    const candidate = [...current, verse];
    const block = formatChineseVerseBlock(candidate);
    const lines = estimateChineseBlockVisualLines(block);

    if (current.length > 0 && lines > SCRIPTURE_ZH_PAGE_MAX_VISUAL_LINES) {
      pages.push(formatChineseVerseBlock(current));
      current = [verse];
    } else {
      current = candidate;
    }
  }

  if (current.length) pages.push(formatChineseVerseBlock(current));
  return pages;
}

/** 估算一节英文经文在 slide 上占用的视觉行数 */
export function estimateEnglishVerseVisualLines(verse: BibleVerse): number {
  const line = formatEnglishVerseLine(verse);
  return Math.max(1, Math.ceil(line.length / SCRIPTURE_EN_CHARS_PER_LINE));
}

function paginateEnglishVerses(verses: BibleVerse[]): string[][] {
  const pages: string[][] = [];
  let current: string[] = [];
  let usedLines = 0;

  for (const verse of verses) {
    const formatted = formatEnglishVerseLine(verse);
    const cost = estimateEnglishVerseVisualLines(verse);

    if (current.length > 0 && usedLines + cost > SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES) {
      pages.push(current);
      current = [formatted];
      usedLines = cost;
    } else {
      current.push(formatted);
      usedLines += cost;
    }
  }

  if (current.length) pages.push(current);
  return pages;
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
