import JSZip from 'jszip';
import { resolveScriptureSlideBodies } from './bible-text.js';
import { applyBirthdayNameGridToSlideXml } from './bulletin-birthday.js';
import {
  BIRTHDAY_ANCHOR_SLIDE,
  resolveBirthdayFields,
  slideNumberForBirthdayMonth,
} from './bulletin-birthday-months.js';
import { applyBirthdayMonthFromLibraryToPptx } from './bulletin-birthday-month-pptx.js';
import { applyScripturePagesToZip } from './bulletin-scripture-pptx.js';
import { removeSlidesFromPptxZip, duplicateSlideInZip } from './pptx-duplicate-slide.js';
import { bulletinSlidePathsToDelete } from './bulletin-section-visibility.js';

/** 圣餐英文正文页（模板文件号）；字号过大时 LO 预览会裁切 */
const COMMUNION_ENGLISH_SLIDE_FILES = [12, 13] as const;
/** 英文圣餐经文固定字号（pt×100）；28pt 铺满更多画面且实测不裁切 */
const COMMUNION_EN_FONT_SZ = '2800';
/** 名单文本框尽量贴满画幅高度（留底部分隔线） */
const COMMUNION_EN_TEXT_BOX_CY = '5000000';

/**
 * 圣餐英文页：关闭 spAutoFit，统一字号并略增高文本框，减少底部空白。
 */
export function stabilizeCommunionEnglishSlideXml(xml: string): string {
  let out = xml.replace(/<a:spAutoFit\s*\/>/g, '<a:noAutofit/>');
  out = out.replace(/sz="(\d+)"/g, (full, raw) => {
    const n = Number.parseInt(raw, 10);
    // 仅调整偏大的正文（≥24pt），标题类小字不动
    if (!Number.isFinite(n) || n < 2400) return full;
    return `sz="${COMMUNION_EN_FONT_SZ}"`;
  });
  // 加高正文文本框，让更大字号有垂直空间可用
  out = out.replace(
    /(<a:off x="0" y="0"\/>\s*<a:ext cx="9144000" )cy="\d+"/g,
    `$1cy="${COMMUNION_EN_TEXT_BOX_CY}"`,
  );
  out = out.replace(
    /(<a:ext cx="9144000" )cy="\d+"/g,
    `$1cy="${COMMUNION_EN_TEXT_BOX_CY}"`,
  );
  return out;
}

export async function stabilizeCommunionEnglishSlidesInZip(zip: JSZip): Promise<void> {
  for (const fileNum of COMMUNION_ENGLISH_SLIDE_FILES) {
    const path = `ppt/slides/slide${fileNum}.xml`;
    const entry = zip.file(path);
    if (!entry) continue;
    const xml = await entry.async('string');
    zip.file(path, stabilizeCommunionEnglishSlideXml(xml));
  }
}

/** 奉献报告页（模板文件号 P19） */
const OFFERING_REPORT_SLIDE_FILE = 19;
/** 标题栏略加高，避免中英单行被裁切 */
const OFFERING_TITLE_BOX_CY = '980000';
/** 中文标题字号（pt×100）；原 48pt 过宽会导致英文换行 */
const OFFERING_TITLE_ZH_SZ = '4000';
/** 英文标题字号；原 30pt 与中文并排会把 Report 挤到下一行 */
const OFFERING_TITLE_EN_SZ = '2400';

/** P32 标题字号：原 44pt 在 LO 下 CJK 回退字形过高，易裁切 */
const ROTATION_TITLE_SZ = '3600';
/** 标题框高度：盖住页顶浅色条，并给字形留足行高 */
const ROTATION_TITLE_CY = '1100000';

