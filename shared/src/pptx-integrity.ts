import JSZip from 'jszip';

/**
 * 轻量 XML 标签配对检查。历史上文本回写用的错误正则会截断自闭合标签，
 * 写出缺 `</a:bodyPr>` / `</a:solidFill>` 的坏 slide XML：LibreOffice 只能画背景、
 * 文字全部消失。这里用标签栈把这类文件识别出来。
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

/** 检查 pptx buffer 里每一页的 slide XML 是否结构完整 */
export async function pptxBufferSlidesAreWellFormed(pptx: Buffer | Uint8Array): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(pptx);
    const paths = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
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
