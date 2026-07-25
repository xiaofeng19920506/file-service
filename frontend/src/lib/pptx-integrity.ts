import { loadPptxZipCached } from './pptx-zip-cache';

/**
 * 轻量的 XML 标签配对检查。历史上文本回写用的正则会把 `<p:txBody>` 当成文本节点，
 * 写出 `<p:txBody>文字</p:t>` 这种坏结构：PowerPoint / LibreOffice 会整页渲染空白，
 * 而基于正则的预览只能显示残缺内容。这里用标签栈把这类文件识别出来。
 */
export function xmlTagsBalanced(xml: string): boolean {
  const stack: string[] = [];
  const re = /<(\/?)([A-Za-z_][\w.:-]*)((?:"[^"]*"|[^>"])*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const closing = m[1] === '/';
    const name = m[2];
    const selfClosing = m[4] === '/';
    if (closing) {
      if (stack.pop() !== name) return false;
    } else if (!selfClosing) {
      stack.push(name);
    }
  }
  return stack.length === 0;
}

/** 检查 pptx 里每一页的 slide XML 是否结构完整 */
export async function pptxSlidesAreWellFormed(blob: Blob): Promise<boolean> {
  try {
    const zip = await loadPptxZipCached(blob);
    const paths = Object.keys(zip.files).filter((n) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(n),
    );
    if (paths.length === 0) return false;
    for (const path of paths) {
      const xml = await zip.file(path)!.async('string');
      if (!xmlTagsBalanced(xml)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
