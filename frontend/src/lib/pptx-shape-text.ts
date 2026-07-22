/** 将纯文本写入幻灯片中第 N 个带文字的形状（0-based） */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstRunPr(spXml: string): string {
  return (
    spXml.match(/<a:r>[\s\S]*?(<a:rPr\b[^/]*\/>)/)?.[1] ??
    spXml.match(/<a:r>[\s\S]*?(<a:rPr\b[\s\S]*?<\/a:rPr>)/)?.[1] ??
    '<a:rPr lang="zh-CN"/>'
  );
}

function firstParaPr(spXml: string): string {
  const m = spXml.match(/<a:pPr\b[^>]*\/>/)?.[0] ?? spXml.match(/<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/)?.[0];
  return m ?? '<a:pPr/>';
}

function bodyPrXml(spXml: string): string {
  return (
    spXml.match(/<a:bodyPr\b[^/]*\/>/)?.[0] ??
    spXml.match(/<a:bodyPr\b[\s\S]*?<\/a:bodyPr>/)?.[0] ??
    '<a:bodyPr/>'
  );
}

function replaceShapeTxBody(spXml: string, plainText: string): string {
  const lines = plainText.replace(/\r\n/g, '\n').split('\n');
  const rPr = firstRunPr(spXml);
  const pPr = firstParaPr(spXml);
  const bodyPr = bodyPrXml(spXml);
  const paragraphs =
    lines.length === 0
      ? `<a:p>${pPr}<a:endParaRPr/></a:p>`
      : lines
          .map((line) => {
            const t = escapeXml(line);
            // OOXML：空 <a:t> 需保留空格时用 xml:space；纯空行用空格占位
            const tTag = line === '' ? `<a:t xml:space="preserve"> </a:t>` : `<a:t>${t}</a:t>`;
            return `<a:p>${pPr}<a:r>${rPr}${tTag}</a:r></a:p>`;
          })
          .join('');
  const newTxBody = `<p:txBody>${bodyPr}<a:lstStyle/>${paragraphs}</p:txBody>`;
  if (/<p:txBody>[\s\S]*?<\/p:txBody>/.test(spXml)) {
    return spXml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, newTxBody);
  }
  return spXml;
}

/**
 * 按「带 txBody 的 p:sp」顺序，把 plainText（换行=段落）写入第 shapeIndex 个形状。
 */
export function applyShapePlainTextToSlideXml(
  xml: string,
  shapeIndex: number,
  plainText: string,
): string {
  if (!Number.isFinite(shapeIndex) || shapeIndex < 0) return xml;
  let textShapeCount = -1;
  return xml.replace(/<p:sp>([\s\S]*?)<\/p:sp>/g, (full) => {
    if (!full.includes('<p:txBody>')) return full;
    textShapeCount += 1;
    if (textShapeCount !== shapeIndex) return full;
    return replaceShapeTxBody(full, plainText);
  });
}

export function shapeParagraphsToPlainText(
  paragraphs: { spacer?: boolean; runs: { text: string }[] }[],
): string {
  return paragraphs
    .filter((p) => !p.spacer)
    .map((p) => p.runs.map((r) => r.text).join(''))
    .join('\n');
}