/** 顶栏标题：y=0、加高、去内边距、禁换行、缩字号（浅色填色条勿把 y 调太大） */
function stabilizeWideHeaderTitleShape(
  shapeXml: string,
  opts: {
    /** 不传则不改 y；传则强制（含负值修正） */
    y?: string;
    cy: string;
    /** 原字号 → 新字号 */
    szReplacements: ReadonlyArray<readonly [string, string]>;
  },
): string {
  let out = shapeXml;
  if (opts.y != null) {
    out = out.replace(/<a:off x="(-?\d+)" y="-?\d+"\/>/, `<a:off x="$1" y="${opts.y}"/>`);
  }
  out = out.replace(/(<a:ext cx="9144000" )cy="\d+"\/>/, `$1cy="${opts.cy}"/>`);
  out = out.replace(/\btIns="\d+"/, 'tIns="0"');
  out = out.replace(/\bbIns="\d+"/, 'bIns="0"');
  out = out.replace(/(<a:bodyPr\b[^>]*\bwrap=")square(")/, `$1none$2`);
  for (const [from, to] of opts.szReplacements) {
    out = out.split(`sz="${from}"`).join(`sz="${to}"`);
  }
  return out;
}

/**
 * 服事轮值表 P32：标题框原版 y 为负导致顶部裁切；改 y=0、增高、去内边距并略缩字号。
 * 注意：标题框带 lt2 浅色填充，y 过大顶部会露出深蓝底。
 */
export function stabilizeRotationSlideXml(xml: string): string {
  if (!xml.includes('清潔服事輪值表') && !xml.includes('服事輪值表')) return xml;
  return xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (shapeXml) => {
    const isTitle = shapeXml.includes('清潔服事輪值表');
    const isBody =
      shapeXml.includes('已張貼在各個佈告欄') || shapeXml.includes('請詢問振成');
    if (!isTitle && !isBody) return shapeXml;
    let out = shapeXml;
    if (isTitle) {
      out = stabilizeWideHeaderTitleShape(out, {
        y: '0',
        cy: ROTATION_TITLE_CY,
        szReplacements: [['4400', ROTATION_TITLE_SZ]],
      });
    }
    if (isBody) {
      out = out.replace(/(<a:ext cx="8642700" )cy="\d+"\/>/, `$1cy="3400000"/>`);
    }
    return out;
  });
}

export async function stabilizeRotationSlideInZip(zip: JSZip): Promise<void> {
  const path = 'ppt/slides/slide32.xml';
  const entry = zip.file(path);
  if (!entry) return;
  const xml = await entry.async('string');
  zip.file(path, stabilizeRotationSlideXml(xml));
}

/** 同工会 P31 页眉 */
const STAFF_MEETING_TITLE_CY = '1200000';

/**
 * 同工会 P31：负 y + 60pt 易裁切/换行；压到单行并留足行高。
 */
export function stabilizeStaffMeetingSlideXml(xml: string): string {
  if (!xml.includes('同工會')) return xml;
  return xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (shapeXml) => {
    if (!shapeXml.includes('同工會') || !shapeXml.includes('年')) return shapeXml;
    return stabilizeWideHeaderTitleShape(shapeXml, {
      y: '0',
      cy: STAFF_MEETING_TITLE_CY,
      szReplacements: [
        ['6000', '4800'],
        ['5700', '4600'],
      ],
    });
  });
}

export async function stabilizeStaffMeetingSlideInZip(zip: JSZip): Promise<void> {
  const path = 'ppt/slides/slide31.xml';
  const entry = zip.file(path);
  if (!entry) return;
  zip.file(path, stabilizeStaffMeetingSlideXml(await entry.async('string')));
}

/** 下主日见证 P33 页眉 */
const TESTIMONY_TITLE_CY = '1000000';
const TESTIMONY_TITLE_SZ = '3600';
const TESTIMONY_BODY_MIN_Y = 1_080_000;

/**
 * 下主日见证 P33：负 y + 48pt 易裁切；单行显示，并把正文下推避免压进页眉。
 */
