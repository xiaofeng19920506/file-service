import JSZip from 'jszip';
import { resolveScriptureSlideBodies } from './bible-text.js';
import { applyScripturePagesToZip } from './bulletin-scripture-pptx.js';
import { removeSlidesFromPptxZip } from './pptx-duplicate-slide.js';
import { bulletinSlidePathsToDelete } from './bulletin-section-visibility.js';

/** PPT 封面日期格式：06/14/2026 */
export function formatBulletinCoverDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${m}/${d}/${y}`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type TextRunReplacement = {
  textIndex: number;
  text: string;
  /** PPT 字号（pt），如 34 对应 sz="3400" */
  fontSizePt?: number;
};

function isIndexedRunContent(text: string): boolean {
  return Boolean(text.trim()) || /\s/.test(text);
}

/** 与 applyIndexedTextReplacementsToSlideXml 同一套 run 序号 */
export function extractIndexedTextRuns(xml: string): { textIndex: number; text: string }[] {
  const out: { textIndex: number; text: string }[] = [];
  let idx = 0;
  xml.replace(/<a:r>([\s\S]*?)<\/a:r>/g, (runXml) => {
    const textMatch = runXml.match(/<a:t([^>]*)>([\s\S]*?)<\/a:t>/);
    if (!textMatch) return runXml;
    const content = textMatch[2];
    if (!isIndexedRunContent(content)) return runXml;
    out.push({
      textIndex: idx++,
      text: content
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'"),
    });
    return runXml;
  });
  return out;
}

export async function extractIndexedTextRunsFromPptx(
  pptx: Buffer | Uint8Array,
  slide: number,
): Promise<{ textIndex: number; text: string }[]> {
  if (!Number.isFinite(slide) || slide < 1) return [];
  const zip = await JSZip.loadAsync(pptx);
  const entry = zip.file(`ppt/slides/slide${Math.floor(slide)}.xml`);
  if (!entry) return [];
  return extractIndexedTextRuns(await entry.async('string'));
}

/** 按 <a:r> 内文字 run 序号替换（含仅空格的间距 run） */
export function applyIndexedTextReplacementsToSlideXml(
  xml: string,
  replacements: TextRunReplacement[],
): string {
  const byIndex = new Map(replacements.map((r) => [r.textIndex, r]));
  let idx = 0;
  return xml.replace(/<a:r>([\s\S]*?)<\/a:r>/g, (runXml) => {
    const textMatch = runXml.match(/<a:t([^>]*)>([\s\S]*?)<\/a:t>/);
    if (!textMatch) return runXml;
    const content = textMatch[2];
    if (!isIndexedRunContent(content)) return runXml;

    const current = idx++;
    const rep = byIndex.get(current);
    if (!rep) return runXml;

    let updated = runXml.replace(
      /<a:t([^>]*)>[\s\S]*?<\/a:t>/,
      `<a:t$1>${escapeXml(rep.text)}</a:t>`,
    );
    if (rep.fontSizePt !== undefined) {
      const sz = String(Math.round(rep.fontSizePt * 100));
      updated = /<a:rPr[^>]*sz="/.test(updated)
        ? updated.replace(/(<a:rPr[^>]*sz=")\d+(")/, `$1${sz}$2`)
        : updated.replace(/<a:rPr/, `<a:rPr sz="${sz}"`);
    }
    return updated;
  });
}

/** 教会名蓝条 (268) 底边 y=877200 */
const COVER_DATE_LINE_Y_EMU = 987_000;
const COVER_DATE_LINE_PT = 34;

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

function coverDateRunPr(sz: string): string {
  return `<a:rPr b="1" lang="en-US" dirty="0" sz="${sz}"><a:latin typeface="Corbel"/><a:ea typeface="Corbel"/><a:cs typeface="Corbel"/><a:sym typeface="Corbel"/></a:rPr>`;
}

/**
 * 重写封面日期行 shape 265：单行、统一字号、禁止 spAutoFit 换行，并下移到蓝条下方。
 */
export function patchCoverDateLineInSlideXml(
  xml: string,
  serviceDate: string,
  serviceTime: string,
): string {
  const date = formatBulletinCoverDate(serviceDate);
  const time = serviceTime.trim() || '11:00';
  const sz = String(COVER_DATE_LINE_PT * 100);
  const rPr = coverDateRunPr(sz);
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

  return replaceShapeBlock(xml, '265', (shapeXml) => {
    let s = shapeXml.replace(/(<a:off x="\d+" y=")\d+(")/, `$1${COVER_DATE_LINE_Y_EMU}$2`);
    return s.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, txBody);
  });
}

/** @deprecated 使用 patchCoverDateLineInSlideXml；保留供其他步骤 run 替换 */
export function buildCoverSlideTextReplacements(
  serviceDate: string,
  serviceTime: string,
): TextRunReplacement[] {
  const date = formatBulletinCoverDate(serviceDate);
  const time = serviceTime.trim() || '11:00';
  const linePt = COVER_DATE_LINE_PT;
  return [
    { textIndex: 8, text: `${date}${' '.repeat(22)}`, fontSizePt: linePt },
    { textIndex: 9, text: ' '.repeat(20), fontSizePt: linePt },
    { textIndex: 10, text: time, fontSizePt: linePt },
    { textIndex: 11, text: '主日崇拜    ', fontSizePt: linePt },
  ];
}

/** @deprecated 使用 patchCoverDateLineInSlideXml */
export function layoutCoverDateLineShape(xml: string): string {
  return xml;
}

/** 读经 slide 4：书名 run 4、经节 run 5（标题「讀經 / Scripture Reading」不改） */
export function formatScriptureBookRun(book: string): string {
  const trimmed = book.trim();
  if (!trimmed) return '';
  return /\s$/.test(trimmed) ? trimmed : `${trimmed}   `;
}

export function formatScriptureReferenceRun(reference: string): string {
  const trimmed = reference.trim();
  if (!trimmed) return '';
  return trimmed.startsWith(' ') ? trimmed : ` ${trimmed}`;
}

export function patchScriptureSlideInSlideXml(
  xml: string,
  book: string,
  reference: string,
): string {
  const replacements: TextRunReplacement[] = [];
  const bookRun = formatScriptureBookRun(book);
  const refRun = formatScriptureReferenceRun(reference);
  if (bookRun) replacements.push({ textIndex: 4, text: bookRun });
  if (refRun) replacements.push({ textIndex: 5, text: refRun });
  if (!replacements.length) return xml;
  return applyIndexedTextReplacementsToSlideXml(xml, replacements);
}

/** 会前祷告第 2 页标题 shape；第 3 页名单页会从 deck 移除 */
const PRE_SERVICE_TITLE_SHAPE_ID = '276';

/**
 * 在会前祷告第 2 页标题下方写入主席姓名。
 * name 为空时不改动标题区。
 */
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

/** @deprecated 使用 patchPreServiceChairNameOnSlide2Xml */
export function patchPreServiceChairNamesInSlideXml(xml: string, namesRaw: string): string {
  return patchPreServiceChairNameOnSlide2Xml(xml, namesRaw.split(/[\n,，、]/)[0] ?? '');
}

export type BulletinPreviewPatchInput = {
  serviceDate?: string;
  serviceTime?: string;
  scriptureBook?: string;
  scriptureReference?: string;
  /** 是否在会前祷告第 2 页显示主席姓名 */
  showPreServiceChairName?: boolean;
  /** 主席姓名（单人） */
  preServiceChairNames?: string;
  /** 生日页月份标题（P24 textIndex 2） */
  birthdayMonth?: string;
  /** 生日名单，换行/逗号分隔最多 3 人（P24 textIndex 5–7） */
  birthdayNames?: string;
  /** 本週金句（P35 textIndex 18） */
  verseOfWeek?: string;
  hiddenSections?: string[];
  skipTestimonyWeek?: boolean;
  skipDepartmentReports?: boolean;
  weeklyMeetingVariant?: number | null;
  /** 幻灯片文字覆盖（slide 文件号 + textIndex） */
  slideTextOverrides?: SlideTextOverride[];
};

export type SlideTextOverride = {
  slide: number;
  textIndex: number;
  text: string;
};

export function normalizeSlideTextOverrides(raw: unknown): SlideTextOverride[] {
  if (!Array.isArray(raw)) return [];
  const out: SlideTextOverride[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const slide = Number(row.slide);
    const textIndex = Number(row.textIndex);
    const text = row.text;
    if (!Number.isFinite(slide) || slide < 1) continue;
    if (!Number.isFinite(textIndex) || textIndex < 0) continue;
    if (typeof text !== 'string') continue;
    const key = `${Math.floor(slide)}:${Math.floor(textIndex)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      slide: Math.floor(slide),
      textIndex: Math.floor(textIndex),
      text,
    });
  }
  return out;
}

