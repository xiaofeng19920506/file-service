/** a:rPr / a:pPr 这类「属性节点」的通用解析与按 schema 顺序重建 */

export function matchGenericEnd(xml: string, tag: string, openStart: number): number {
  const openRe = new RegExp(`<${tag}(?=[\\s>])`, 'g');
  const closeTag = `</${tag}>`;
  let depth = 0;
  let i = openStart;
  while (i < xml.length) {
    openRe.lastIndex = i;
    const open = openRe.exec(xml);
    const close = xml.indexOf(closeTag, i);
    if (close < 0) return -1;
    if (open && open.index < close) {
      depth += 1;
      i = open.index + 1;
    } else {
      depth -= 1;
      if (depth <= 0) return close + closeTag.length;
      i = close + closeTag.length;
    }
  }
  return -1;
}

/** 拆出一段 xml 的直接子元素 */
export function splitChildren(inner: string): { tag: string; xml: string }[] {
  const out: { tag: string; xml: string }[] = [];
  let i = 0;
  while (i < inner.length) {
    const lt = inner.indexOf('<', i);
    if (lt < 0) break;
    const m = /^<([\w:]+)(\s(?:"[^"]*"|[^>"])*?)?(\/?)>/.exec(inner.slice(lt));
    if (!m) break;
    if (m[3] === '/') {
      out.push({ tag: m[1], xml: inner.slice(lt, lt + m[0].length) });
      i = lt + m[0].length;
      continue;
    }
    const end = matchGenericEnd(inner, m[1], lt);
    if (end < 0) break;
    out.push({ tag: m[1], xml: inner.slice(lt, end) });
    i = end;
  }
  return out;
}

export type ParsedPr = {
  attrs: Map<string, string>;
  children: Map<string, string>;
  extra: string[];
};

export function parsePr(prXml: string, tagName: string, order: string[]): ParsedPr {
  const attrs = new Map<string, string>();
  const children = new Map<string, string>();
  const extra: string[] = [];

  // 属性串必须以空白开头，否则 a:ln 这类短标签会吃掉 a:lnSpc 的名字尾巴
  const openMatch = new RegExp(`^<${tagName}(\\s(?:"[^"]*"|[^>"])*?)?(/?)>`).exec(prXml);
  const attrText = openMatch?.[1] ?? '';
  for (const a of attrText.matchAll(/([\w:]+)="([^"]*)"/g)) {
    attrs.set(a[1], a[2]);
  }

  if (openMatch && openMatch[2] !== '/') {
    const closeAt = prXml.lastIndexOf(`</${tagName}>`);
    const inner = prXml.slice(openMatch[0].length, closeAt < 0 ? undefined : closeAt);
    for (const child of splitChildren(inner)) {
      if (order.includes(child.tag)) children.set(child.tag, child.xml);
      else extra.push(child.xml);
    }
  }

  return { attrs, children, extra };
}

export function serializePr(pr: ParsedPr, tagName: string, order: string[]): string {
  const attrText = [...pr.attrs]
    .filter(([, v]) => v !== '')
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');
  const inner =
    order
      .filter((t) => pr.children.has(t))
      .map((t) => pr.children.get(t)!)
      .join('') + pr.extra.join('');
  return inner ? `<${tagName}${attrText}>${inner}</${tagName}>` : `<${tagName}${attrText}/>`;
}

/** 在 xml 中找出某个属性节点的所有出现位置（含自闭合与配对两种写法） */
export function findPrSpans(xml: string, tag: string): { start: number; end: number }[] {
  const re = new RegExp(`<${tag}(\\s(?:"[^"]*"|[^>"])*?)?(/?)>`, 'g');
  const spans: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const start = m.index;
    let end: number;
    if (m[2] === '/') {
      end = start + m[0].length;
    } else {
      end = matchGenericEnd(xml, tag, start);
      if (end < 0) continue;
    }
    spans.push({ start, end });
    re.lastIndex = end;
  }
  return spans;
}

/** 用回调改写 xml 中所有指定属性节点 */
export function rewritePrNodes(
  xml: string,
  tag: string,
  transform: (prXml: string) => string,
): string {
  const spans = findPrSpans(xml, tag);
  let out = xml;
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const { start, end } = spans[i];
    out = out.slice(0, start) + transform(out.slice(start, end)) + out.slice(end);
  }
  return out;
}