export function stabilizeTestimonySlideXml(xml: string): string {
  if (!xml.includes('見證分享')) return xml;
  return xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (shapeXml) => {
    const isTitle = shapeXml.includes('下主日') && shapeXml.includes('見證分享');
    const isBody = shapeXml.includes('是見證') || shapeXml.includes('讓我們一起來');
    if (!isTitle && !isBody) return shapeXml;
    if (isTitle) {
      return stabilizeWideHeaderTitleShape(shapeXml, {
        y: '0',
        cy: TESTIMONY_TITLE_CY,
        szReplacements: [['4800', TESTIMONY_TITLE_SZ]],
      });
    }
    // 正文原 y≈781125，加高页眉后会叠进标题；下推并钳制底部
    let out = bumpShapeMinY(shapeXml, TESTIMONY_BODY_MIN_Y);
    out = clampShapeBottom(out, 5_060_000);
    return out;
  });
}

export async function stabilizeTestimonySlideInZip(zip: JSZip): Promise<void> {
  const path = 'ppt/slides/slide33.xml';
  const entry = zip.file(path);
  if (!entry) return;
  zip.file(path, stabilizeTestimonySlideXml(await entry.async('string')));
}

/** 下主日服事 P34 两处标题栏（略矮于 1.1M，给名单/岗位留空） */
const ROSTER_TITLE_CY = '980000';
const ROSTER_TITLE_SZ = '3600';
const ROSTER_TODAY_NAMES_MIN_Y = 1_060_000;
const ROSTER_ROLES_MIN_Y = 2_880_000;

/**
 * 下主日服事 P34：「今日清潔輪值」「下主日服事輪值」单行，并把名单/岗位下推防叠字。
 */
export function stabilizeServiceRosterSlideXml(xml: string): string {
  if (!xml.includes('清潔輪值') && !xml.includes('服事輪值')) return xml;
  return xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (shapeXml) => {
    const isToday = shapeXml.includes('今日') && shapeXml.includes('清潔輪值');
    const isNext = shapeXml.includes('下主日') && shapeXml.includes('服事輪值');
    // 今日名单框：宽幅、原 y=982700、不含岗位
    const isTodayNamesBox =
      !isToday &&
      !isNext &&
      !shapeXml.includes('主席：') &&
      /y="982700"/.test(shapeXml);
    const isRoles = shapeXml.includes('主席：') && shapeXml.includes('敬拜：');
    if (!isToday && !isNext && !isTodayNamesBox && !isRoles) return shapeXml;

    if (isToday || isNext) {
      return stabilizeWideHeaderTitleShape(shapeXml, {
        y: isToday ? '0' : undefined,
        cy: ROSTER_TITLE_CY,
        szReplacements: [['4400', ROSTER_TITLE_SZ]],
      });
    }
    if (isTodayNamesBox) {
      return bumpShapeMinY(shapeXml, ROSTER_TODAY_NAMES_MIN_Y);
    }
    if (isRoles) {
      let out = bumpShapeMinY(shapeXml, ROSTER_ROLES_MIN_Y);
      out = clampShapeBottom(out, 5_060_000);
      return out;
    }
    return shapeXml;
  });
}

export async function stabilizeServiceRosterSlideInZip(zip: JSZip): Promise<void> {
  const path = 'ppt/slides/slide34.xml';
  const entry = zip.file(path);
  if (!entry) return;
  zip.file(path, stabilizeServiceRosterSlideXml(await entry.async('string')));
}

/**
 * 生日 P24：页眉单行；页脚两行加行距防白底叠字。
 */
export function stabilizeBirthdayTitleSlideXml(xml: string): string {
  if (!xml.includes('生日的家人') && !xml.includes('午餐聚會')) return xml;
  return xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (shapeXml) => {
    if (shapeXml.includes('生日的家人')) {
      let out = shapeXml;
      out = out.replace(/(<a:bodyPr\b[^>]*\bwrap=")square(")/, `$1none$2`);
      out = out.replace(/\btIns="\d+"/, 'tIns="0"');
      out = out.replace(/\bbIns="\d+"/, 'bIns="0"');
      out = out.replace(/\bsz="3300"/g, 'sz="3000"');
      out = out.replace(/\bsz="4600"/g, 'sz="4000"');
      return out;
    }
    if (shapeXml.includes('午餐聚會') || shapeXml.includes('生日蛋糕')) {
      let out = shapeXml;
      // 原 90% 行距导致两行高亮底互相压住
      out = out.replace(/spcPct val="90000"/g, 'spcPct val="135000"');
      out = out.replace(/(<a:ext cx="4893900" )cy="\d+"\/>/, `$1cy="1150000"/>`);
      out = out.replace(/\bsz="2800"/g, 'sz="2600"');
      return out;
    }
    return shapeXml;
  });
}

