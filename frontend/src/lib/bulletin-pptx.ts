import type { WeeklyBulletin } from '../api/bulletins';
import { formatBulletinCoverDate } from './bulletin-date';
import {
  applySlidesToPptx,
  deleteSlidesFromPptx,
  parsePptxSlidesDetailed,
} from './pptx-preview';

function slidePathForNumber(n: number): string {
  return `ppt/slides/slide${n}.xml`;
}

function slidesToDelete(bulletin: WeeklyBulletin): string[] {
  const paths: string[] = [];
  if (bulletin.skipTestimonyWeek) paths.push(slidePathForNumber(16));
  if (bulletin.skipDepartmentReports) paths.push(slidePathForNumber(36));
  const variants = [28, 29, 30];
  const keep = bulletin.weeklyMeetingVariant;
  for (const n of variants) {
    if (keep === null || n !== keep) paths.push(slidePathForNumber(n));
  }
  return paths;
}

function replaceSlideTexts(
  parsed: Awaited<ReturnType<typeof parsePptxSlidesDetailed>>,
  slideNumber: number,
  texts: string[],
): void {
  const slide = parsed.find((s) => s.slideInFile === slideNumber);
  if (!slide || !texts.length) return;
  slide.title = texts[0] ?? slide.title;
  slide.snippet = texts.slice(1).join('\n');
}

export async function generateBulletinPptx(
  templateBlob: Blob,
  bulletin: WeeklyBulletin,
): Promise<File> {
  const parsed = await parsePptxSlidesDetailed(templateBlob);
  const date = formatBulletinCoverDate(bulletin.serviceDate);

  replaceSlideTexts(parsed, 1, [date, bulletin.serviceTime || '11:00']);
  if (bulletin.lastWeekOfferingDate) {
    replaceSlideTexts(parsed, 19, [bulletin.lastWeekOfferingDate]);
  }
  if (bulletin.offeringQuarterLabel) {
    replaceSlideTexts(parsed, 22, [bulletin.offeringQuarterLabel]);
  }
  if (bulletin.birthdayMonth || bulletin.birthdayNames) {
    replaceSlideTexts(parsed, 24, [bulletin.birthdayMonth, bulletin.birthdayNames].filter(Boolean));
  }
  if (bulletin.baptismText) {
    replaceSlideTexts(parsed, 27, [bulletin.baptismText]);
  }
  if (bulletin.staffMeetingDate) {
    replaceSlideTexts(parsed, 31, [bulletin.staffMeetingDate]);
  }
  if (bulletin.testimonyShareDate) {
    replaceSlideTexts(parsed, 33, [bulletin.testimonyShareDate]);
  }
  if (bulletin.serviceRosterText) {
    replaceSlideTexts(parsed, 34, [bulletin.serviceRosterText]);
  }
  if (bulletin.verseOfWeek) {
    replaceSlideTexts(parsed, 35, [bulletin.verseOfWeek]);
  }

  const announcementSlides = [25, 26, 27];
  bulletin.announcements.forEach((item, index) => {
    const slideNum = announcementSlides[index];
    if (!slideNum) return;
    const lines = [item.title, item.body].filter(Boolean);
    if (lines.length) replaceSlideTexts(parsed, slideNum, lines);
  });

  const filename = `bulletin-${bulletin.serviceDate}.pptx`;
  let file = await applySlidesToPptx(
    templateBlob,
    parsed.map((s) => ({ slidePath: s.slidePath, title: s.title, snippet: s.snippet })),
    filename,
  );

  const deletePaths = slidesToDelete(bulletin);
  if (deletePaths.length) {
    file = await deleteSlidesFromPptx(file, deletePaths);
  }

  return file;
}
