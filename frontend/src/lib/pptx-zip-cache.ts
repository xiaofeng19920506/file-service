import JSZip, { type JSZipInstance } from './jszip';

/**
 * 同一个 pptx Blob 会被多个预览组件同时读取（画布 + 每张缩略图）。整包解析一次
 * 几 MB 的 zip 很贵，这里按 Blob 身份复用同一个解析结果；只做只读访问。
 */
const cache = new WeakMap<Blob, Promise<JSZipInstance>>();

export function loadPptxZipCached(blob: Blob): Promise<JSZipInstance> {
  const hit = cache.get(blob);
  if (hit) return hit;
  const pending = JSZip.loadAsync(blob).catch((err: unknown) => {
    cache.delete(blob);
    throw err;
  });
  cache.set(blob, pending);
  return pending;
}
