import { describe, expect, it } from 'vitest';
import {
  buildScriptureSlideBodies,
  SCRIPTURE_EN_PAGE_MAX_LINES,
  SCRIPTURE_ZH_PAGE_MAX_CHARS,
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
    let n = 1;
    while (zh.reduce((sum, v) => sum + `${v.verse} ${v.text}`.length + 1, 0) < SCRIPTURE_ZH_PAGE_MAX_CHARS * 2.5) {
      zh.push(verse(n++, longText(40)));
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

  it('splits English across multiple pages without truncation', () => {
    const en: BibleVerse[] = [];
    for (let i = 1; i <= SCRIPTURE_EN_PAGE_MAX_LINES * 2 + 3; i++) {
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
});