async function applySlideTextOverridesToZip(
  zip: JSZip,
  overrides: readonly SlideTextOverride[],
): Promise<void> {
  if (!overrides.length) return;
  const bySlide = new Map<number, { textIndex: number; text: string }[]>();
  for (const o of overrides) {
    const list = bySlide.get(o.slide) ?? [];
    list.push({ textIndex: o.textIndex, text: o.text });
    bySlide.set(o.slide, list);
  }
  for (const [slide, reps] of bySlide) {
    const path = `ppt/slides/slide${slide}.xml`;
    const entry = zip.file(path);
    if (!entry) continue;
    const xml = await entry.async('string');
    zip.file(path, applyIndexedTextReplacementsToSlideXml(xml, reps));
  }
}

function splitBirthdayNameLines(names: string, max = 3): string[] {
  return names
    .split(/[\n,，、]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

export function buildBirthdaySlideReplacements(
  birthdayMonth: string,
  birthdayNames: string,
): TextRunReplacement[] {
  const reps: TextRunReplacement[] = [];
  const month = birthdayMonth.trim();
  if (month) reps.push({ textIndex: 2, text: month });
  const nameLines = splitBirthdayNameLines(birthdayNames, 3);
  for (let i = 0; i < 3; i++) {
    reps.push({ textIndex: 5 + i, text: nameLines[i] ?? ' ' });
  }
  return reps;
}

async function applyBirthdayFieldsToZip(
  zip: JSZip,
  birthdayMonth: string | undefined,
  birthdayNames: string | undefined,
): Promise<void> {
  const month = birthdayMonth?.trim() ?? '';
  const names = birthdayNames?.trim() ?? '';
  if (!month && !names) return;
  const entry = zip.file('ppt/slides/slide24.xml');
  if (!entry) return;
  const xml = await entry.async('string');
  zip.file(
    'ppt/slides/slide24.xml',
    applyIndexedTextReplacementsToSlideXml(
      xml,
      buildBirthdaySlideReplacements(birthdayMonth ?? '', birthdayNames ?? ''),
    ),
  );
}

async function applyVerseOfWeekToZip(zip: JSZip, verseOfWeek: string | undefined): Promise<void> {
  const verse = verseOfWeek?.trim() ?? '';
  if (!verse) return;
  const entry = zip.file('ppt/slides/slide35.xml');
  if (!entry) return;
  const xml = await entry.async('string');
  zip.file(
    'ppt/slides/slide35.xml',
    applyIndexedTextReplacementsToSlideXml(xml, [{ textIndex: 18, text: verse }]),
  );
}

type PptxInputBytes = Buffer | Uint8Array;

/** 预览/导出用：封面 + 会前祷告 + 读经 + 生日/金句 + 按隐藏分区删页 */
export async function patchBulletinPreviewInPptx(
  template: PptxInputBytes,
  input: BulletinPreviewPatchInput,
): Promise<Uint8Array> {
  let buf: PptxInputBytes = template;
  if (input.serviceDate) {
    buf = await patchCoverSlideInPptx(buf, {
      serviceDate: input.serviceDate,
      serviceTime: input.serviceTime,
    });
  }

  {
    const zip = await JSZip.loadAsync(buf);
    const showChair = Boolean(input.showPreServiceChairName);
    const chairName = input.preServiceChairNames?.trim() ?? '';
    if (showChair && chairName) {
      const slide2 = zip.file('ppt/slides/slide2.xml');
      if (slide2) {
        const xml = await slide2.async('string');
        zip.file('ppt/slides/slide2.xml', patchPreServiceChairNameOnSlide2Xml(xml, chairName));
      }
    }
    buf = await zip.generateAsync({ type: 'uint8array' });
  }

  const book = input.scriptureBook?.trim() ?? '';
  const reference = input.scriptureReference?.trim() ?? '';
  const hideScripture = bulletinSlidePathsToDelete(input).some((p) => p.includes('slide4.xml'));

  let zip = await JSZip.loadAsync(buf);

  if (!hideScripture && (book || reference)) {
    const slide4 = zip.file('ppt/slides/slide4.xml');
    if (slide4) {
      const xml = await slide4.async('string');
      zip.file('ppt/slides/slide4.xml', patchScriptureSlideInSlideXml(xml, book, reference));
    }
  }

  if (!hideScripture && book && reference) {
    const bodies = await resolveScriptureSlideBodies(book, reference);
    if (bodies) {
      await applyScripturePagesToZip(zip, bodies.chinesePages, bodies.englishPages);
    }
  }

  await applyBirthdayFieldsToZip(zip, input.birthdayMonth, input.birthdayNames);
  await applyVerseOfWeekToZip(zip, input.verseOfWeek);

  const overrides = normalizeSlideTextOverrides(input.slideTextOverrides);
  if (overrides.length) {
    await applySlideTextOverridesToZip(zip, overrides);
  }

  const removePaths = bulletinSlidePathsToDelete(input);
  if (removePaths.length) {
    await removeSlidesFromPptxZip(zip, removePaths);
  }

  return zip.generateAsync({ type: 'uint8array' });
}

export type CoverSlidePatchInput = {
  serviceDate: string;
  serviceTime?: string;
};

/** 仅修改封面 slide 1 的日期与时间 */
export async function patchCoverSlideInPptx(
  template: PptxInputBytes,
  input: CoverSlidePatchInput,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(template);
  const slidePath = 'ppt/slides/slide1.xml';
  const entry = zip.file(slidePath);
  if (!entry) {
    return template instanceof Uint8Array ? template : new Uint8Array(template);
  }

  const xml = await entry.async('string');
  const patched = patchCoverDateLineInSlideXml(
    xml,
    input.serviceDate,
    input.serviceTime ?? '11:00',
  );
  zip.file(slidePath, patched);
  return zip.generateAsync({ type: 'uint8array' });
}
