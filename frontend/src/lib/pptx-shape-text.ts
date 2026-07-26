/** 幻灯片文本形状：纯文本 + 基础样式写回 OOXML */

export type ShapeTextStyle = {
  text: string;
  fontFamily?: string;
  fontSizePt?: number;
  bold?: boolean;
  italic?: boolean;
};

export type ShapeTextOverrideValue = string | ShapeTextStyle;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function normalizeShapeTextOverride(
  value: ShapeTextOverrideValue | undefined,
  fallbackText = '',
): ShapeTextStyle {
  if (value == null) return { text: fallbackText };
  if (typeof value === 'string') return { text: value };
  return {
    text: value.text ?? fallbackText,
    fontFamily: value.fontFamily,
    fontSizePt: value.fontSizePt,
    bold: value.bold,
    italic: value.italic,
  };
}

export function shapeTextOverrideEquals(
  a: ShapeTextOverrideValue | undefined,
  b: ShapeTextOverrideValue | undefined,
): boolean {
  const na = normalizeShapeTextOverride(a);
  const nb = normalizeShapeTextOverride(b);
  return (
    na.text === nb.text &&
    (na.fontFamily ?? '') === (nb.fontFamily ?? '') &&
    (na.fontSizePt ?? 0) === (nb.fontSizePt ?? 0) &&
    Boolean(na.bold) === Boolean(nb.bold) &&
    Boolean(na.italic) === Boolean(nb.italic)
  );
}

function firstRunPr(spXml: string): string {
  // 自闭合必须用 [^>]*\/>：旧写法 [^/]*\/> 会把
  // <a:rPr ...><a:solidFill><a:srgbClr val="…"/> 误当成完整 rPr，
  // 写出缺 </a:rPr> 的坏 XML，保存后被 well-formed 检查丢掉。
  return (
    spXml.match(/<a:r>\s*(<a:rPr\b[^>]*\/>)/)?.[1] ??
    spXml.match(/<a:r>\s*(<a:rPr\b[\s\S]*?<\/a:rPr>)/)?.[1] ??
    '<a:rPr lang="zh-CN"/>'
  );
}

function firstParaPr(spXml: string): string {
  const m =
    spXml.match(/<a:pPr\b[^>]*\/>/)?.[0] ??
    spXml.match(/<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/)?.[0];
  return m ?? '<a:pPr/>';
}

function bodyPrXml(spXml: string): string {
  // 与 firstRunPr 相同：自闭合必须 [^>]*\/>，否则会吃掉子标签的 />
  return (
    spXml.match(/<a:bodyPr\b[^>]*\/>/)?.[0] ??
    spXml.match(/<a:bodyPr\b[\s\S]*?<\/a:bodyPr>/)?.[0] ??
    '<a:bodyPr/>'
  );
}

function buildRunPr(base: string, style: ShapeTextStyle): string {
  let rPr = base.includes('<a:rPr') ? base : '<a:rPr lang="zh-CN"/>';

  if (style.fontSizePt != null && Number.isFinite(style.fontSizePt) && style.fontSizePt > 0) {
    const sz = Math.round(style.fontSizePt * 100);
    if (/\ssz="\d+"/.test(rPr)) rPr = rPr.replace(/\ssz="\d+"/, ` sz="${sz}"`);
    else rPr = rPr.replace(/<a:rPr\b/, `<a:rPr sz="${sz}"`);
  }

  if (style.bold != null) {
    if (/\sb="[^"]*"/.test(rPr)) rPr = rPr.replace(/\sb="[^"]*"/, style.bold ? ' b="1"' : '');
    else if (style.bold) rPr = rPr.replace(/<a:rPr\b/, '<a:rPr b="1"');
  } else if (style.bold === false) {
    rPr = rPr.replace(/\sb="[^"]*"/, '');
  }

  if (style.italic != null) {
    if (/\si="[^"]*"/.test(rPr)) rPr = rPr.replace(/\si="[^"]*"/, style.italic ? ' i="1"' : '');
    else if (style.italic) rPr = rPr.replace(/<a:rPr\b/, '<a:rPr i="1"');
  }

  if (style.fontFamily?.trim()) {
    const face = escapeXml(style.fontFamily.trim());
    const latin = `<a:latin typeface="${face}"/>`;
    const ea = `<a:ea typeface="${face}"/>`;
    const cs = `<a:cs typeface="${face}"/>`;
    // strip existing typeface nodes then inject
    rPr = rPr
      .replace(/<a:latin\b[^/]*\/>/g, '')
      .replace(/<a:latin\b[\s\S]*?<\/a:latin>/g, '')
      .replace(/<a:ea\b[^/]*\/>/g, '')
      .replace(/<a:ea\b[\s\S]*?<\/a:ea>/g, '')
      .replace(/<a:cs\b[^/]*\/>/g, '')
      .replace(/<a:cs\b[\s\S]*?<\/a:cs>/g, '');
    if (rPr.endsWith('/>')) {
      rPr = rPr.replace(/\/>$/, `>${latin}${ea}${cs}</a:rPr>`);
    } else if (rPr.includes('</a:rPr>')) {
      rPr = rPr.replace('</a:rPr>', `${latin}${ea}${cs}</a:rPr>`);
    }
  }

  // clean empty bold=false leftovers: remove bare ` b="0"` etc already handled
  rPr = rPr.replace(/\s{2,}/g, ' ');
  return rPr;
}