export async function stabilizeBirthdayTitleSlideInZip(
  zip: JSZip,
  birthdayMonth?: string | null,
  serviceDate?: string | null,
): Promise<void> {
  const { month } = resolveBirthdayFields({ birthdayMonth, serviceDate });
  const path = `ppt/slides/slide${slideNumberForBirthdayMonth(month)}.xml`;
  const entry = zip.file(path);
  if (!entry) return;
  zip.file(path, stabilizeBirthdayTitleSlideXml(await entry.async('string')));
}

function bumpShapeMinY(shapeXml: string, minY: number): string {
  return shapeXml.replace(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/, (_full, x: string, y: string) => {
    const nextY = Math.max(Number(y), minY);
    return `<a:off x="${x}" y="${nextY}"/>`;
  });
}

function clampShapeBottom(shapeXml: string, maxEnd: number): string {
  return shapeXml.replace(
    /<a:off x="(-?\d+)" y="(-?\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/,
    (_full, x: string, y: string, cx: string, cy: string) => {
      const top = Number(y);
      let h = Number(cy);
      if (top + h > maxEnd) h = Math.max(200_000, maxEnd - top);
      return `<a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${h}"/>`;
    },
  );
}

/**
 * 奉献报告 P19：标题中英单行、金额行不换行且居中对齐。
 * 不增删 indexed text run，以免破坏金额/日期 textIndex。
 */
export function stabilizeOfferingReportSlideXml(xml: string): string {
  if (!xml.includes('Church Tithes and Offering Report') || !xml.includes('十一奉獻')) {
    return xml;
  }

  // 按 shape 拆开处理，避免误改背景等无关文本框
  return xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (shapeXml) => {
    const isTitle =
      shapeXml.includes('Church Tithes and Offering Report') && shapeXml.includes('奉獻');
    const isBody = shapeXml.includes('十一奉獻') && shapeXml.includes('其他奉獻');
    if (!isTitle && !isBody) return shapeXml;

    let out = shapeXml;

    if (isTitle) {
      out = out.replace(/(<a:bodyPr\b[^>]*\bwrap=")square(")/, `$1none$2`);
      out = out.replace(
        /(<a:off\b[^/]*\/>\s*<a:ext\b[^>]*\bcx="9144000"\s+)cy="\d+"/,
        `$1cy="${OFFERING_TITLE_BOX_CY}"`,
      );
      // 标题 shape 内仅有中文 48pt / 间隔 32pt / 英文 30pt
      out = out.replace(/\bsz="4800"/g, `sz="${OFFERING_TITLE_ZH_SZ}"`);
      out = out.replace(/\bsz="3200"/g, `sz="${OFFERING_TITLE_EN_SZ}"`);
      out = out.replace(/\bsz="3000"/g, `sz="${OFFERING_TITLE_EN_SZ}"`);
    }

    if (isBody) {
      out = out.replace(/(<a:bodyPr\b[^>]*\bwrap=")square(")/, `$1none$2`);
      // 「其他奉獻」行原为左对齐 + 前导空格，金额易被挤到下一行
      out = out.replace(/<a:pPr([^>]*?)\balgn="l"/g, '<a:pPr$1algn="ctr"');
      // 保留空格 run（占 textIndex），缩成单个空格，避免顶开居中排版
      out = out.replace(/<a:t>(\s{2,})<\/a:t>/g, '<a:t> </a:t>');
      // 金额尾随空格去掉，减少行宽
      out = out.replace(/<a:t>(\$[\d,]+\.\d{2}) <\/a:t>/g, '<a:t>$1</a:t>');
      // 标签后空格统一为两个，视觉整齐
      out = out.replace(/<a:t>\(Tithes\):\s*<\/a:t>/g, '<a:t>(Tithes):  </a:t>');
      out = out.replace(/<a:t>\(Other\):\s*<\/a:t>/g, '<a:t>(Other):  </a:t>');
      out = out.replace(/<a:t>\(Total\):\s*<\/a:t>/g, '<a:t>(Total):  </a:t>');
      // 日期冒号后留空，避免「上週奉獻:06/07」挤在一起
      out = out.replace(
        /(<a:t>上週奉獻<\/a:t><\/a:r>\s*<a:r>[\s\S]*?<a:t>):(<\/a:t>)/,
        '$1: $2',
      );
    }

    return out;
  });
}

