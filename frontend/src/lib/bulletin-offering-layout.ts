/**
 * 与 shared/bulletin-pptx-patch.stabilizeOfferingReportSlideXml 同逻辑；
 * 前端避免从 @file-service/shared 整包引入（会拖进 Node 模块）。
 */

const OFFERING_TITLE_BOX_CY = '980000';
const OFFERING_TITLE_ZH_SZ = '4000';
const OFFERING_TITLE_EN_SZ = '2400';

/** 奉献报告 P19：标题中英单行、金额行不换行且居中对齐。 */
export function stabilizeOfferingReportSlideXml(xml: string): string {
  if (!xml.includes('Church Tithes and Offering Report') || !xml.includes('十一奉獻')) {
    return xml;
  }

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
      out = out.replace(/\bsz="4800"/g, `sz="${OFFERING_TITLE_ZH_SZ}"`);
      out = out.replace(/\bsz="3200"/g, `sz="${OFFERING_TITLE_EN_SZ}"`);
      out = out.replace(/\bsz="3000"/g, `sz="${OFFERING_TITLE_EN_SZ}"`);
    }

    if (isBody) {
      out = out.replace(/(<a:bodyPr\b[^>]*\bwrap=")square(")/, `$1none$2`);
      out = out.replace(/<a:pPr([^>]*?)\balgn="l"/g, '<a:pPr$1algn="ctr"');
      out = out.replace(/<a:t>(\s{2,})<\/a:t>/g, '<a:t> </a:t>');
      out = out.replace(/<a:t>(\$[\d,]+\.\d{2}) <\/a:t>/g, '<a:t>$1</a:t>');
      out = out.replace(/<a:t>\(Tithes\):\s*<\/a:t>/g, '<a:t>(Tithes):  </a:t>');
      out = out.replace(/<a:t>\(Other\):\s*<\/a:t>/g, '<a:t>(Other):  </a:t>');
      out = out.replace(/<a:t>\(Total\):\s*<\/a:t>/g, '<a:t>(Total):  </a:t>');
      out = out.replace(
        /(<a:t>上週奉獻<\/a:t><\/a:r>\s*<a:r>[\s\S]*?<a:t>):(<\/a:t>)/,
        '$1: $2',
      );
    }

    return out;
  });
}