function decodeXmlText(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function shapePlainText(spXml: string): string {
  const txBody = spXml.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/)?.[1] ?? '';
  const paras = [...txBody.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)];
  return paras
    .map((p) =>
      [...p[1].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
        .map((m) => decodeXmlText(m[1]))
        .join(''),
    )
    .join('\n');
}

type ParsedRun = { rPr: string; text: string };

function parseParaRuns(paraInner: string): { pPr: string; endPr: string; runs: ParsedRun[] } {
  const pPr =
    paraInner.match(/<a:pPr\b[^>]*\/>/)?.[0] ??
    paraInner.match(/<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/)?.[0] ??
    '<a:pPr/>';
  const endPr =
    paraInner.match(/<a:endParaRPr\b[^>]*\/>/)?.[0] ??
    paraInner.match(/<a:endParaRPr\b[\s\S]*?<\/a:endParaRPr>/)?.[0] ??
    '<a:endParaRPr/>';
  const runs: ParsedRun[] = [];
  for (const m of paraInner.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)) {
    const inner = m[1];
    const rPr =
      inner.match(/<a:rPr\b[^>]*\/>/)?.[0] ??
      inner.match(/<a:rPr\b[\s\S]*?<\/a:rPr>/)?.[0] ??
      '<a:rPr lang="zh-CN"/>';
    const text = [...inner.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
      .map((t) => decodeXmlText(t[1]))
      .join('');
    runs.push({ rPr, text });
  }
  return { pPr, endPr, runs };
}

/** 把新段落文字按旧 run 长度比例铺回去，保留每个 run 的 rPr（颜色/字号等） */
function remapRuns(oldRuns: ParsedRun[], newText: string, fallbackRPr: string): ParsedRun[] {
  if (!newText) {
    const base = oldRuns[0]?.rPr ?? fallbackRPr;
    return [{ rPr: base, text: '' }];
  }
  if (oldRuns.length <= 1) {
    return [{ rPr: oldRuns[0]?.rPr ?? fallbackRPr, text: newText }];
  }
  const oldTotal = oldRuns.reduce((sum, r) => sum + r.text.length, 0);
  if (oldTotal <= 0) {
    return [{ rPr: oldRuns[0]?.rPr ?? fallbackRPr, text: newText }];
  }
  // 正文没变：原样保留（避免无意义重写）
  const oldJoined = oldRuns.map((r) => r.text).join('');
  if (oldJoined === newText) return oldRuns;

  let allocated = 0;
  const out: ParsedRun[] = [];
  for (let i = 0; i < oldRuns.length; i += 1) {
    const isLast = i === oldRuns.length - 1;
    const len = isLast
      ? newText.length - allocated
      : Math.max(0, Math.round((newText.length * oldRuns[i].text.length) / oldTotal));
    const text = newText.slice(allocated, allocated + len);
    allocated += len;
    if (text.length === 0 && !isLast) continue;
    out.push({ rPr: oldRuns[i].rPr, text });
  }
  if (!out.length) out.push({ rPr: oldRuns[0].rPr, text: newText });
  return out;
}

function serializePara(pPr: string, runs: ParsedRun[], endPr: string): string {
  const runXml = runs
    .map((run) => {
      const tTag =
        run.text === ''
          ? `<a:t xml:space="preserve"></a:t>`
          : /\s$|^\s/.test(run.text)
            ? `<a:t xml:space="preserve">${escapeXml(run.text)}</a:t>`
            : `<a:t>${escapeXml(run.text)}</a:t>`;
      return `<a:r>${run.rPr}${tTag}</a:r>`;
    })
    .join('');
  return `<a:p>${pPr}${runXml}${endPr}</a:p>`;
}

/**
 * 只改文字，尽量保留原段落/run 的颜色、字号、字体。
 * 未改动的段落 XML 原样保留；改动的段落按旧 run 比例重铺。
 */
