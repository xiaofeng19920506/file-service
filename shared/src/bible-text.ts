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

/**
 * ChiUn 数据里大量「见上节」被存成脚注字母残留 `"a "`。
 * 规范化后若只剩拉丁字母，视为无正文。
 */
export function sanitizeChineseVerseText(raw: string): string {
  const normalized = normalizeChineseText(raw);
  if (!normalized) return '';
  if (/^[a-z]+$/i.test(normalized)) return '';
  return normalized;
}

/**
 * 和合本常把多节并入上一节，后续节为空。若所选起点无正文，
 * 向前并入最近一节有正文的经文，避免出现 `7 a 8 a 9 …`。
 */
export function resolveChineseVerseWindow(
  chapterVerses: readonly { verse: number; text: string }[],
  startVerse: number,
  endVerse: number,
): { start: number; end: number } {
  const byVerse = new Map(chapterVerses.map((v) => [v.verse, v.text]));
  let firstWithText = startVerse;
  while (firstWithText <= endVerse && !(byVerse.get(firstWithText) ?? '')) {
    firstWithText += 1;
  }

  const findPrecedingWithText = (from: number): number | null => {
    for (let v = from; v >= 1; v -= 1) {
      if (byVerse.get(v)) return v;
    }
    return null;
  };

  if (firstWithText > endVerse) {
    const back = findPrecedingWithText(startVerse - 1);
    return { start: back ?? startVerse, end: endVerse };
  }
  if (firstWithText > startVerse) {
    const back = findPrecedingWithText(firstWithText - 1);
    if (back != null) return { start: back, end: endVerse };
  }
  return { start: startVerse, end: endVerse };
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

  const zhSanitized = zhChapter.verses.map((v) => ({
    verse: v.verse,
    text: sanitizeChineseVerseText(v.text),
  }));
  const window = resolveChineseVerseWindow(zhSanitized, parsed.startVerse, parsed.endVerse);

  const zh = zhSanitized
    .filter((v) => v.verse >= window.start && v.verse <= window.end)
    .filter((v) => v.text.length > 0);
  const en = enChapter.verses
    .filter((v) => Number(v.verse) >= parsed.startVerse && Number(v.verse) <= parsed.endVerse)
    .map((v) => ({ verse: Number(v.verse), text: normalizeEnglishText(v.text) }))
    .filter((v) => v.text.length > 0);

  if (!zh.length || !en.length) return null;
  return { zh, en };
}

/** 中文 slide 5：节号 + 经文，节与节之间空格（与模板一致）；跳过无正文节 */
export function formatChineseVerseBlock(verses: BibleVerse[]): string {
  return verses
    .filter((v) => v.text.trim().length > 0)
    .map((v) => `${v.verse} ${v.text}`)
    .join(' ');
}

/** 英文 slide 6：节号 + 经文，节与节之间空格（与中文一致，按行数流式分页） */
export function formatEnglishVerseLine(verse: BibleVerse): string {
  return `${verse.verse} ${verse.text}`;
}

/** 整段英文经文（连续文本，不按节分页） */
export function formatEnglishPassageText(verses: BibleVerse[]): string {
  return verses.map((v) => formatEnglishVerseLine(v)).join(' ');
}

export type ScriptureSlideBodies = {
  /** 中文经文页（slide 5 模板，可继续复制） */
  chinesePages: string[];
  /**
   * 英文经文页（slide 6 模板）。
   * 与中文相同：每页一段连续正文；外层数组为页，内层仅 1 项（兼容旧的 string[][] 形状）。
   */
  englishPages: string[][];
};

/**
 * 中英文共用规则：按文本框视觉行数装箱。
 * 一页装不下 → 自动加页，溢出落到下一页（不缩字号）。
 */

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

/**
 * 英文 22pt 每行约容纳字符数。
 * 文本框内宽约 689pt；过小会导致半页空白就翻页，过大则裁切。
 */
export const SCRIPTURE_EN_CHARS_PER_LINE = 56;

/**
 * 英文每页视觉行数（与中文同一套「容量自适应 → 溢出加页」）。
 * 与中文同为 10–11 行，尽量铺满文本框。
 */
export const SCRIPTURE_EN_PAGE_MIN_VISUAL_LINES = 10;
export const SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES = 11;

/** 英文每页字符数上下限（由行数 × 每行字符数推导） */
export const SCRIPTURE_EN_PAGE_MIN_CHARS =
  SCRIPTURE_EN_PAGE_MIN_VISUAL_LINES * SCRIPTURE_EN_CHARS_PER_LINE;
export const SCRIPTURE_EN_PAGE_MAX_CHARS =
  SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES * SCRIPTURE_EN_CHARS_PER_LINE;

/** @deprecated 分页已改为纯容量自适应，不再按节数封顶 */
export const SCRIPTURE_EN_PAGE_MAX_VERSES = 10;

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