export async function stabilizeOfferingReportSlideInZip(zip: JSZip): Promise<void> {
  const path = `ppt/slides/slide${OFFERING_REPORT_SLIDE_FILE}.xml`;
  const entry = zip.file(path);
  if (!entry) return;
  const xml = await entry.async('string');
  zip.file(path, stabilizeOfferingReportSlideXml(xml));
}

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

    let updated = runXml.replace(/<a:t([^>]*)>[\s\S]*?<\/a:t>/, (_full, attrs: string) => {
      // 必须用函数替换：金额含 `$1` 时字符串替换会把 `$1` 当成捕获组
      return `<a:t${attrs}>${escapeXml(rep.text)}</a:t>`;
    });
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

export type SlideTextOverride = {
  slide: number;
  textIndex: number;
  text: string;
};

export type AnnouncementPageInput = {
  title?: string;
  body?: string;
};

type PptxInputBytes = Buffer | Uint8Array;

export type BulletinPreviewPatchInput = {
  serviceDate?: string;
  serviceTime?: string;
  scriptureBook?: string;
  scriptureReference?: string;
  /** 是否在会前祷告第 2 页显示主席姓名 */
  showPreServiceChairName?: boolean;
  /** 主席姓名（单人） */
  preServiceChairNames?: string;
  /** 生日月份编号 1–12（字符串） */
  birthdayMonth?: string;
  /** 生日名单：JSON `{ "1": "甲\\n乙", ... }` 或旧扁平字符串 */
  birthdayNames?: string;
  /** 本週金句（P35：整句写入 textIndex 16，并清空 17–19） */
  verseOfWeek?: string;
  /** 动态公告（P25 版式；第 2 条起加页，插在 P27 前） */
  announcements?: AnnouncementPageInput[];
  /** 未隐藏的公告条数；用于 0/1 条时删 P25/P26 */
  visibleAnnouncementCount?: number | null;
  hiddenSections?: string[];
  skipTestimonyWeek?: boolean;
  skipDepartmentReports?: boolean;
  weeklyMeetingVariant?: number | null;
  /** 幻灯片文字覆盖（slide 文件号 + textIndex） */
  slideTextOverrides?: SlideTextOverride[];
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

/**
 * 对整个 PPTX 再跑一遍文字覆盖（indexed run 替换）。
 * 用于分区 splice 之后：分区快照整页替换会带回旧文字，这里让表单/覆盖文字重新盖上，
 * 只替换 run 文本、保留手动样式。
 */
export async function applySlideTextOverridesToPptx(
  template: PptxInputBytes,
  overrides: readonly SlideTextOverride[],
): Promise<Uint8Array> {
  const norm = normalizeSlideTextOverrides(overrides);
  const zip = await JSZip.loadAsync(template);
  if (norm.length) await applySlideTextOverridesToZip(zip, norm);
  return zip.generateAsync({ type: 'uint8array' });
}

/**
 * 分区 splice 之后重打「表单语义字段」（不改页结构、不加读经页）。
 * 封面日期、会前主席、生日、金句、slideTextOverrides 都以当前表单为准；
 * 手动改过的字体/颜色等样式尽量保留（indexed 替换只动文字）。
 *
 * 若某分区已用自定义 PPT 整段替换，应跳过该区回写，否则会盖掉上传内容。
 */
export type BulletinFormFieldReapplyOptions = {
  skipCover?: boolean;
  skipPreService?: boolean;
  skipBirthday?: boolean;
  skipVerseOfWeek?: boolean;
  /** 跳过这些模板页号上的 slideTextOverrides */
  skipSlideNumbers?: ReadonlySet<number> | readonly number[];
};

export async function reapplyBulletinFormFieldsInPptx(
  template: PptxInputBytes,
  input: Pick<
    BulletinPreviewPatchInput,
    | 'serviceDate'
    | 'serviceTime'
    | 'showPreServiceChairName'
    | 'preServiceChairNames'
    | 'birthdayMonth'
    | 'birthdayNames'
    | 'verseOfWeek'
    | 'slideTextOverrides'
  >,
  options: BulletinFormFieldReapplyOptions = {},
): Promise<Uint8Array> {
  let buf: PptxInputBytes = template;
  if (input.serviceDate && !options.skipCover) {
    buf = await patchCoverSlideInPptx(buf, {
      serviceDate: input.serviceDate,
      serviceTime: input.serviceTime,
    });
  }

  const zip = await JSZip.loadAsync(buf);
  const showChair = Boolean(input.showPreServiceChairName);
  const chairName = input.preServiceChairNames?.trim() ?? '';
  if (!options.skipPreService && showChair && chairName) {
    const slide2 = zip.file('ppt/slides/slide2.xml');
    if (slide2) {
      const xml = await slide2.async('string');
      zip.file('ppt/slides/slide2.xml', patchPreServiceChairNameOnSlide2Xml(xml, chairName));
    }
  }

  const skipSlides = new Set(
    options.skipSlideNumbers instanceof Set
      ? options.skipSlideNumbers
      : (options.skipSlideNumbers ?? []),
  );
  const overrides = normalizeSlideTextOverrides(input.slideTextOverrides).filter(
    (o) => !skipSlides.has(o.slide),
  );
  if (overrides.length) {
    await applySlideTextOverridesToZip(zip, overrides);
  }

  // 表单字段最后回写，确保生日/金句预览跟左侧输入一致
  if (!options.skipBirthday) {
    await applyBirthdayFieldsToZip(
      zip,
      input.birthdayMonth,
      input.birthdayNames,
      input.serviceDate,
    );
  }
  if (!options.skipVerseOfWeek) {
    await applyVerseOfWeekToZip(zip, input.verseOfWeek);
  }

  return zip.generateAsync({ type: 'uint8array' });
}

export function buildBirthdaySlideReplacements(
  _birthdayMonth: string,
  _birthdayNames?: string,
): TextRunReplacement[] {
  // 月份标题已在各月模板页内；名单走 applyBirthdayNameGridToSlideXml
  return [];
}

async function applyBirthdayFieldsToZip(
  zip: JSZip,
  birthdayMonth: string | undefined,
  birthdayNames: string | undefined,
  serviceDate?: string,
): Promise<void> {
  if (birthdayMonth === undefined && birthdayNames === undefined) return;
  const { namesForMonth } = resolveBirthdayFields({
    birthdayMonth,
    birthdayNames,
    serviceDate,
  });
  // 名单改在幻灯片上编辑；仅当表单仍有当月名单时才覆盖 grid，避免清空月库页内容
  if (birthdayNames === undefined || !namesForMonth) return;
  const slideNum = BIRTHDAY_ANCHOR_SLIDE;
  const entry = zip.file(`ppt/slides/slide${slideNum}.xml`);
  if (!entry) return;
  let xml = await entry.async('string');
  xml = applyBirthdayNameGridToSlideXml(xml, namesForMonth);
  zip.file(`ppt/slides/slide${slideNum}.xml`, xml);
}

/**
 * P35 金句正文跨多个 run：16=`(书卷 章:节`、17=`)  `、18=经文。
 * 表单是整段文字，须写入 16 并清空 17–19，否则模板里残留的书卷名会再显示一次。
 */
export function buildVerseOfWeekSlideReplacements(verseOfWeek: string): TextRunReplacement[] {
  const verse = verseOfWeek.trim();
  if (!verse) return [];
  return [
    { textIndex: 16, text: verse },
    { textIndex: 17, text: ' ' },
    { textIndex: 18, text: ' ' },
    { textIndex: 19, text: ' ' },
  ];
}

async function applyVerseOfWeekToZip(zip: JSZip, verseOfWeek: string | undefined): Promise<void> {
  const reps = buildVerseOfWeekSlideReplacements(verseOfWeek ?? '');
  if (!reps.length) return;
  const entry = zip.file('ppt/slides/slide35.xml');
  if (!entry) return;
  const xml = await entry.async('string');
  zip.file('ppt/slides/slide35.xml', applyIndexedTextReplacementsToSlideXml(xml, reps));
}

/** 画幅高 5_143_500；正文贴到近底部，减少长公告被裁切 */
const ANNOUNCEMENT_BODY_BOTTOM_EMU = 5_000_000;
/** 正文 26pt（模板 30pt），多留几行 */
const ANNOUNCEMENT_BODY_FONT_SZ = '2600';

/**
 * 公告正文框加高、略缩字号。仅处理 P25 式「大块 anchor=t」正文 shape。
 */
export function stabilizeAnnouncementSlideXml(xml: string): string {
  return xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (shapeXml) => {
    if (!/<a:bodyPr\b[^>]*\banchor="t"/.test(shapeXml)) return shapeXml;
    const ext = shapeXml.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    const off = shapeXml.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/);
    if (!ext || !off) return shapeXml;
    const cy = Number(ext[2]);
    if (cy < 2_000_000) return shapeXml;
    const y = Number(off[2]);
    const newCy = Math.max(cy, ANNOUNCEMENT_BODY_BOTTOM_EMU - y);
    let out = shapeXml.replace(/(<a:ext cx="\d+" )cy="\d+"\/>/, `$1cy="${newCy}"/>`);
    out = out.replace(/sz="3000"/g, `sz="${ANNOUNCEMENT_BODY_FONT_SZ}"`);
    return out;
  });
}