export function rewriteShapeTextPreservingRuns(spXml: string, newText: string): string {
  const normalized = newText.replace(/\r\n/g, '\n');
  if (shapePlainText(spXml) === normalized) return spXml;

  const txBodyMatch = spXml.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/);
  if (!txBodyMatch) return spXml;
  const txBody = txBodyMatch[1];
  const bodyPr = bodyPrXml(spXml);
  const lstStyle =
    txBody.match(/<a:lstStyle\b[^>]*\/>/)?.[0] ??
    txBody.match(/<a:lstStyle\b[\s\S]*?<\/a:lstStyle>/)?.[0] ??
    '<a:lstStyle/>';

  const oldParas = [...txBody.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((m) => ({
    full: m[0],
    ...parseParaRuns(m[1]),
  }));
  const newLines = normalized.split('\n');
  const fallbackRPr = firstRunPr(spXml);
  const fallbackPPr = firstParaPr(spXml);

  const nextParas = newLines.map((line, i) => {
    const old = oldParas[Math.min(i, Math.max(0, oldParas.length - 1))];
    if (old) {
      const oldLine = old.runs.map((r) => r.text).join('');
      if (oldLine === line && i < oldParas.length) return old.full;
      const runs = remapRuns(old.runs, line, fallbackRPr);
      return serializePara(old.pPr, runs, old.endPr);
    }
    return serializePara(fallbackPPr, [{ rPr: fallbackRPr, text: line }], '<a:endParaRPr/>');
  });

  const newTxBody = `<p:txBody>${bodyPr}${lstStyle}${nextParas.join('') || `<a:p>${fallbackPPr}<a:endParaRPr/></a:p>`}</p:txBody>`;
  return spXml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, newTxBody);
}

function replaceShapeTxBodyFlatten(spXml: string, style: ShapeTextStyle): string {
  const lines = style.text.replace(/\r\n/g, '\n').split('\n');
  const rPr = buildRunPr(firstRunPr(spXml), style);
  const pPr = firstParaPr(spXml);
  const bodyPr = bodyPrXml(spXml);
  const paragraphs =
    lines.length === 0
      ? `<a:p>${pPr}<a:endParaRPr/></a:p>`
      : lines
          .map((line) => {
            const tTag = line === '' ? `<a:t xml:space="preserve"> </a:t>` : `<a:t>${escapeXml(line)}</a:t>`;
            return `<a:p>${pPr}<a:r>${rPr}${tTag}</a:r></a:p>`;
          })
          .join('');
  const newTxBody = `<p:txBody>${bodyPr}<a:lstStyle/>${paragraphs}</p:txBody>`;
  if (/<p:txBody>[\s\S]*?<\/p:txBody>/.test(spXml)) {
    return spXml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, newTxBody);
  }
  return spXml;
}

function shapeStyleHasCharOverrides(style: ShapeTextStyle): boolean {
  return (
    style.fontFamily != null ||
    style.fontSizePt != null ||
    style.bold != null ||
    style.italic != null
  );
}

/**
 * 按「带 txBody 的 p:sp」顺序，把文字与样式写入第 shapeIndex 个形状。
 * - 仅改 text：保留原 run 颜色/字号（避免双击编辑后多色被压成单色）
 * - 同时带 bold/字号等：整框统一成该样式（显式整框格式化）
 */
export function applyShapeTextToSlideXml(
  xml: string,
  shapeIndex: number,
  value: ShapeTextOverrideValue,
): string {
  if (!Number.isFinite(shapeIndex) || shapeIndex < 0) return xml;
  const style = normalizeShapeTextOverride(value);
  const flatten = shapeStyleHasCharOverrides(style);
  let textShapeCount = -1;
  return xml.replace(/<p:sp>([\s\S]*?)<\/p:sp>/g, (full) => {
    if (!full.includes('<p:txBody>')) return full;
    textShapeCount += 1;
    if (textShapeCount !== shapeIndex) return full;
    return flatten
      ? replaceShapeTxBodyFlatten(full, style)
      : rewriteShapeTextPreservingRuns(full, style.text);
  });
}

/** @deprecated 使用 applyShapeTextToSlideXml */
export function applyShapePlainTextToSlideXml(
  xml: string,
  shapeIndex: number,
  plainText: string,
): string {
  return applyShapeTextToSlideXml(xml, shapeIndex, plainText);
}

export function shapeParagraphsToPlainText(
  paragraphs: { spacer?: boolean; runs: { text: string }[] }[],
): string {
  return paragraphs
    .filter((p) => !p.spacer)
    .map((p) => p.runs.map((r) => r.text).join(''))
    .join('\n');
}

export function shapeParagraphsToStyle(
  paragraphs: {
    spacer?: boolean;
    runs: { text: string; bold?: boolean; italic?: boolean; fontSizePt?: number; fontFamily?: string }[];
  }[],
): ShapeTextStyle {
  const text = shapeParagraphsToPlainText(paragraphs);
  const run = paragraphs.find((p) => !p.spacer && p.runs.length)?.runs[0];
  return {
    text,
    fontFamily: run?.fontFamily,
    fontSizePt: run?.fontSizePt,
    bold: run?.bold,
    italic: run?.italic,
  };
}
