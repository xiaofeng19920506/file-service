import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { patchBulletinPreviewInPptx } from '../../../shared/src/bulletin-pptx-patch.js';
import { resolveScriptureSlideBodies } from '../../../shared/src/bible-text.js';
import { buildBulletinDeckPlanFromFile, composeDeckSectionsForPreview, assignSectionsInPresentationOrder, firstSlideForSection, sectionIdForSlide } from './bulletin-deck-plan';
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
    const doxologyFirst = firstSlideForSection('doxology', plan);
    const benedictionFirst = firstSlideForSection('benediction', plan);

    expect(worshipFirst).toBe(order.find((s) => s.slideInFile === 7)?.index);
    expect(worshipFirst).toBeGreaterThan(6);
    expect(communionFirst).toBe(order.find((s) => s.slideInFile === 10)?.index);
    expect(communionFirst).toBeGreaterThan(worshipFirst!);
    expect(doxologyFirst).toBe(order.find((s) => s.slideInFile === 37)?.index);
    expect(benedictionFirst).toBe(order.find((s) => s.slideInFile === 38)?.index);

    expect(sectionIdForSlide(worshipFirst!, plan)).toBe('worship');
    expect(sectionIdForSlide(communionFirst!, plan)).toBe('communion');
    expect(sectionIdForSlide(doxologyFirst!, plan)).toBe('doxology');
    expect(sectionIdForSlide(benedictionFirst!, plan)).toBe('benediction');
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

  it('composes preview as discrete template sections (cover ≠ pre_service ≠ scripture)', async () => {
    const file = await patchedPreviewFile('119:1-8');
    const plan = await buildBulletinDeckPlanFromFile(file);
    const composed = composeDeckSectionsForPreview(plan);

    expect(composed[0]?.id).toBe('cover');
    expect(composed[0]?.slides).toEqual([1]);
    expect(composed[1]?.id).toBe('pre_service');
    expect(composed[1]?.slides).toEqual([2]);
    expect(composed.find((s) => s.id === 'scripture')?.slides[0]).toBe(3);

    const coverStep = plan.wizardSteps.find((w) => w.stepId === 'cover');
    expect(coverStep?.slides).toEqual([1]);

    const ids = composed.map((s) => s.id);
    expect(ids.indexOf('cover')).toBeLessThan(ids.indexOf('pre_service'));
    expect(ids.indexOf('pre_service')).toBeLessThan(ids.indexOf('scripture'));
    expect(ids.indexOf('worship')).toBeLessThan(ids.indexOf('communion'));

    const pre = composed.find((s) => s.id === 'pre_service')!;
    const scripture = composed.find((s) => s.id === 'scripture')!;
    expect(pre.slides).toHaveLength(1);
    expect(scripture.slides.length).toBeGreaterThanOrEqual(3);
    for (const slide of pre.slides) {
      expect(scripture.slides).not.toContain(slide);
    }
    expect(sectionIdForSlide(2, plan)).toBe('pre_service');
    expect(sectionIdForSlide(3, plan)).toBe('scripture');
  });

  it('keeps expanded pages inside their section via presentation-order anchors', () => {
    const slides = assignSectionsInPresentationOrder([
      { index: 1, slideInFile: 1 },
      { index: 2, slideInFile: 2 },
      { index: 3, slideInFile: 4 },
      { index: 4, slideInFile: 5 },
      { index: 5, slideInFile: 39 },
      { index: 6, slideInFile: 40 },
      { index: 7, slideInFile: 6 },
      { index: 8, slideInFile: 7 },
    ]);
    expect(slides.filter((s) => s.sectionId === 'pre_service').map((s) => s.index)).toEqual([2]);
    expect(slides.filter((s) => s.sectionId === 'scripture').map((s) => s.index)).toEqual([
      3, 4, 5, 6, 7,
    ]);
    expect(slides.find((s) => s.index === 8)?.sectionId).toBe('worship');
  });

  it('never assigns omitted template slide 3 to pre_service or scripture', () => {
    const slides = assignSectionsInPresentationOrder([
      { index: 1, slideInFile: 1 },
      { index: 2, slideInFile: 2 },
      { index: 3, slideInFile: 3 },
      { index: 4, slideInFile: 4 },
      { index: 5, slideInFile: 5 },
      { index: 6, slideInFile: 6 },
    ]);
    expect(slides.map((s) => s.slideInFile)).not.toContain(3);
    expect(slides.filter((s) => s.sectionId === 'pre_service')).toEqual([
      { index: 2, slideInFile: 2, sectionId: 'pre_service' },
    ]);
    expect(slides.filter((s) => s.sectionId === 'scripture').map((s) => s.slideInFile)).toEqual([
      4, 5, 6,
    ]);
  });
});

  it('does not put welcome under worship when communion is hidden', async () => {
    const tpl = await readFile(templatePath);
    const { buildPreviewMatchingPptx } = await import('./bulletin-preview-pptx');
    const file = await buildPreviewMatchingPptx(
      new Blob([tpl], { type: PPTX_MIME }),
      {
        serviceDate: '2026-07-26',
        serviceTime: '11:00',
        scriptureBook: '箴言 Proverbs',
        scriptureReference: '15:12-23',
        hiddenSections: ['communion'],
        weeklyMeetingVariant: 28,
      },
      null,
    );
    const plan = await buildBulletinDeckPlanFromFile(file);
    const worship = plan.sections.find((s) => s.id === 'worship');
    const welcome = plan.sections.find((s) => s.id === 'welcome');
    const order = await listPptxSlidesInPresentationOrder(file);
    const welcomeFile = order.find((s) => s.slideInFile === 14);
    expect(welcomeFile).toBeDefined();
    expect(sectionIdForSlide(welcomeFile!.index, plan)).toBe('welcome');
    expect(worship?.slides ?? []).not.toContain(welcomeFile!.index);
    expect(order.some((s) => [10, 11, 12, 13].includes(s.slideInFile))).toBe(false);
  });

  it('worship section only contains template slides 7-9 even with long scripture', async () => {
    const file = await patchedPreviewFile('119:1-40');
    const plan = await buildBulletinDeckPlanFromFile(file);
    const order = await listPptxSlidesInPresentationOrder(file);
    const worship = plan.sections.find((s) => s.id === 'worship')!;
    const welcome = plan.sections.find((s) => s.id === 'welcome')!;
    const worshipFiles = worship.slides.map((i) => order.find((o) => o.index === i)!.slideInFile);
    const welcomeFiles = welcome.slides.map((i) => order.find((o) => o.index === i)!.slideInFile);
    expect(worshipFiles).toEqual([7, 8, 9]);
    expect(welcomeFiles).toEqual([14]);
    expect(worship.slides).toHaveLength(3);
  });
