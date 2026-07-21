import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { patchBulletinPreviewInPptx } from './bulletin-pptx-patch.js';
import { listPptxSlidesInPresentationOrder } from './pptx-presentation-order.js';
import { extractPresentationSlideAsPptx } from './pptx-extract-slide.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = join(root, 'templates/bulletin/06_14_2026.pptx');

function slideText(xml: string): string {
  return [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
    .map((m) => m[1].replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
}

describe('extractPresentationSlideAsPptx', () => {
  it('extracts communion (F10) by presentation index even after scripture expansion', async () => {
    const tpl = await readFile(templatePath);
    const patched = await patchBulletinPreviewInPptx(tpl, {
      serviceDate: '2026-07-26',
      serviceTime: '11:00',
      scriptureBook: '诗篇 Psalms',
      scriptureReference: '119:1-40',
      hiddenSections: [],
      weeklyMeetingVariant: 28,
    });
    const order = await listPptxSlidesInPresentationOrder(patched);
    const communion = order.find((o) => o.slideInFile === 10)!;
    const message = order.find((o) => o.slideInFile === 17)!;
    expect(communion.index).toBeGreaterThan(9);
    expect(message.index).toBeGreaterThan(communion.index);

    const mini = await extractPresentationSlideAsPptx(patched, communion.index);
    const miniOrder = await listPptxSlidesInPresentationOrder(mini);
    expect(miniOrder).toHaveLength(1);
    expect(miniOrder[0]!.slideInFile).toBe(10);

    const zip = await JSZip.loadAsync(mini);
    const text = slideText(await zip.file(miniOrder[0]!.slidePath)!.async('string'));
    expect(text).toContain('聖餐');
    expect(text).not.toContain('主日信息');
  });
});
