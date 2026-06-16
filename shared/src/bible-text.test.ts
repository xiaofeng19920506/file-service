import { describe, expect, it } from 'vitest';
import {
  buildScriptureSlideBodies,
  estimateChineseBlockVisualLines,
  estimateEnglishVerseVisualLines,
  SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES,
  SCRIPTURE_ZH_PAGE_MAX_VISUAL_LINES,
  type BibleVerse,
} from './bible-text.js';

function verse(n: number, text: string): BibleVerse {
  return { verse: n, text };
}

function longText(chars: number): string {
  return '经'.repeat(chars);
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
    expect(bodies.englishPages[0]).toHaveLength(2);
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

  it('keeps each Chinese page within the visual line budget', () => {
    const zh: BibleVerse[] = [];
    for (let n = 1; n <= 15; n++) {
      zh.push(verse(n, `這是第${n}節經文內容用來測試分頁。`));
    }
    const bodies = buildScriptureSlideBodies({
      zh,
      en: [verse(1, 'line one')],
    });
    for (const page of bodies.chinesePages) {
      expect(estimateChineseBlockVisualLines(page)).toBeLessThanOrEqual(
        SCRIPTURE_ZH_PAGE_MAX_VISUAL_LINES,
      );
    }
  });

  it('splits English across multiple pages without truncation', () => {
    const en: BibleVerse[] = [];
    for (let i = 1; i <= SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES * 2 + 3; i++) {
      en.push(verse(i, `verse text ${i}`));
    }
    const bodies = buildScriptureSlideBodies({
      zh: [verse(1, '一節')],
      en,
    });
    expect(bodies.englishPages.length).toBeGreaterThan(2);
    const lineCount = bodies.englishPages.reduce((n, page) => n + page.length, 0);
    expect(lineCount).toBe(en.length);
    expect(bodies.englishPages.flat().join('\n')).not.toContain('…');
  });

  it('splits English when verses wrap to many visual lines', () => {
    const longVerse = 'word '.repeat(90).trim();
    const en = [verse(1, longVerse), verse(2, longVerse), verse(3, longVerse), verse(4, longVerse)];
    const bodies = buildScriptureSlideBodies({
      zh: [verse(1, '一節')],
      en,
    });
    expect(bodies.englishPages.length).toBeGreaterThan(1);
    for (const v of en) {
      expect(bodies.englishPages.flat().join('\n')).toContain(String(v.verse));
    }
  });

  it('keeps each English page within the visual line budget', () => {
    const en: BibleVerse[] = [];
    for (let i = 1; i <= 30; i++) {
      en.push(verse(i, `The Lord is my shepherd, I shall not want, verse number ${i}.`));
    }
    const bodies = buildScriptureSlideBodies({
      zh: [verse(1, '一節')],
      en,
    });
    for (const page of bodies.englishPages) {
      const versesOnPage = page.map((line) => {
        const num = Number.parseInt(line.split(' ')[0] ?? '0', 10);
        return en.find((v) => v.verse === num)!;
      });
      const visualLines = versesOnPage.reduce(
        (sum, v) => sum + estimateEnglishVerseVisualLines(v),
        0,
      );
      expect(visualLines).toBeLessThanOrEqual(SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES);
    }
  });
});
