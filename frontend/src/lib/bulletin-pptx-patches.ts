import type { WeeklyBulletin, ScriptureSlideBodies } from '../api/bulletins';
import { fetchScriptureSlideBodies } from '../api/bulletins';
import { formatBulletinCoverDate } from './bulletin-date';
import {
  patchChineseScriptureBodyInSlideXml,
  patchSlide6ScriptureBodyInSlideXml,
} from './bulletin-scripture-body-patch';
import {
  applyIndexedTextReplacementsToSlideXml,
  parsePptxSlidesDetailed,
} from './pptx-preview';
import { expandScriptureSlidesInPptx } from './bulletin-scripture-pptx-expand';
import JSZip from 'jszip';

/** 原版模板文件名（`06_14_2026.pptx`，背景与图片均以此为准） */
export const BULLETIN_TEMPLATE_FILENAME = '06_14_2026.pptx';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export type SlideTextReplacement = {
  /** 幻灯片内文字 run 的 0-based 序号（对应原版 `06_14_2026.pptx`） */
  textIndex: number;
  text: string;
  fontSizePt?: number;
};

/** 仅替换指定幻灯片上列出的文字 run，不触碰图片、背景等 */
export type SlideTextPatch = {
  slideNumber: number;
  replacements: SlideTextReplacement[];
  /** 封面日期行整段重写（避免 run 替换 + spAutoFit 换行错位） */
  coverLine?: { serviceDate: string; serviceTime: string };
  /** 读经 slide 5 中文正文 */
  scriptureChineseBody?: string;
  /** 读经 slide 6：中文续页或英文正文 */
  scriptureSlide6?: {
    chinese?: string | null;
    englishLines?: string[] | null;
  };
};

