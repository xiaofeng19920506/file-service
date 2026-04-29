/** 站点绝对地址（含协议），用于 canonical / OG / sitemap。部署时请设置 NEXT_PUBLIC_SITE_URL。 */
export function getPublicSiteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}
