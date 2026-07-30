/**
 * 与 shared/bulletin-pptx-patch 中顶栏标题 stabilize* 同逻辑；
 * 前端避免从 @file-service/shared 整包引入。
 */

function stabilizeWideHeaderTitleShape(
  shapeXml: string,
  opts: {
    y?: string;
    cy: string;
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

/** P32 服事轮值表标题 */
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
        cy: '1100000',
        szReplacements: [['4400', '3600']],
      });
    }
    if (isBody) {
      out = out.replace(/(<a:ext cx="8642700" )cy="\d+"\/>/, `$1cy="3400000"/>`);
    }
    return out;
  });
}

/** P31 同工会页眉 */
export function stabilizeStaffMeetingSlideXml(xml: string): string {
  if (!xml.includes('同工會')) return xml;
  return xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (shapeXml) => {
    if (!shapeXml.includes('同工會') || !shapeXml.includes('年')) return shapeXml;
    return stabilizeWideHeaderTitleShape(shapeXml, {
      y: '0',
      cy: '1200000',
      szReplacements: [
        ['6000', '4800'],
        ['5700', '4600'],
      ],
    });
  });
}

/** P33 下主日见证页眉 */
export function stabilizeTestimonySlideXml(xml: string): string {
  if (!xml.includes('見證分享')) return xml;
  return xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (shapeXml) => {
    if (!shapeXml.includes('下主日') || !shapeXml.includes('見證分享')) return shapeXml;
    return stabilizeWideHeaderTitleShape(shapeXml, {
      y: '0',
      cy: '1100000',
      szReplacements: [['4800', '3600']],
    });
  });
}

/** P34 今日清洁 / 下主日服事 标题 */
export function stabilizeServiceRosterSlideXml(xml: string): string {
  if (!xml.includes('清潔輪值') && !xml.includes('服事輪值')) return xml;
  return xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (shapeXml) => {
    const isToday = shapeXml.includes('今日') && shapeXml.includes('清潔輪值');
    const isNext = shapeXml.includes('下主日') && shapeXml.includes('服事輪值');
    if (!isToday && !isNext) return shapeXml;
    return stabilizeWideHeaderTitleShape(shapeXml, {
      y: isToday ? '0' : undefined,
      cy: '1100000',
      szReplacements: [['4400', '3600']],
    });
  });
}

/** P24 生日页眉单行 */
export function stabilizeBirthdayTitleSlideXml(xml: string): string {
  if (!xml.includes('生日的家人')) return xml;
  return xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (shapeXml) => {
    if (!shapeXml.includes('生日的家人')) return shapeXml;
    let out = shapeXml;
    out = out.replace(/(<a:bodyPr\b[^>]*\bwrap=")square(")/, `$1none$2`);
    out = out.replace(/\btIns="\d+"/, 'tIns="0"');
    out = out.replace(/\bbIns="\d+"/, 'bIns="0"');
    out = out.replace(/\bsz="3300"/g, 'sz="3000"');
    out = out.replace(/\bsz="4600"/g, 'sz="4000"');
    return out;
  });
}