/** 封面日期行补丁 */
export function buildCoverPatch(serviceDate: string, serviceTime: string): SlideTextPatch {
  return {
    slideNumber: 1,
    replacements: [],
    coverLine: { serviceDate, serviceTime: serviceTime.trim() || '11:00' },
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function findShapeBlock(xml: string, shapeId: string): { start: number; end: number } | null {
  const marker = `<p:cNvPr id="${shapeId}"`;
  const idIdx = xml.indexOf(marker);
  if (idIdx < 0) return null;
  const start = xml.lastIndexOf('<p:sp>', idIdx);
  const endTag = xml.indexOf('</p:sp>', idIdx);
  if (start < 0 || endTag < 0) return null;
  return { start, end: endTag + '</p:sp>'.length };
}

function replaceShapeBlock(
  xml: string,
  shapeId: string,
  transform: (block: string) => string,
): string {
  const loc = findShapeBlock(xml, shapeId);
  if (!loc) return xml;
  const block = xml.slice(loc.start, loc.end);
  return xml.slice(0, loc.start) + transform(block) + xml.slice(loc.end);
}

/** 与 shared/bulletin-pptx-patch 保持一致 */
function patchCoverDateLineInSlideXml(
  xml: string,
  serviceDate: string,
  serviceTime: string,
): string {
  const date = formatBulletinCoverDate(serviceDate);
  const time = serviceTime.trim() || '11:00';
  const linePt = 34;
  const sz = String(linePt * 100);
  const rPr = `<a:rPr b="1" lang="en-US" dirty="0" sz="${sz}"><a:latin typeface="Corbel"/><a:ea typeface="Corbel"/><a:cs typeface="Corbel"/><a:sym typeface="Corbel"/></a:rPr>`;
  const paragraph = [
    '<a:p>',
    '<a:pPr indent="0" lvl="0" marL="0" marR="0" rtl="0" algn="ctr">',
    '<a:lnSpc><a:spcPct val="100000"/></a:lnSpc>',
    '<a:buNone/>',
    '</a:pPr>',
    `<a:r>${rPr}<a:t>${escapeXml(date)}</a:t></a:r>`,
    `<a:r>${rPr}<a:t xml:space="preserve">${' '.repeat(18)}</a:t></a:r>`,
    `<a:r>${rPr}<a:t>${escapeXml(time)} </a:t></a:r>`,
    `<a:r>${rPr}<a:t>主日崇拜</a:t></a:r>`,
    '</a:p>',
  ].join('');
  const txBody = [
    '<p:txBody>',
    '<a:bodyPr anchorCtr="0" anchor="t" bIns="45720" lIns="91425" spcFirstLastPara="1" rIns="91425" wrap="none" tIns="45720">',
    '<a:noAutofit/>',
    '</a:bodyPr>',
    '<a:lstStyle/>',
    paragraph,
    '</p:txBody>',
  ].join('');
  const COVER_DATE_LINE_Y_EMU = 987_000;
  return replaceShapeBlock(xml, '265', (shapeXml) => {
    let s = shapeXml.replace(/(<a:off x="\d+" y=")\d+(")/, `$1${COVER_DATE_LINE_Y_EMU}$2`);
    return s.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, txBody);
  });
}

function splitNameLines(names: string, max = 3): string[] {
  return names
    .split(/[\n,，、]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

function formatScriptureBookRun(book: string): string {
  const trimmed = book.trim();
  if (!trimmed) return '';
  return /\s$/.test(trimmed) ? trimmed : `${trimmed}   `;
}

function formatScriptureReferenceRun(reference: string): string {
  const trimmed = reference.trim();
  if (!trimmed) return '';
  return trimmed.startsWith(' ') ? trimmed : ` ${trimmed}`;
}

function buildScripturePatch(bulletin: WeeklyBulletin): SlideTextPatch | null {
  const book = bulletin.scriptureBook?.trim() ?? '';
  const reference = bulletin.scriptureReference?.trim() ?? '';
  if (!book && !reference) return null;
  const replacements: SlideTextReplacement[] = [];
  const bookRun = formatScriptureBookRun(book);
  const refRun = formatScriptureReferenceRun(reference);
  if (bookRun) replacements.push({ textIndex: 4, text: bookRun });
  if (refRun) replacements.push({ textIndex: 5, text: refRun });
  return { slideNumber: 4, replacements };
}

/** 当前向导步骤应写入 PPT 的补丁（只含本步字段） */
export function patchesForStep(stepId: string, bulletin: WeeklyBulletin): SlideTextPatch[] {
  switch (stepId) {
    case 'cover':
      if (!bulletin.serviceDate) return [];
      return [buildCoverPatch(bulletin.serviceDate, bulletin.serviceTime)];
    case 'scripture': {
      const patch = buildScripturePatch(bulletin);
      return patch ? [patch] : [];
    }
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
  const extras = new Map<number, Omit<SlideTextPatch, 'slideNumber' | 'replacements'>>();
  let coverLine: SlideTextPatch['coverLine'];
  for (const patch of patches) {
    if (patch.coverLine) coverLine = patch.coverLine;
    let slot = bySlide.get(patch.slideNumber);
    if (!slot) {
      slot = new Map();
      bySlide.set(patch.slideNumber, slot);
    }
    for (const { textIndex, text } of patch.replacements) {
      slot.set(textIndex, text);
    }
    const extra: Omit<SlideTextPatch, 'slideNumber' | 'replacements'> = {};
    if (patch.scriptureChineseBody) extra.scriptureChineseBody = patch.scriptureChineseBody;
    if (patch.scriptureSlide6) extra.scriptureSlide6 = patch.scriptureSlide6;
    if (Object.keys(extra).length) {
      extras.set(patch.slideNumber, { ...extras.get(patch.slideNumber), ...extra });
    }
  }
  return [...bySlide.entries()]
    .map(([slideNumber, slot]) => ({
      slideNumber,
      replacements: [...slot.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([textIndex, text]) => ({ textIndex, text })),
      ...(slideNumber === 1 && coverLine ? { coverLine } : {}),
      ...extras.get(slideNumber),
    }))
    .sort((a, b) => a.slideNumber - b.slideNumber);
}

async function fetchScriptureBodiesForBulletin(
  bulletin: WeeklyBulletin,
): Promise<ScriptureSlideBodies | null> {
  const book = bulletin.scriptureBook?.trim() ?? '';
  const reference = bulletin.scriptureReference?.trim() ?? '';
  if (!book || !reference) return null;
  return fetchScriptureSlideBodies(book, reference);
}

function scriptureBodyPatchesFromBodies(bodies: ScriptureSlideBodies): SlideTextPatch[] {
  return [
    {
      slideNumber: 5,
      replacements: [],
      scriptureChineseBody: bodies.chinesePages[0] ?? '',
    },
    {
      slideNumber: 6,
      replacements: [],
      scriptureSlide6: { englishLines: bodies.englishPages[0] ?? [] },
    },
  ];
}

export async function patchesForStepAsync(
  stepId: string,
  bulletin: WeeklyBulletin,
  scriptureBodies?: ScriptureSlideBodies | null,
): Promise<SlideTextPatch[]> {
  const base = patchesForStep(stepId, bulletin);
  if (stepId !== 'scripture') return base;
  const bodies = scriptureBodies ?? (await fetchScriptureBodiesForBulletin(bulletin));
  if (!bodies) return base;
  return [...base, ...scriptureBodyPatchesFromBodies(bodies)];
}

/** 导出 PPT 时合并全部已填字段的补丁 */
export async function patchesFromBulletin(bulletin: WeeklyBulletin): Promise<{
  patches: SlideTextPatch[];
  scriptureBodies: ScriptureSlideBodies | null;
}> {
  const scriptureBodies = await fetchScriptureBodiesForBulletin(bulletin);
  const stepIds = ['cover', 'scripture', 'offering', 'birthday', 'announcements', 'verse', 'more'] as const;
  const groups = await Promise.all(
    stepIds.map((stepId) => patchesForStepAsync(stepId, bulletin, scriptureBodies)),
  );
  return { patches: mergePatches(groups.flat()), scriptureBodies };
}

/** 应用文字补丁并在读经段按需复制额外幻灯片 */
export async function applyBulletinPatches(
  templateBlob: Blob,
  patches: SlideTextPatch[],
  scriptureBodies: ScriptureSlideBodies | null,
  filename: string,
): Promise<File> {
  let file = await applySlidePatches(templateBlob, patches, filename);
  if (scriptureBodies) {
    file = await expandScriptureSlidesInPptx(file, scriptureBodies);
  }
  return file;
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
    let nextXml = xml;
    if (patch.coverLine) {
      nextXml = patchCoverDateLineInSlideXml(
        nextXml,
        patch.coverLine.serviceDate,
        patch.coverLine.serviceTime,
      );
    }
    if (patch.replacements.length) {
      nextXml = applyIndexedTextReplacementsToSlideXml(nextXml, patch.replacements);
    }
    if (patch.scriptureChineseBody) {
      nextXml = patchChineseScriptureBodyInSlideXml(nextXml, patch.scriptureChineseBody);
    }
    if (patch.scriptureSlide6) {
      nextXml = patchSlide6ScriptureBodyInSlideXml(
        nextXml,
        patch.scriptureSlide6.chinese ?? null,
        patch.scriptureSlide6.englishLines ?? null,
      );
    }
    zip.file(slidePath, nextXml);
  }

  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buf], filename, { type: PPTX_MIME });
}
