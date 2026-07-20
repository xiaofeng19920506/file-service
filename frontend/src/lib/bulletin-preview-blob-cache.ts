/** 模块级预览 PNG blob 缓存，跨组件复用，避免无关页重复打 API */

const MAX_ENTRIES = 64;
const cache = new Map<string, Blob>();

export function getBulletinPreviewBlob(cacheKey: string): Blob | undefined {
  const hit = cache.get(cacheKey);
  if (!hit) return undefined;
  // LRU：再次命中移到末尾
  cache.delete(cacheKey);
  cache.set(cacheKey, hit);
  return hit;
}

export function setBulletinPreviewBlob(cacheKey: string, blob: Blob): void {
  if (cache.has(cacheKey)) cache.delete(cacheKey);
  cache.set(cacheKey, blob);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
}
