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

/** 中文每页约 260 字；英文每页约 14 节 */
export const SCRIPTURE_ZH_PAGE_MAX_CHARS = 260;
export const SCRIPTURE_EN_PAGE_MAX_LINES = 14;

/** @deprecated 使用 SCRIPTURE_ZH_PAGE_MAX_CHARS */
export const SCRIPTURE_SLIDE5_ZH_MAX_CHARS = SCRIPTURE_ZH_PAGE_MAX_CHARS;
/** @deprecated 使用 SCRIPTURE_ZH_PAGE_MAX_CHARS */
export const SCRIPTURE_SLIDE6_ZH_MAX_CHARS = SCRIPTURE_ZH_PAGE_MAX_CHARS;
/** @deprecated 使用 SCRIPTURE_EN_PAGE_MAX_LINES */
export const SCRIPTURE_SLIDE6_EN_MAX_LINES = SCRIPTURE_EN_PAGE_MAX_LINES;

function splitVersesByCharLimit(verses: BibleVerse[], maxChars: number): [BibleVerse[], BibleVerse[]] {
  const first: BibleVerse[] = [];
  let used = 0;
  for (const verse of verses) {
    const piece = `${verse.verse} ${verse.text}`;
    const extra = first.length ? 1 : 0;
    if (first.length && used + extra + piece.length > maxChars) break;
    first.push(verse);
    used += extra + piece.length;
  }
  return [first, verses.slice(first.length)];
}

function paginateChineseVerses(verses: BibleVerse[], maxChars: number): string[] {
  if (!verses.length) return [];
  const pages: string[] = [];
  let remaining = verses;
  while (remaining.length > 0) {
    const [chunk, rest] = splitVersesByCharLimit(remaining, maxChars);
    if (!chunk.length) {
      pages.push(formatChineseVerseBlock([remaining[0]!]));
      remaining = remaining.slice(1);
      continue;
    }
    pages.push(formatChineseVerseBlock(chunk));
    remaining = rest;
  }
  return pages;
}

function paginateEnglishVerses(verses: BibleVerse[], maxLines: number): string[][] {
  const pages: string[][] = [];
  for (let i = 0; i < verses.length; i += maxLines) {
    pages.push(verses.slice(i, i + maxLines).map(formatEnglishVerseLine));
  }
  return pages;
}

export function buildScriptureSlideBodies(passage: BiblePassage): ScriptureSlideBodies {
  return {
    chinesePages: paginateChineseVerses(passage.zh, SCRIPTURE_ZH_PAGE_MAX_CHARS),
    englishPages: paginateEnglishVerses(passage.en, SCRIPTURE_EN_PAGE_MAX_LINES),
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
