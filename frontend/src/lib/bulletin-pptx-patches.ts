import type { WeeklyBulletin } from '../api/bulletins';
import { formatBulletinCoverDate } from './bulletin-date';
import {
  applyIndexedTextReplacementsToSlideXml,
  parsePptxSlidesDetailed,
} from './pptx-preview';
import JSZip from 'jszip';

/** 原版模板文件名（`06_14_2026.pptx`，背景与图片均以此为准） */
export const BULLETIN_TEMPLATE_FILENAME = '06_14_2026.pptx';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export type SlideTextReplacement = {
  /** 幻灯片内非空文字 run 的 0-based 序号（对应原版 `06_14_2026.pptx`） */
  textIndex: number;
  text: string;
};

/** 仅替换指定幻灯片上列出的文字 run，不触碰图片、背景等 */
export type SlideTextPatch = {
  slideNumber: number;
  replacements: SlideTextReplacement[];
};

export function buildCoverPatch(serviceDate: string, serviceTime: string): SlideTextPatch {
  return {
    slideNumber: 1,
    replacements: [
      { textIndex: 8, text: formatBulletinCoverDate(serviceDate) },
      { textIndex: 9, text: serviceTime || '11:00' },
    ],
  };
}

function splitNameLines(names: string, max = 3): string[] {
  return names
    .split(/[\n,，、]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
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
        patches.push({
          slideNumber: 19,
          replacements: [{ textIndex: 6, text: bulletin.lastWeekOfferingDate.trim() }],
        });
      }
      return patches;
    }
    case 'birthday': {
      const patches: SlideTextPatch[] = [];
      if (bulletin.birthdayMonth.trim()) {
        patches.push({
          slideNumber: 24,
          replacements: [{ textIndex: 1, text: bulletin.birthdayMonth.trim() }],
        });
      }
      const nameLines = splitNameLines(bulletin.birthdayNames);
      if (nameLines.length) {
        const replacements = nameLines.map((text, i) => ({ textIndex: 3 + i, text }));
        patches.push({ slideNumber: 24, replacements });
      }
      return patches;
    }
    case 'announcements': {
      const announcementSlides = [25, 26, 27];
      return bulletin.announcements.flatMap((item, index) => {
        const slideNum = announcementSlides[index];
        if (!slideNum || slideNum === 27) return [];
        const replacements: SlideTextReplacement[] = [];
        if (item.title?.trim()) {
          replacements.push({ textIndex: 0, text: item.title.trim() });
        }
        if (item.body?.trim()) {
          replacements.push({ textIndex: 1, text: item.body.trim() });
        }
        if (!replacements.length) return [];
        return [{ slideNumber: slideNum, replacements }];
      });
    }
    case 'verse':
      return bulletin.verseOfWeek.trim()
        ? [{ slideNumber: 35, replacements: [{ textIndex: 10, text: bulletin.verseOfWeek.trim() }] }]
        : [];
    case 'more': {
      const patches: SlideTextPatch[] = [];
      if (bulletin.baptismText.trim()) {
        patches.push({
          slideNumber: 27,
          replacements: [{ textIndex: 3, text: bulletin.baptismText.trim() }],
        });
      }
      if (bulletin.testimonyShareDate.trim()) {
        patches.push({
          slideNumber: 33,
          replacements: [{ textIndex: 0, text: bulletin.testimonyShareDate.trim() }],
        });
      }
      if (bulletin.serviceRosterText.trim()) {
        patches.push({
          slideNumber: 34,
          replacements: [{ textIndex: 1, text: bulletin.serviceRosterText.trim() }],
        });
      }
      return patches;
    }
    default:
      return [];
  }
}

function mergePatches(patches: SlideTextPatch[]): SlideTextPatch[] {
  const bySlide = new Map<number, Map<number, string>>();
  for (const patch of patches) {
    let slot = bySlide.get(patch.slideNumber);
    if (!slot) {
      slot = new Map();
      bySlide.set(patch.slideNumber, slot);
    }
    for (const { textIndex, text } of patch.replacements) {
      slot.set(textIndex, text);
    }
  }
  return [...bySlide.entries()]
    .map(([slideNumber, slot]) => ({
      slideNumber,
      replacements: [...slot.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([textIndex, text]) => ({ textIndex, text })),
    }))
    .sort((a, b) => a.slideNumber - b.slideNumber);
}

/** 导出 PPT 时合并全部已填字段的补丁 */
export function patchesFromBulletin(bulletin: WeeklyBulletin): SlideTextPatch[] {
  const stepIds = ['cover', 'offering', 'birthday', 'announcements', 'verse', 'more'] as const;
  return mergePatches(stepIds.flatMap((stepId) => patchesForStep(stepId, bulletin)));
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
  const pathBySlide = new Map(parsed.map((s) => [s.slideInFile, s.slidePath]));
  const zip = await JSZip.loadAsync(templateBlob);

  for (const patch of patches) {
    const slidePath = pathBySlide.get(patch.slideNumber);
    if (!slidePath) continue;
    const entry = zip.file(slidePath);
    if (!entry) continue;
    const xml = await entry.async('string');
    zip.file(slidePath, applyIndexedTextReplacementsToSlideXml(xml, patch.replacements));
  }

  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buf], filename, { type: PPTX_MIME });
}
