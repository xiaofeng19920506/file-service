import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listPptxSlidesInPresentationOrder } from './pptx-presentation-order.js';
import { patchBulletinPreviewInPptx } from './bulletin-pptx-patch.js';
import { repackPptxInPresentationOrder } from './pptx-repack-presentation-order.js';

const templatePath = new URL('../templates/bulletin/06_14_2026.pptx', import.meta.url);

describe('repackPptxInPresentationOrder', () => {
  it('makes slideInFile match presentation index after scripture expansion', async () => {
    const template = readFileSync(templatePath);
    const patched = await patchBulletinPreviewInPptx(template, {
      serviceDate: '2026-07-26',
      serviceTime: '11:00',
      scriptureBook: '诗篇 Psalms',
      scriptureReference: '1:1-6',
    });
    const before = await listPptxSlidesInPresentationOrder(patched);
    expect(before.some((s) => s.index !== s.slideInFile)).toBe(true);

    const repacked = await repackPptxInPresentationOrder(patched);
    const after = await listPptxSlidesInPresentationOrder(repacked);
    expect(after.length).toBe(before.length);
    expect(after.every((s, i) => s.index === i + 1 && s.slideInFile === i + 1)).toBe(true);
  });
});
