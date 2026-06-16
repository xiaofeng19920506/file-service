import { describe, expect, it } from 'vitest';
import {
  buildScriptureSlideBodies,
  estimateChineseBlockVisualLines,
  estimateEnglishLineVisualLines,
  loadScripturePassage,
  SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES,
  SCRIPTURE_EN_PAGE_MIN_VISUAL_LINES,
  SCRIPTURE_ZH_PAGE_MAX_VISUAL_LINES,
  SCRIPTURE_ZH_PAGE_MIN_CHARS,
  SCRIPTURE_ZH_PAGE_MIN_VISUAL_LINES,
  type BibleVerse,
} from './bible-text.js';

function verse(n: number, text: string): BibleVerse {
  return { verse: n, text };
}

function longText(chars: number): string {
  return '经'.repeat(chars);
}

function englishPageVisualLines(page: string[]): number {
  return page.reduce((sum, line) => sum + estimateEnglishLineVisualLines(line), 0);
}

function assertChinesePageInRange(page: string, isLastPage: boolean) {
  const lines = estimateChineseBlockVisualLines(page);
  expect(lines).toBeLessThanOrEqual(SCRIPTURE_ZH_PAGE_MAX_VISUAL_LINES);
  if (!isLastPage) {
    expect(lines).toBeGreaterThanOrEqual(SCRIPTURE_ZH_PAGE_MIN_VISUAL_LINES);
  }
}

function assertEnglishPageInRange(page: string[], isLastPage: boolean) {
  const lines = englishPageVisualLines(page);
  expect(lines).toBeLessThanOrEqual(SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES);
  if (!isLastPage) {
    expect(lines).toBeGreaterThanOrEqual(SCRIPTURE_EN_PAGE_MIN_VISUAL_LINES);
  }
}

describe('buildScriptureSlideBodies', () => {
  it('keeps short passages on one page each', () => {
    const bodies = buildScriptureSlideBodies({
      zh: [verse(1, '回答柔和'), verse(2, '舌藏刀殺人')],
      en: [verse(1, 'gentle answer'), verse(2, 'tongue of the wise')],
    });
    expect(bodies.chinesePages).toHaveLength(1);
    expect(bodies.englishPages).toHaveLength(1);
    expect(bodies.chinesePages[0]).toContain('回答柔和');
    expect(bodies.englishPages[0]![0]).toContain('gentle answer');
  });

  it('splits Chinese across multiple pages without truncation', () => {
    const zh: BibleVerse[] = [];
    for (let n = 1; n <= 20; n++) {
      zh.push(verse(n, longText(30)));
    }
    const bodies = buildScriptureSlideBodies({
      zh,
      en: [verse(1, 'line one')],
    });
    expect(bodies.chinesePages.length).toBeGreaterThan(2);
    const joined = bodies.chinesePages.join('');
    for (const v of zh) {
      expect(joined).toContain(String(v.verse));
    }
    expect(joined).not.toContain('…');
  });

  it('keeps Chinese pages between 10 and 11 lines except the last', () => {
    const zh: BibleVerse[] = [];
    for (let n = 1; n <= 15; n++) {
      zh.push(verse(n, `這是第${n}節經文內容用來測試分頁。`));
    }
    const bodies = buildScriptureSlideBodies({
      zh,
      en: [verse(1, 'line one')],
    });
    bodies.chinesePages.forEach((page, i) => {
      assertChinesePageInRange(page, i === bodies.chinesePages.length - 1);
    });
  });

  it('fills proverbs 15:1-11 chinese to at least 10 lines on non-final pages', async () => {
    const passage = await loadScripturePassage('箴言 Proverbs', '15:1-11');
    expect(passage).not.toBeNull();
    const bodies = buildScriptureSlideBodies(passage!);
    expect(bodies.chinesePages.length).toBeGreaterThanOrEqual(1);
    bodies.chinesePages.forEach((page, i) => {
      const lines = estimateChineseBlockVisualLines(page);
      expect(lines).toBeLessThanOrEqual(SCRIPTURE_ZH_PAGE_MAX_VISUAL_LINES);
      if (i < bodies.chinesePages.length - 1) {
        expect(lines).toBeGreaterThanOrEqual(SCRIPTURE_ZH_PAGE_MIN_VISUAL_LINES);
        expect(page.length).toBeGreaterThanOrEqual(SCRIPTURE_ZH_PAGE_MIN_CHARS - 4);
      }
    });
  });

  it('splits mid-verse when a page runs out of lines', () => {
    const bodies = buildScriptureSlideBodies({
      zh: [verse(1, longText(400))],
      en: [verse(1, 'word '.repeat(220).trim())],
    });
    expect(bodies.chinesePages.length).toBeGreaterThan(1);
    expect(bodies.englishPages.length).toBeGreaterThan(1);
    const enJoined = bodies.englishPages.flat().join(' ');
    expect(enJoined).toMatch(/^1 word/);
    expect(enJoined).toContain('word');
    const firstPageLines = estimateEnglishLineVisualLines(bodies.englishPages[0]![0]!);
    expect(firstPageLines).toBeLessThanOrEqual(SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES);
  });

  it('fills proverbs 15:1-11 english to 13-14 lines when content allows', async () => {
    const passage = await loadScripturePassage('箴言 Proverbs', '15:1-11');
    expect(passage).not.toBeNull();
    const bodies = buildScriptureSlideBodies(passage!);
    expect(bodies.englishPages.length).toBeGreaterThanOrEqual(1);
    const lines = englishPageVisualLines(bodies.englishPages[0]!);
    expect(lines).toBeGreaterThanOrEqual(SCRIPTURE_EN_PAGE_MIN_VISUAL_LINES);
    expect(lines).toBeLessThanOrEqual(SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES);
    bodies.englishPages.forEach((page, i) => {
      assertEnglishPageInRange(page, i === bodies.englishPages.length - 1);
    });
  });

  it('splits English across multiple pages without truncation', () => {
    const en: BibleVerse[] = [];
    for (let i = 1; i <= 40; i++) {
      en.push(
        verse(
          i,
          `The Lord is my shepherd, I shall not want, verse number ${i} with extra words for flow pagination.`,
        ),
      );
    }
    const bodies = buildScriptureSlideBodies({
      zh: [verse(1, '一節')],
      en,
    });
    expect(bodies.englishPages.length).toBeGreaterThan(2);
    const joined = bodies.englishPages.flat().join(' ');
    for (const v of en) {
      expect(joined).toContain(String(v.verse));
    }
    expect(joined).not.toContain('…');
  });

  it('keeps English pages between 13 and 14 lines except the last', () => {
    const en: BibleVerse[] = [];
    for (let i = 1; i <= 30; i++) {
      en.push(
        verse(
          i,
          `The Lord is my shepherd, I shall not want, verse number ${i} with extra words.`,
        ),
      );
    }
    const bodies = buildScriptureSlideBodies({
      zh: [verse(1, '一節')],
      en,
    });
    bodies.englishPages.forEach((page, i) => {
      assertEnglishPageInRange(page, i === bodies.englishPages.length - 1);
    });
  });

  it('splits a single long English verse across pages', () => {
    const longVerse = 'word '.repeat(220).trim();
    const bodies = buildScriptureSlideBodies({
      zh: [verse(1, '一節')],
      en: [verse(1, longVerse)],
    });
    expect(bodies.englishPages.length).toBeGreaterThan(1);
    expect(bodies.englishPages.flat().join(' ')).toContain('word');
  });
});