/** 取文本头部，不超过指定视觉行数；英文优先在节号前断页，避免半句起页 */
function takeHeadVisualLines(
  text: string,
  maxVisualLines: number,
  charsPerLine: number,
  estimate: LineEstimate,
  preferVerseBreak = false,
): [string, string] {
  const trimmed = text.trim();
  if (!trimmed) return ['', ''];
  if (estimate(trimmed) <= maxVisualLines) return [trimmed, ''];

  const maxChars = maxVisualLines * charsPerLine;
  let end = Math.min(maxChars, trimmed.length);
  if (end < trimmed.length) {
    if (preferVerseBreak) {
      // 在容量 40%–100% 区间内，尽量落在「 N 」节号之前
      const window = trimmed.slice(0, end);
      let best = -1;
      for (const m of window.matchAll(/(?:^|\s)(\d+)\s+(?=[A-Za-z“"‘'])/g)) {
        const at = m.index! + (m[0].startsWith(' ') || m[0].startsWith('\n') ? 1 : 0);
        if (at >= maxChars * 0.4 && at < end) best = at;
      }
      if (best > 0) end = best;
      else {
        const lastSpace = window.lastIndexOf(' ');
        if (lastSpace > end * 0.35) end = lastSpace;
      }
    } else {
      const lastSpace = trimmed.slice(0, end).lastIndexOf(' ');
      if (lastSpace > end * 0.35) end = lastSpace;
    }
  }

  let head = trimmed.slice(0, end).trim();
  if (!head.length) {
    head = trimmed.slice(0, maxChars);
    return [head, trimmed.slice(maxChars).trim()];
  }

  while (head.length > 0 && estimate(head) > maxVisualLines) {
    end = Math.max(1, Math.floor(end * 0.85));
    if (preferVerseBreak) {
      const window = trimmed.slice(0, end);
      let best = -1;
      for (const m of window.matchAll(/(?:^|\s)(\d+)\s+(?=[A-Za-z“"‘'])/g)) {
        const at = m.index! + (m[0].startsWith(' ') || m[0].startsWith('\n') ? 1 : 0);
        if (at >= maxChars * 0.35 && at < end) best = at;
      }
      if (best > 0) end = best;
    }
    head = trimmed.slice(0, end).trim();
  }

  return [head, trimmed.slice(end).trim()];
}

function splitTextToMaxVisualLines(
  text: string,
  maxLines: number,
  charsPerLine: number,
  estimate: LineEstimate,
  preferVerseBreak = false,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (estimate(trimmed) <= maxLines) return [trimmed];

  const pages: string[] = [];
  let remaining = trimmed;
  while (remaining.length > 0) {
    const [head, tail] = takeHeadVisualLines(
      remaining,
      maxLines,
      charsPerLine,
      estimate,
      preferVerseBreak,
    );
    if (!head.length) break;
    pages.push(head);
    remaining = tail;
  }
  return pages;
}

function fillTextPagesFromNext(
  pages: string[],
  minLines: number,
  maxLines: number,
  maxChars: number,
  charsPerLine: number,
  estimate: LineEstimate,
  preferVerseBreak = false,
): string[] {
  const out = [...pages];

  for (let i = 0; i < out.length - 1; i++) {
    while (estimate(out[i]!) < minLines && i + 1 < out.length) {
      const next = out[i + 1]!;
      const combined = `${out[i]!} ${next}`.trim();
      if (combined.length <= maxChars && estimate(combined) <= maxLines) {
        out[i] = combined;
        out.splice(i + 1, 1);
        continue;
      }

      const roomLines = maxLines - estimate(out[i]!);
      const roomChars = maxChars - out[i]!.length - 1;
      if (roomLines <= 0 || roomChars <= 0) break;

      const [head, tail] = takeHeadVisualLines(
        next,
        roomLines,
        charsPerLine,
        estimate,
        preferVerseBreak,
      );
      if (!head.length) break;

      out[i] = `${out[i]!} ${head}`.trim();
      if (tail.length) out[i + 1] = tail;
      else out.splice(i + 1, 1);
    }
  }

  return out;
}

function paginateTextByVisualLines(
  text: string,
  minLines: number,
  maxLines: number,
  maxChars: number,
  charsPerLine: number,
  estimate: LineEstimate,
  preferVerseBreak = false,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const draft = splitTextToMaxVisualLines(
    trimmed,
    maxLines,
    charsPerLine,
    estimate,
    preferVerseBreak,
  );
  return fillTextPagesFromNext(
    draft,
    minLines,
    maxLines,
    maxChars,
    charsPerLine,
    estimate,
    preferVerseBreak,
  );
}

function paginateChineseVerses(verses: BibleVerse[]): string[] {
  return paginateTextByVisualLines(
    formatChineseVerseBlock(verses),
    SCRIPTURE_ZH_PAGE_MIN_VISUAL_LINES,
    SCRIPTURE_ZH_PAGE_MAX_VISUAL_LINES,
    SCRIPTURE_ZH_PAGE_MAX_CHARS,
    SCRIPTURE_ZH_CHARS_PER_LINE,
    estimateChineseBlockVisualLines,
  );
}

/** 估算一段英文经文在 slide 上占用的视觉行数（与中文同一套行估算） */
export function estimateEnglishLineVisualLines(line: string): number {
  const trimmed = line.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / SCRIPTURE_EN_CHARS_PER_LINE));
}

/**
 * 英文分页：与中文相同——连续正文按视觉行装箱，超出自动加页。
 * 断页优先落在节号前，避免下一页从半句开始、上一页半框空白。
 */
function paginateEnglishVerses(verses: BibleVerse[]): string[][] {
  const pages = paginateTextByVisualLines(
    formatEnglishPassageText(verses),
    SCRIPTURE_EN_PAGE_MIN_VISUAL_LINES,
    SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES,
    SCRIPTURE_EN_PAGE_MAX_CHARS,
    SCRIPTURE_EN_CHARS_PER_LINE,
    estimateEnglishLineVisualLines,
    true,
  );
  return pages.map((page) => [page]);
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
