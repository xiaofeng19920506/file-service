import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { patchBulletinPreviewInPptx } from '../../../shared/src/bulletin-pptx-patch.js';
import { listPptxSlidesInPresentationOrder } from './pptx-preview';

const templatePath = join(import.meta.dirname, '../../../shared/templates/bulletin/06_14_2026.pptx');

describe('listPptxSlidesInPresentationOrder', () => {
  it('places worship after expanded scripture pages in presentation order', async () => {
    const tpl = await readFile(templatePath);
    const patched = await patchBulletinPreviewInPptx(tpl, {
      scriptureBook: '诗篇 Psalms',
      scriptureReference: '119:1-40',
    });
    const file = new File([new Uint8Array(patched)], 'bulletin.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });

    const order = await listPptxSlidesInPresentationOrder(file);
    const worship = order.find((s) => s.slideInFile === 7);
    expect(worship).toBeDefined();
    expect(worship!.index).toBeGreaterThan(7);

    const fileSortedWorshipIndex =
      order
        .slice()
        .sort((a, b) => a.slideInFile - b.slideInFile)
        .findIndex((s) => s.slideInFile === 7) + 1;
    expect(worship!.index).not.toBe(fileSortedWorshipIndex);
  });
});
