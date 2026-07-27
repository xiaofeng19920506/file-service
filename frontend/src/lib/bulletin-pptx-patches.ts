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
import JSZip from './jszip';

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
  /** 会前祷告第 2 页主席姓名（勾选显示时） */
  preServiceChairName?: string;
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

const PRE_SERVICE_TITLE_SHAPE_ID = '276';

/** 与 shared 一致：在会前祷告第 2 页标题下写入主席姓名 */
export function patchPreServiceChairNameOnSlide2Xml(xml: string, nameRaw: string): string {
  const name = nameRaw.trim();
  if (!name) return xml;
  const namePara = [
    '<a:p>',
    '<a:pPr indent="0" lvl="0" marL="0" rtl="0" algn="ctr">',
    '<a:spcBef><a:spcPts val="1200"/></a:spcBef>',
    '<a:buNone/>',
    '</a:pPr>',
    '<a:r>',
    '<a:rPr b="1" lang="zh-CN" sz="2800">',
    '<a:solidFill><a:srgbClr val="800000"/></a:solidFill>',
    '<a:latin typeface="Corbel"/><a:ea typeface="Corbel"/><a:cs typeface="Corbel"/><a:sym typeface="Corbel"/>',
    '</a:rPr>',
    `<a:t>${escapeXml(name)}</a:t>`,
    '</a:r>',
    '</a:p>',
  ].join('');
  return replaceShapeBlock(xml, PRE_SERVICE_TITLE_SHAPE_ID, (shapeXml) => {
    if (shapeXml.includes(`>${escapeXml(name)}<`)) return shapeXml;
    return shapeXml.replace('</p:txBody>', `${namePara}</p:txBody>`);
  });
}

/** @deprecated */
export function patchPreServiceChairNamesInSlideXml(xml: string, namesRaw: string): string {
  return patchPreServiceChairNameOnSlide2Xml(xml, namesRaw.split(/[\n,，、]/)[0] ?? '');
}

