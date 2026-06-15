import { fetchBulletinTemplateFile } from '../api/bulletins';
import type { WeeklyBulletin } from '../api/bulletins';
import { formatBulletinCoverDate } from './bulletin-date';
import { buildBulletinPptxFile } from './bulletin-publish';
import { parsePptxSlidesDetailed, type EditableSlide } from './pptx-preview';

function applyCoverTexts(slide: EditableSlide, serviceDate: string, serviceTime: string): EditableSlide {
  const date = formatBulletinCoverDate(serviceDate);
  const time = serviceTime || '11:00';
  const textLines = [date, time];
  return {
    ...slide,
    title: date,
    snippet: time,
    textLines,
  };
}

/** 仅预览封面（第 1 页），日期/时间替换为当前选择 */
export async function previewCoverSlide(
  serviceDate: string,
  serviceTime = '11:00',
): Promise<EditableSlide | null> {
  const template = await fetchBulletinTemplateFile();
  const parsed = await parsePptxSlidesDetailed(template, {
    sourceFile: 'weekly-bulletin-template.pptx',
  });
  const cover = parsed.find((s) => s.slideInFile === 1);
  if (!cover) return null;
  return applyCoverTexts(cover, serviceDate, serviceTime);
}

/** 从模板加载指定页码的幻灯片（静态预览） */
export async function previewTemplateSlides(slideNumbers: number[]): Promise<EditableSlide[]> {
  if (!slideNumbers.length) return [];
  const template = await fetchBulletinTemplateFile();
  const parsed = await parsePptxSlidesDetailed(template, {
    sourceFile: 'weekly-bulletin-template.pptx',
  });
  return slideNumbers
    .map((n) => parsed.find((s) => s.slideInFile === n))
    .filter((s): s is EditableSlide => Boolean(s));
}

export async function rebuildBulletinSlides(bulletin: WeeklyBulletin): Promise<EditableSlide[]> {
  const pptx = await buildBulletinPptxFile(bulletin);
  return parsePptxSlidesDetailed(pptx, {
    sourceFile: `bulletin-${bulletin.serviceDate}.pptx`,
  });
}

export function preserveSlideIndex(
  prevSlides: EditableSlide[],
  prevIndex: number,
  nextSlides: EditableSlide[],
): number {
  if (!nextSlides.length) return 0;
  const current = prevSlides[prevIndex];
  if (!current) return Math.min(prevIndex, nextSlides.length - 1);
  const byPath = nextSlides.findIndex((s) => s.slidePath === current.slidePath);
  if (byPath >= 0) return byPath;
  const byNumber = nextSlides.findIndex((s) => s.slideInFile === current.slideInFile);
  if (byNumber >= 0) return byNumber;
  return Math.min(prevIndex, nextSlides.length - 1);
}