function buildAnnouncementBodyTxBody(body: string): string {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const paras = (lines.length ? lines : [' ']).map((line) => {
    const text = line.length ? line : ' ';
    return (
      `<a:p><a:pPr indent="0" lvl="0" marL="0" rtl="0" algn="l">` +
      `<a:spcBef><a:spcPts val="0"/></a:spcBef>` +
      `<a:spcAft><a:spcPts val="400"/></a:spcAft><a:buNone/></a:pPr>` +
      `<a:r><a:rPr lang="zh-CN" sz="${ANNOUNCEMENT_BODY_FONT_SZ}">` +
      `<a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:rPr>` +
      `<a:t>${escapeXml(text)}</a:t></a:r>` +
      `<a:endParaRPr sz="${ANNOUNCEMENT_BODY_FONT_SZ}">` +
      `<a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:endParaRPr></a:p>`
    );
  });
  return (
    `<p:txBody>` +
    `<a:bodyPr anchorCtr="0" anchor="t" bIns="91425" lIns="91425" spcFirstLastPara="1" rIns="91425" wrap="square" tIns="91425">` +
    `<a:noAutofit/></a:bodyPr><a:lstStyle/>` +
    paras.join('') +
    `</p:txBody>`
  );
}

function writeAnnouncementTitleBody(xml: string, item: AnnouncementPageInput): string {
  const title = item.title?.trim() ? item.title.trim() : ' ';
  const body = item.body?.trim() ? item.body.trim() : ' ';
  // 标题仍按 run 序号；正文整段重写（支持换行，并去掉模板残留段落）
  let out = applyIndexedTextReplacementsToSlideXml(xml, [{ textIndex: 0, text: title }]);
  out = out.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (shapeXml) => {
    if (!/<a:bodyPr\b[^>]*\banchor="t"/.test(shapeXml)) return shapeXml;
    const ext = shapeXml.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    if (!ext || Number(ext[2]) < 2_000_000) return shapeXml;
    return shapeXml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, buildAnnouncementBodyTxBody(body));
  });
  return out;
}

