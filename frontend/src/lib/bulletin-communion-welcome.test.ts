import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  assignSectionsInPresentationOrder,
  buildBulletinDeckPlanFromFile,
  composeDeckSectionsForPreview,
  sectionIdForSlide,
} from './bulletin-deck-plan';
import { buildPreviewMatchingPptx } from './bulletin-preview-pptx';
import { listPptxSlidesInPresentationOrder } from './pptx-preview';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const templatePath = new URL(
  '../../../shared/templates/bulletin/06_14_2026.pptx',
  import.meta.url,
).pathname;

describe('communion vs welcome section assignment', () => {
  it('keeps communion files 10-13 and welcome file 14 distinct when communion visible', async () => {
    const tpl = await readFile(templatePath);
    const file = await buildPreviewMatchingPptx(
      new Blob([tpl], { type: PPTX_MIME }),
      {
        serviceDate: '2026-07-26',
        serviceTime: '11:00',
        scriptureBook: '箴言 Proverbs',
        scriptureReference: '15:12-23',
        hiddenSections: [],
        weeklyMeetingVariant: 28,
        showPreServiceChairName: false,
        preServiceChairNames: '',
      },
      null,
    );
    const order = await listPptxSlidesInPresentationOrder(file);
    const plan = await buildBulletinDeckPlanFromFile(file);
    const composed = composeDeckSectionsForPreview(plan);

    const byFile = (n: number) => order.find((o) => o.slideInFile === n)!;
    expect(sectionIdForSlide(byFile(10).index, plan)).toBe('communion');
    expect(sectionIdForSlide(byFile(11).index, plan)).toBe('communion');
    expect(sectionIdForSlide(byFile(12).index, plan)).toBe('communion');
    expect(sectionIdForSlide(byFile(13).index, plan)).toBe('communion');
    expect(sectionIdForSlide(byFile(14).index, plan)).toBe('welcome');

    const communion = composed.find((s) => s.id === 'communion')!;
    const welcome = composed.find((s) => s.id === 'welcome')!;
    expect(communion.slides).toHaveLength(4);
    expect(welcome.slides).toHaveLength(1);
    expect(communion.slides).not.toContain(byFile(14).index);
    expect(welcome.slides).toEqual([byFile(14).index]);
  });

  it('does not label welcome as communion after scripture expansion', async () => {
    const tpl = await readFile(templatePath);
    const file = await buildPreviewMatchingPptx(
      new Blob([tpl], { type: PPTX_MIME }),
      {
        serviceDate: '2026-07-26',
        serviceTime: '11:00',
        scriptureBook: '诗篇 Psalms',
        scriptureReference: '119:1-40',
        hiddenSections: [],
        weeklyMeetingVariant: 28,
        showPreServiceChairName: false,
        preServiceChairNames: '',
      },
      null,
    );
    const order = await listPptxSlidesInPresentationOrder(file);
    const plan = await buildBulletinDeckPlanFromFile(file);
    const welcomeFile = order.find((o) => o.slideInFile === 14)!;
    expect(sectionIdForSlide(welcomeFile.index, plan)).toBe('welcome');
    const communionFiles = order.filter((o) => [10, 11, 12, 13].includes(o.slideInFile));
    expect(communionFiles.length).toBe(4);
    for (const f of communionFiles) {
      expect(sectionIdForSlide(f.index, plan)).toBe('communion');
    }
  });
});
