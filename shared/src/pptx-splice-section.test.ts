import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { extractSlidesByFileNumbersAsPptx } from './pptx-extract-slide.js';
import { listPptxSlidesInPresentationOrder } from './pptx-presentation-order.js';
import { spliceSectionSlidesIntoPptx } from './pptx-splice-section.js';
import { duplicateSlideInZip } from './pptx-duplicate-slide.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = join(root, 'templates/bulletin/06_14_2026.pptx');

describe('spliceSectionSlidesIntoPptx variable length', () => {
  it('inserts extra mini pages after the section anchor', async () => {
    const tpl = await readFile(templatePath);
    const before = await listPptxSlidesInPresentationOrder(tpl);
    const beforeCount = before.length;

    // announcements = template slides 25,26,27
    const mini = await extractSlidesByFileNumbersAsPptx(tpl, [25, 26, 27]);
    const miniZip = await JSZip.loadAsync(mini);
    const miniOrder = await listPptxSlidesInPresentationOrder(mini);
    expect(miniOrder).toHaveLength(3);

    // duplicate last mini page → 4-page section override
    const lastMini = miniOrder[2]!.slidePath;
    await duplicateSlideInZip(miniZip, lastMini, { insertAfterPath: lastMini });
    const longerMini = await miniZip.generateAsync({ type: 'nodebuffer' });
    expect(await listPptxSlidesInPresentationOrder(longerMini)).toHaveLength(4);

    const spliced = await spliceSectionSlidesIntoPptx(tpl, longerMini, [25, 26, 27]);
    const after = await listPptxSlidesInPresentationOrder(spliced);
    expect(after.length).toBe(beforeCount + 1);

    // new page should sit right after original slide 27 in presentation order
    const idx27 = after.findIndex((s) => s.slideInFile === 27);
    expect(idx27).toBeGreaterThanOrEqual(0);
    expect(after[idx27 + 1]?.slideInFile).toBeGreaterThan(38);
  });

  it('removes surplus anchor pages when mini is shorter', async () => {
    const tpl = await readFile(templatePath);
    const before = await listPptxSlidesInPresentationOrder(tpl);
    const mini = await extractSlidesByFileNumbersAsPptx(tpl, [25, 26]); // only 2 of 3
    expect(await listPptxSlidesInPresentationOrder(mini)).toHaveLength(2);

    const spliced = await spliceSectionSlidesIntoPptx(tpl, mini, [25, 26, 27]);
    const after = await listPptxSlidesInPresentationOrder(spliced);
    expect(after.length).toBe(before.length - 1);
    expect(after.some((s) => s.slideInFile === 27)).toBe(false);
    expect(after.some((s) => s.slideInFile === 25)).toBe(true);
    expect(after.some((s) => s.slideInFile === 26)).toBe(true);
  });
});