/**
 * 公告页：一律用 P25「标题+正文」版式。
 * 第 1 条写 P25；第 2 条起复制 P25（含 layout rels），插在公告段末、P27 前。
 * 勿把 P25 XML 塞进模板 P26：P26 仍指向 slideLayout12，预览会整页黑屏。
 */
export async function applyAnnouncementPagesToZip(
  zip: JSZip,
  items: readonly AnnouncementPageInput[],
): Promise<void> {
  const pages = [...items];
  if (!pages.length) return;

  const slide25Path = 'ppt/slides/slide25.xml';
  const slide25 = zip.file(slide25Path);
  if (!slide25) return;

  const layout = stabilizeAnnouncementSlideXml(await slide25.async('string'));
  zip.file(slide25Path, writeAnnouncementTitleBody(layout, pages[0]!));

  let lastPath = slide25Path;
  for (let i = 1; i < pages.length; i++) {
    lastPath = await duplicateSlideInZip(zip, slide25Path, {
      insertAfterPath: lastPath,
    });
    const entry = zip.file(lastPath);
    if (!entry) continue;
    const xml = await entry.async('string');
    zip.file(lastPath, writeAnnouncementTitleBody(xml, pages[i]!));
  }
}

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

  // 圣餐英文页：模板约 28–31pt + spAutoFit；LibreOffice 不缩字会裁切经文
  await stabilizeCommunionEnglishSlidesInZip(zip);
  // 奉献报告：标题中英单行、十一/其他金额与 label 同行居中
  await stabilizeOfferingReportSlideInZip(zip);

  // 先铺通用文字覆盖，再写表单语义字段（生日/金句/公告），避免旧 slideTextOverrides 盖掉表单
  const overrides = normalizeSlideTextOverrides(input.slideTextOverrides);
  if (overrides.length) {
    await applySlideTextOverridesToZip(zip, overrides);
  }

  const hideBirthday = bulletinSlidePathsToDelete(input).some((p) =>
    p.includes(`slide${BIRTHDAY_ANCHOR_SLIDE}.xml`),
  );
  if (!hideBirthday) {
    // 从独立月库取出当月页，覆写主模板生日锚点
    const withMonth = await applyBirthdayMonthFromLibraryToPptx(
      await zip.generateAsync({ type: 'uint8array' }),
      {
        birthdayMonth: input.birthdayMonth,
        serviceDate: input.serviceDate,
      },
    );
    zip = await JSZip.loadAsync(withMonth);
  }

  await applyBirthdayFieldsToZip(
    zip,
    input.birthdayMonth,
    input.birthdayNames,
    input.serviceDate,
  );
  await applyVerseOfWeekToZip(zip, input.verseOfWeek);

  // 顶栏标题单行/防裁切（须在文字覆盖之后，保留几何修正）
  await stabilizeBirthdayTitleSlideInZip(zip, input.birthdayMonth, input.serviceDate);
  await stabilizeStaffMeetingSlideInZip(zip);
  await stabilizeRotationSlideInZip(zip);
  await stabilizeTestimonySlideInZip(zip);
  await stabilizeServiceRosterSlideInZip(zip);

  const announcementCount =
    input.visibleAnnouncementCount ?? input.announcements?.length ?? 0;
  const removePaths = bulletinSlidePathsToDelete({
    ...input,
    visibleAnnouncementCount: announcementCount,
  });
  // 先按模板文件号删页，再加公告复制页，避免复制后 slide 编号漂移误删
  if (removePaths.length) {
    await removeSlidesFromPptxZip(zip, removePaths);
  }
  if (announcementCount > 0 && input.announcements?.length) {
    await applyAnnouncementPagesToZip(zip, input.announcements.slice(0, announcementCount));
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
