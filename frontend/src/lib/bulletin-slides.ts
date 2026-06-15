import type { WeeklyBulletin } from '../api/bulletins';
import { buildBulletinPptxFile } from './bulletin-publish';
import { parsePptxSlidesDetailed, type EditableSlide } from './pptx-preview';

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
