/**
 * 生成合法的 Content-Disposition 头。
 * Node/undici 不允许 header 里出现非 ASCII；中文等文件名必须走 RFC 5987 的 filename*。
 */
export function contentDisposition(
  disposition: 'inline' | 'attachment',
  filename: string | null | undefined,
  fallback = 'file',
): string {
  const raw = (filename?.trim() || fallback).replace(/[\r\n"]/g, '_');
  const ascii = raw.replace(/[^\x20-\x7E]/g, '_') || fallback;
  const star = encodeURIComponent(raw).replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${star}`;
}