/** 与 shared/bulletin-pptx-patch 保持一致 */
export function patchCoverDateLineInSlideXml(
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

/** 生日页 P24：月份标题 textIndex=2，名单 5/6/7 */
export function buildBirthdaySlideReplacements(
  birthdayMonth: string,
  birthdayNames: string,
): { textIndex: number; text: string }[] {
  const reps: { textIndex: number; text: string }[] = [];
  const month = birthdayMonth.trim();
  if (month) reps.push({ textIndex: 2, text: month });
  const nameLines = splitNameLines(birthdayNames, 3);
  for (let i = 0; i < 3; i++) {
    reps.push({ textIndex: 5 + i, text: nameLines[i] ?? ' ' });
  }
  return reps;
}

/**
 * 奉献页 P19 日期行被拆成多 run：`上週奉獻` `:` `0` `6/07` `/20` `2` `6`
 * 必须把完整日期写入碎片起始 run（7），并清空后续碎片，否则会拼成双日期。
 */
export function buildOfferingDateReplacements(
  lastWeekOfferingDate: string,
): { textIndex: number; text: string }[] {
  const date = lastWeekOfferingDate.trim();
  if (!date) return [];
  return [
    { textIndex: 7, text: date },
    { textIndex: 8, text: '' },
    { textIndex: 9, text: '' },
    { textIndex: 10, text: '' },
    { textIndex: 11, text: '' },
  ];
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
    case 'pre_service':
      return bulletin.showPreServiceChairName && bulletin.preServiceChairNames?.trim()
        ? [
            {
              slideNumber: 2,
              replacements: [],
              preServiceChairName: bulletin.preServiceChairNames.trim(),
            },
          ]
        : [];
    case 'scripture': {
      const patch = buildScripturePatch(bulletin);
      return patch ? [patch] : [];
    }
    case 'offering': {
      const patches: SlideTextPatch[] = [];
      const dateReps = buildOfferingDateReplacements(bulletin.lastWeekOfferingDate);
      if (dateReps.length) {
        patches.push({ slideNumber: 19, replacements: dateReps });
      }
      return patches;
    }
    case 'birthday': {
      const month = bulletin.birthdayMonth.trim();
      const names = bulletin.birthdayNames.trim();
      if (!month && !names) return [];
      return [
        {
          slideNumber: 24,
          replacements: buildBirthdaySlideReplacements(
            bulletin.birthdayMonth,
            bulletin.birthdayNames,
          ),
        },
      ];
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
        ? [{ slideNumber: 35, replacements: [{ textIndex: 18, text: bulletin.verseOfWeek.trim() }] }]
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

/** 幻灯片文字覆盖（原版文件号 + textIndex），与 shared SlideTextOverride 同形 */
export type BulletinSlideTextOverride = { slide: number; textIndex: number; text: string };

/**
 * 表单里那些「只是替换某页某个文字 run」的动态字段，压成 slideTextOverride 形式。
 * 用于右侧预览（走 slideTextOverrides query）与导出后 splice 覆盖，让这些字段
 * 与最终 PPT 一致。封面/读经/生日/金句/会前主席另有专门补丁，这里不重复处理。
 */
export function bulletinDynamicTextOverrides(bulletin: WeeklyBulletin): BulletinSlideTextOverride[] {
  const out: BulletinSlideTextOverride[] = [];
  const offeringReps = buildOfferingDateReplacements(bulletin.lastWeekOfferingDate ?? '');
  for (const rep of offeringReps) {
    out.push({ slide: 19, textIndex: rep.textIndex, text: rep.text });
  }
  // 公告：announcements[0]→P25，[1]→P26（P27 留给浸礼）
  const announcementSlides = [25, 26];
  (bulletin.announcements ?? []).forEach((item, index) => {
    const slide = announcementSlides[index];
    if (!slide) return;
    if (item.title?.trim()) out.push({ slide, textIndex: 0, text: item.title.trim() });
    if (item.body?.trim()) out.push({ slide, textIndex: 1, text: item.body.trim() });
  });
  const baptism = bulletin.baptismText?.trim() ?? '';
  if (baptism) out.push({ slide: 27, textIndex: 3, text: baptism });
  const testimony = bulletin.testimonyShareDate?.trim() ?? '';
  if (testimony) out.push({ slide: 33, textIndex: 0, text: testimony });
  const roster = bulletin.serviceRosterText?.trim() ?? '';
  if (roster) out.push({ slide: 34, textIndex: 1, text: roster });
  return out;
}

/** 合并字段派生覆盖与手动覆盖，同一 slide:textIndex 时手动覆盖优先（与导出一致） */
export function mergeSlideTextOverrides(
  base: readonly BulletinSlideTextOverride[],
  manual: readonly BulletinSlideTextOverride[] | null | undefined,
): BulletinSlideTextOverride[] {
  const map = new Map<string, BulletinSlideTextOverride>();
  for (const o of base) map.set(`${o.slide}:${o.textIndex}`, o);
  for (const o of manual ?? []) map.set(`${o.slide}:${o.textIndex}`, o);
  return [...map.values()];
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
    if (patch.preServiceChairName) extra.preServiceChairName = patch.preServiceChairName;
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
  const stepIds = [
    'cover',
    'pre_service',
    'scripture',
    'offering',
    'birthday',
    'announcements',
    'verse',
    'more',
  ] as const;
  const groups = await Promise.all(
    stepIds.map((stepId) => patchesForStepAsync(stepId, bulletin, scriptureBodies)),
  );
  const fieldPatches = mergePatches(groups.flat());
  const overridePatches = (bulletin.slideTextOverrides ?? []).reduce<SlideTextPatch[]>(
    (acc, o) => {
      const existing = acc.find((p) => p.slideNumber === o.slide);
      if (existing) {
        existing.replacements.push({ textIndex: o.textIndex, text: o.text });
        return acc;
      }
      acc.push({
        slideNumber: o.slide,
        replacements: [{ textIndex: o.textIndex, text: o.text }],
      });
      return acc;
    },
    [],
  );
  // 分区「修改幻灯片」覆盖优先于表单字段补丁
  return {
    patches: mergePatches([...fieldPatches, ...overridePatches]),
    scriptureBodies,
  };
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
    if (patch.preServiceChairName) {
      nextXml = patchPreServiceChairNameOnSlide2Xml(nextXml, patch.preServiceChairName);
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
