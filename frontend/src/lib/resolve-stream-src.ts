/** 视频流地址：大文件直连 API 域名，不走 Next 反代（避免 Vercel 超时/体积限制）。 */
export function resolveVideoStreamSrc(url: string): string {
  if (url.startsWith('http')) return url;
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
  if (url.startsWith('/')) {
    return base ? `${base}${url}` : url;
  }
  return base ? `${base}/${url}` : url;
}

/** 音频等小文件：优先同源 `/v1/...` 走 Next 反代。 */
export function resolveStreamSrc(url: string): string {
  if (url.startsWith('/')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/v1/')) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    /* fall through */
  }
  if (url.startsWith('http')) return url;
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
  return `${base}${url}`;
}
