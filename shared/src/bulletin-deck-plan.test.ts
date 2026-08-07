import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertSectionSlideMapCoversTemplate,
  assignSectionsInPresentationOrder,
  buildBulletinDeckPlanFromPptxBytes,
} from './bulletin-deck-plan.js';
import { BULLETIN_SECTION_TEMPLATE_SLIDES } from './bulletin-section-visibility.js';
import { patchBulletinPreviewInPptx } from './bulletin-pptx-patch.js';
import { listPptxSlidesInPresentationOrder } from './pptx-presentation-order.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = join(root, 'templates/bulletin/06_14_2026.pptx');

/** 正文关键词 → 期望分区（读完全部 38 页后固化） */
const CONTENT_SECTION_BY_FILE: Record<number, string> = {
  1: 'cover',
  2: 'pre_service',
  // 3 omitted
  4: 'scripture',
  5: 'scripture',
  6: 'scripture',
  // 7 omitted (extra worship)
  8: 'worship',
  // 9 omitted (extra worship)
  10: 'communion',
  11: 'communion',
  12: 'communion',
  13: 'communion',
  14: 'welcome',
  15: 'youth_prayer',
  16: 'testimony_week',
  17: 'message',
  18: 'family_time',
  19: 'offering',
  20: 'offering',
  // 21–22 omitted (extra offering)
  // 23 omitted (birthday reminder)
  24: 'birthday',
  25: '_announcement_pool',
  26: '_announcement_pool',
  27: 'baptism',
  28: 'weekly_meetings',
  29: 'weekly_meetings',
  30: 'weekly_meetings',
  31: 'staff_meeting',
  32: 'rotation',
  33: 'future_testimony',
  34: 'service_roster',
  35: 'verse_of_week',
  36: 'department_reports',
  37: 'doxology',
  38: 'benediction',
};

describe('bulletin deck plan from template content', () => {
  it('maps every template file 1-38 except always-omitted slides', () => {
    assertSectionSlideMapCoversTemplate();
    for (const [file, sectionId] of Object.entries(CONTENT_SECTION_BY_FILE)) {
      const n = Number(file);
      const mapped = Object.entries(BULLETIN_SECTION_TEMPLATE_SLIDES).find(([, slides]) =>
        slides.includes(n),
      )?.[0];
      expect(mapped).toBe(sectionId);
    }
  });

  it('splices selected birthday month onto anchor slide 24', async () => {
    const tpl = await readFile(templatePath);
    const july = await patchBulletinPreviewInPptx(tpl, {
      serviceDate: '2026-07-26',
      serviceTime: '11:00',
      birthdayMonth: '7',
      birthdayNames: JSON.stringify({ '7': '甲\n乙' }),
      hiddenSections: [],
      weeklyMeetingVariant: 28,
    });
    const julyPlan = await buildBulletinDeckPlanFromPptxBytes(july);
    const julyBirthday = julyPlan.slides.filter((s) => s.sectionId === 'birthday');
    expect(julyBirthday.map((s) => s.slideInFile)).toEqual([24]);

    const march = await patchBulletinPreviewInPptx(tpl, {
      serviceDate: '2026-07-26',
      serviceTime: '11:00',
      birthdayMonth: '3',
      birthdayNames: JSON.stringify({ '3': '丙', '7': '甲' }),
      hiddenSections: [],
      weeklyMeetingVariant: 28,
    });
    const marchPlan = await buildBulletinDeckPlanFromPptxBytes(march);
    expect(marchPlan.slides.filter((s) => s.sectionId === 'birthday').map((s) => s.slideInFile)).toEqual([
      24,
    ]);

    // 不同月份 splice 后生日页正文应不同（标题含月份）
    const JSZip = (await import('jszip')).default;
    const julyXml = await (await JSZip.loadAsync(july)).file('ppt/slides/slide24.xml')!.async('string');
    const marchXml = await (await JSZip.loadAsync(march)).file('ppt/slides/slide24.xml')!.async('string');
    expect(julyXml).toContain('7月份');
    expect(marchXml).toContain('3月份');
    expect(julyXml).not.toEqual(marchXml);
  });

  it('keeps welcome and youth_prayer between communion and message', async () => {
    const tpl = await readFile(templatePath);
    const patched = await patchBulletinPreviewInPptx(tpl, {
      serviceDate: '2026-07-26',
      serviceTime: '11:00',
      scriptureBook: '诗篇 Psalms',
      scriptureReference: '119:1-40',
      hiddenSections: [],
      weeklyMeetingVariant: 28,
    });
    const plan = await buildBulletinDeckPlanFromPptxBytes(patched);
    const order = await listPptxSlidesInPresentationOrder(patched);

    const byFile = (n: number) => order.find((o) => o.slideInFile === n)!;
    expect(plan.slides.find((s) => s.index === byFile(10).index)?.sectionId).toBe('communion');
    expect(plan.slides.find((s) => s.index === byFile(14).index)?.sectionId).toBe('welcome');
    expect(plan.slides.find((s) => s.index === byFile(15).index)?.sectionId).toBe('youth_prayer');
    expect(plan.slides.find((s) => s.index === byFile(17).index)?.sectionId).toBe('message');

    const ids = plan.sections.map((s) => s.id);
    expect(ids.indexOf('worship')).toBeLessThan(ids.indexOf('communion'));
    expect(ids.indexOf('communion')).toBeLessThan(ids.indexOf('welcome'));
    expect(ids.indexOf('welcome')).toBeLessThan(ids.indexOf('youth_prayer'));
    expect(ids.indexOf('youth_prayer')).toBeLessThan(ids.indexOf('message'));
  });

  it('keeps weekly_meetings after two dynamic announcements', async () => {
    const tpl = await readFile(templatePath);
    const patched = await patchBulletinPreviewInPptx(tpl, {
      serviceDate: '2026-07-26',
      serviceTime: '11:00',
      announcements: [
        { title: '感谢', body: '甲' },
        { title: '喜事', body: '乙' },
      ],
      visibleAnnouncementCount: 2,
      hiddenSections: [],
      weeklyMeetingVariant: null,
    });
    const ids = ['ann-a', 'ann-b'];
    const plan = await buildBulletinDeckPlanFromPptxBytes(patched, ids);
    const weekly = plan.sections.find((s) => s.id === 'weekly_meetings');
    expect(weekly?.slides.length).toBe(1);
    expect(plan.sections.filter((s) => s.id.startsWith('announcement:'))).toHaveLength(2);
    const order = plan.sections.map((s) => s.id);
    expect(order.indexOf('announcement:ann-a')).toBeLessThan(order.indexOf('baptism'));
    expect(order.indexOf('baptism')).toBeLessThan(order.indexOf('weekly_meetings'));
  });

  it('does not merge unknown into previous section', () => {
    const slides = assignSectionsInPresentationOrder([
      { index: 1, slideInFile: 10 },
      { index: 2, slideInFile: 3 }, // omitted
      { index: 3, slideInFile: 14 },
    ]);
    expect(slides.map((s) => s.sectionId)).toEqual(['communion', 'welcome']);
  });
});
