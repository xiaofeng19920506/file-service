import type { WeeklyBulletin } from '../api/bulletins';
import { formatBulletinCoverDate } from './bulletin-date';
import { applySlidesToPptx, parsePptxSlidesDetailed } from './pptx-preview';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** 仅替换指定幻灯片上的文字节点，不触碰图片、背景等 */
export type SlideTextPatch = {
  slideNumber: number;
  texts: string[];
};

export function buildCoverPatch(serviceDate: string, serviceTime: string): SlideTextPatch {
  return {
    slideNumber: 1,
    texts: [formatBulletinCoverDate(serviceDate), serviceTime || '11:00'],
  };
}

/** 当前向导步骤应写入 PPT 的补丁（只含本步字段） */
export function patchesForStep(stepId: string, bulletin: WeeklyBulletin): SlideTextPatch[] {
  switch (stepId) {
    case 'cover':
      if (!bulletin.serviceDate) return [];
      return [buildCoverPatch(bulletin.serviceDate, bulletin.serviceTime)];
    case 'offering': {
      const patches: SlideTextPatch[] = [];
      if (bulletin.lastWeekOfferingDate.trim()) {
        patches.push({ slideNumber: 19, texts: [bulletin.lastWeekOfferingDate] });
      }
      if (bulletin.offeringQuarterLabel.trim()) {
        patches.push({ slideNumber: 22, texts: [bulletin.offeringQuarterLabel] });
      }
      return patches;
    }
    case 'birthday': {
      const lines = [bulletin.birthdayMonth, bulletin.birthdayNames].filter((s) => s.trim());
      return lines.length ? [{ slideNumber: 24, texts: lines }] : [];
    }
    case 'announcements': {
      const announcementSlides = [25, 26, 27];
      return bulletin.announcements.flatMap((item, index) => {
        const slideNum = announcementSlides[index];
        if (!slideNum) return [];
        const lines = [item.title, item.body].filter((s) => s?.trim());
        if (!lines.length) return [];
        return [{ slideNumber: slideNum, texts: lines }];
      });
    }
    case 'verse':
      return bulletin.verseOfWeek.trim()
        ? [{ slideNumber: 35, texts: [bulletin.verseOfWeek] }]
        : [];
    case 'more': {
      const patches: SlideTextPatch[] = [];
      if (bulletin.baptismText.trim()) {
        patches.push({ slideNumber: 27, texts: [bulletin.baptismText] });
      }
      if (bulletin.staffMeetingDate.trim()) {
        patches.push({ slideNumber: 31, texts: [bulletin.staffMeetingDate] });
      }
      if (bulletin.testimonyShareDate.trim()) {
        patches.push({ slideNumber: 33, texts: [bulletin.testimonyShareDate] });
      }
      if (bulletin.serviceRosterText.trim()) {
        patches.push({ slideNumber: 34, texts: [bulletin.serviceRosterText] });
      }
      return patches;
    }
    default:
      return [];
  }
}

/** 导出 PPT 时合并全部已填字段的补丁 */
export function patchesFromBulletin(bulletin: WeeklyBulletin): SlideTextPatch[] {
  const stepIds = ['cover', 'offering', 'birthday', 'announcements', 'verse', 'more'] as const;
  const bySlide = new Map<number, SlideTextPatch>();

  for (const stepId of stepIds) {
    for (const patch of patchesForStep(stepId, bulletin)) {
      bySlide.set(patch.slideNumber, patch);
    }
  }

  return [...bySlide.values()].sort((a, b) => a.slideNumber - b.slideNumber);
}

export async function applySlidePatches(
  templateBlob: Blob,
  patches: SlideTextPatch[],
  filename: string,
): Promise<File> {
  if (!patches.length) {
    const buf = await templateBlob.arrayBuffer();
    return new File([buf], filename, { type: PPTX_MIME });
  }

  const parsed = await parsePptxSlidesDetailed(templateBlob);
  const bySlide = new Map(patches.map((p) => [p.slideNumber, p.texts]));

  const toApply = parsed
    .filter((s) => bySlide.has(s.slideInFile))
    .map((s) => {
      const texts = bySlide.get(s.slideInFile)!;
      return {
        slidePath: s.slidePath,
        title: texts[0] ?? '',
        snippet: texts.slice(1).join('\n'),
      };
    });

  return applySlidesToPptx(templateBlob, toApply, filename);
}
