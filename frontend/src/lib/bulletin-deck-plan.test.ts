import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { patchBulletinPreviewInPptx } from '../../../shared/src/bulletin-pptx-patch.js';
import { resolveScriptureSlideBodies } from '../../../shared/src/bible-text.js';
import { buildBulletinDeckPlanFromFile, firstSlideForSection, sectionIdForSlide } from './bulletin-deck-plan';
import { buildPreviewMatchingPptx } from './bulletin-preview-pptx';
import { listPptxSlidesInPresentationOrder } from './pptx-preview';

const templatePath = join(import.meta.dirname, '../../../shared/templates/bulletin/06_14_2026.pptx');

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

async function patchedPreviewFile(scriptureReference: string) {
  const tpl = await readFile(templatePath);
  const patched = await patchBulletinPreviewInPptx(tpl, {
    scriptureBook: '诗篇 Psalms',
    scriptureReference,
  });
  return new File([new Uint8Array(patched)], 'bulletin.pptx', { type: PPTX_MIME });
}

describe('bulletin deck plan', () => {
  it('places worship after expanded scripture pages in presentation order', async () => {
    const file = await patchedPreviewFile('119:1-40');
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

  it('maps worship wizard step to the first worship presentation slide', async () => {
    const file = await patchedPreviewFile('119:1-40');
    const plan = await buildBulletinDeckPlanFromFile(file);
    const worship = plan.wizardSteps.find((w) => w.stepId === 'worship');
    const order = await listPptxSlidesInPresentationOrder(file);
    const worshipPresentation = order.find((s) => s.slideInFile === 7);

    expect(worshipPresentation).toBeDefined();
    expect(worship?.slides[0]).toBe(worshipPresentation!.index);
    expect(worship!.slides[0]).toBeGreaterThan(6);
  });

  it('buildPreviewMatchingPptx matches API patch presentation order for worship', async () => {
    const tpl = await readFile(templatePath);
    const tplBlob = new Blob([tpl], { type: PPTX_MIME });
    const bodies = await resolveScriptureSlideBodies('诗篇 Psalms', '119:1-40');
    expect(bodies).not.toBeNull();

    const browserFile = await buildPreviewMatchingPptx(
      tplBlob,
      {
        serviceDate: '',
        serviceTime: '11:00',
        scriptureBook: '诗篇 Psalms',
        scriptureReference: '119:1-40',
      },
      bodies,
    );
    const apiFile = await patchedPreviewFile('119:1-40');

    const browserOrder = await listPptxSlidesInPresentationOrder(browserFile);
    const apiOrder = await listPptxSlidesInPresentationOrder(apiFile);
    const browserWorship = browserOrder.find((s) => s.slideInFile === 7);
    const apiWorship = apiOrder.find((s) => s.slideInFile === 7);

    expect(browserWorship?.index).toBe(apiWorship?.index);
    expect(browserOrder.length).toBe(apiOrder.length);
  });

  it('resolves section first slides so communion is not mistaken for worship', async () => {
    const file = await patchedPreviewFile('119:1-40');
    const plan = await buildBulletinDeckPlanFromFile(file);
    const order = await listPptxSlidesInPresentationOrder(file);

    const worshipFirst = firstSlideForSection('worship', plan);
    const communionFirst = firstSlideForSection('communion', plan);
    const closingFirst = firstSlideForSection('closing', plan);

    expect(worshipFirst).toBe(order.find((s) => s.slideInFile === 7)?.index);
    expect(worshipFirst).toBeGreaterThan(6);
    expect(communionFirst).toBe(order.find((s) => s.slideInFile === 10)?.index);
    expect(communionFirst).toBeGreaterThan(worshipFirst!);
    expect(closingFirst).toBe(order.find((s) => s.slideInFile === 37)?.index);

    expect(sectionIdForSlide(worshipFirst!, plan)).toBe('worship');
    expect(sectionIdForSlide(communionFirst!, plan)).toBe('communion');
    expect(sectionIdForSlide(closingFirst!, plan)).toBe('closing');
  });

  it('maps every scripture presentation slide including expanded pages', async () => {
    const file = await patchedPreviewFile('119:1-40');
    const plan = await buildBulletinDeckPlanFromFile(file);
    const scriptureSlides = plan.sections.find((s) => s.id === 'scripture')?.slides ?? [];
    expect(scriptureSlides.length).toBeGreaterThan(3);
    for (const slide of scriptureSlides) {
      expect(sectionIdForSlide(slide, plan)).toBe('scripture');
    }
  });
});
