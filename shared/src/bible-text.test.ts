import { describe, expect, it } from 'vitest';
import {
  buildScriptureSlideBodies,
  estimateChineseBlockVisualLines,
  estimateEnglishLineVisualLines,
  formatChineseVerseBlock,
  loadScripturePassage,
  resolveChineseVerseWindow,
  sanitizeChineseVerseText,
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
    expect(bodies.englishPages[0]!.join(' ')).toContain('gentle answer');
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
    const firstPageLines = englishPageVisualLines(bodies.englishPages[0]!);
    expect(firstPageLines).toBeLessThanOrEqual(SCRIPTURE_EN_PAGE_MAX_VISUAL_LINES);
  });

  it('auto-paginates english overflow like chinese (proverbs 15:1-11)', async () => {
    const passage = await loadScripturePassage('箴言 Proverbs', '15:1-11');
    expect(passage).not.toBeNull();
    expect(passage!.en.length).toBe(11);
    const bodies = buildScriptureSlideBodies(passage!);
    expect(bodies.englishPages.length).toBeGreaterThanOrEqual(2);
    expect(bodies.chinesePages.length).toBeGreaterThanOrEqual(1);

    bodies.englishPages.forEach((page, i) => {
      expect(page).toHaveLength(1);
      assertEnglishPageInRange(page, i === bodies.englishPages.length - 1);
    });

    const allJoined = bodies.englishPages.flat().join(' ');
    for (const v of passage!.en) {
      expect(allJoined).toContain(`${v.verse} `);
    }
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
    expect(bodies.englishPages.length).toBeGreaterThanOrEqual(4);
    const joined = bodies.englishPages.flat().join(' ');
    for (const v of en) {
      expect(joined).toContain(String(v.verse));
    }
    expect(joined).not.toContain('…');
    bodies.englishPages.forEach((page, i) => {
      expect(page).toHaveLength(1);
      assertEnglishPageInRange(page, i === bodies.englishPages.length - 1);
    });
  });

  it('keeps english visual lines within capacity on every page', () => {
    const en: BibleVerse[] = [];
    for (let i = 1; i <= 30; i++) {
      en.push(verse(i, `Short verse number ${i}.`));
    }
    const bodies = buildScriptureSlideBodies({
      zh: [verse(1, '一節')],
      en,
    });
    expect(bodies.englishPages.length).toBeGreaterThanOrEqual(2);
    bodies.englishPages.forEach((page, i) => {
      assertEnglishPageInRange(page, i === bodies.englishPages.length - 1);
    });
  });

  it('keeps short English passages on one page', async () => {
    const passage = await loadScripturePassage('箴言 Proverbs', '15:1-2');
    expect(passage).not.toBeNull();
    const bodies = buildScriptureSlideBodies(passage!);
    expect(bodies.englishPages.length).toBe(1);
    expect(bodies.englishPages[0]).toHaveLength(1);
    expect(bodies.englishPages[0]![0]).toMatch(/^1 /);
    expect(bodies.englishPages[0]![0]).toContain('2 ');
  });

  it('splits a single long English verse across pages', () => {
    const longVerse = 'word '.repeat(220).trim();
    const bodies = buildScriptureSlideBodies({
      zh: [verse(1, '一節')],
      en: [verse(1, longVerse)],
    });
    expect(bodies.englishPages.length).toBeGreaterThan(1);
    expect(bodies.englishPages.flat().join(' ')).toContain('word');
    expect(bodies.englishPages[0]![0]).toMatch(/^1 /);
  });
});

describe('sanitizeChineseVerseText / footnote residue', () => {
  it('strips ChiUn footnote letter leftovers', () => {
    expect(sanitizeChineseVerseText('a ')).toBe('');
    expect(sanitizeChineseVerseText('a   ')).toBe('');
    expect(sanitizeChineseVerseText('耶和華─我們的主啊')).toContain('耶和華');
  });

  it('expands empty leading verses back to the parent verse', () => {
    const chapter = [
      { verse: 6, text: '你派他管理你手所造的' },
      { verse: 7, text: '' },
      { verse: 8, text: '' },
      { verse: 9, text: '耶和華我們的主啊' },
    ];
    expect(resolveChineseVerseWindow(chapter, 7, 9)).toEqual({ start: 6, end: 9 });
    expect(resolveChineseVerseWindow(chapter, 9, 9)).toEqual({ start: 9, end: 9 });
  });

  it('formatChineseVerseBlock skips empty verses and never emits lone a', () => {
    const block = formatChineseVerseBlock([
      verse(7, ''),
      verse(8, ''),
      verse(9, '耶和華我們的主啊你的名在全地何其美'),
    ]);
    expect(block).not.toMatch(/\ba\b/);
    expect(block).toBe('9 耶和華我們的主啊你的名在全地何其美');
  });
});

describe('loadScripturePassage real ChiUn data', () => {
  it('Psalm 8:7-9 does not show footnote a and includes verse 6 content', async () => {
    const passage = await loadScripturePassage('诗篇 Psalms', '8:7-9');
    expect(passage).not.toBeNull();
    const block = formatChineseVerseBlock(passage!.zh);
    expect(block).not.toMatch(/\ba\b/);
    expect(block).toContain('牛羊');
    expect(block).toContain('耶和華');
    expect(passage!.zh.some((v) => v.verse === 6)).toBe(true);
    expect(passage!.zh.some((v) => v.verse === 9)).toBe(true);
    const bodies = buildScriptureSlideBodies(passage!);
    expect(bodies.chinesePages.join('')).not.toMatch(/\ba\b/);
  });

  it('Psalm 8:9 alone stays on verse 9', async () => {
    const passage = await loadScripturePassage('诗篇 Psalms', '8:9');
    expect(passage).not.toBeNull();
    expect(passage!.zh.map((v) => v.verse)).toEqual([9]);
    expect(formatChineseVerseBlock(passage!.zh)).toContain('何其美');
  });

  it('does not emit footnote a across sampled books', async () => {
    const samples: Array<[string, string]> = [
      ['诗篇 Psalms', '8:6-9'],
      ['诗篇 Psalms', '49:8-10'],
      ['民数记 Numbers', '1:20-22'],
      ['箴言 Proverbs', '15:1-5'],
      ['约翰福音 John', '3:16-17'],
    ];
    for (const [book, ref] of samples) {
      const passage = await loadScripturePassage(book, ref);
      expect(passage, `${book} ${ref}`).not.toBeNull();
      const zh = formatChineseVerseBlock(passage!.zh);
      expect(zh, `${book} ${ref}`).not.toMatch(/\ba\b/);
      expect(zh.length, `${book} ${ref}`).toBeGreaterThan(0);
    }
  });
});
