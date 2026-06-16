import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { englishBookNameFromLabel, nivBookFileName } from './bible-book-id.js';
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
    readBookJson(join(dataRoot, 'zh-chiun'), englishBook),
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
  slide5Chinese: string;
  slide6Chinese: string | null;
  slide6English: string[] | null;
};

/** 第 5 页放不下的中文续到第 6 页；第 6 页无中文溢出时显示英文 */
export const SCRIPTURE_SLIDE5_ZH_MAX_CHARS = 260;
export const SCRIPTURE_SLIDE6_ZH_MAX_CHARS = 260;
export const SCRIPTURE_SLIDE6_EN_MAX_LINES = 14;

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

export function buildScriptureSlideBodies(passage: BiblePassage): ScriptureSlideBodies {
  const [slide5ZhVerses, slide6ZhRemainder] = splitVersesByCharLimit(
    passage.zh,
    SCRIPTURE_SLIDE5_ZH_MAX_CHARS,
  );

  let slide6Chinese: string | null = null;
  let slide6English: string[] | null = null;

  if (slide6ZhRemainder.length) {
    const [chunk, overflow] = splitVersesByCharLimit(slide6ZhRemainder, SCRIPTURE_SLIDE6_ZH_MAX_CHARS);
    slide6Chinese = formatChineseVerseBlock(chunk);
    if (overflow.length) {
      slide6Chinese += ` …${overflow[0].verse}节起`;
    }
  } else {
    slide6English = passage.en
      .slice(0, SCRIPTURE_SLIDE6_EN_MAX_LINES)
      .map(formatEnglishVerseLine);
    if (passage.en.length > SCRIPTURE_SLIDE6_EN_MAX_LINES) {
      const last = slide6English[slide6English.length - 1];
      slide6English[slide6English.length - 1] = `${last} …`;
    }
  }

  return {
    slide5Chinese: formatChineseVerseBlock(slide5ZhVerses),
    slide6Chinese,
    slide6English,
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
