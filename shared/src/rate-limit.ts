/** 是否跳过全局限流（健康检查、静态资源、VIP 视频状态轮询） */
export function shouldSkipRateLimit(method: string, path: string): boolean {
  if (path === '/health' || path === '/ready') return true;
  if (path === '/docs' || path.startsWith('/docs/')) return true;
  if (!path.startsWith('/v1/')) return true;
  if (method === 'GET' && /^\/v1\/jobs\/[^/]+\/download$/.test(path)) return true;
  // VIP 页会同时轮询多条缓存状态，不应计入全局限流
  if (method === 'GET' && /^\/v1\/youtube\/videos\/[^/]+\/video$/.test(path)) return true;
  if (method === 'POST' && path === '/v1/youtube/video/status') return true;
  return false;
}

/** 上传相关路径使用更严格的限流 */
export function isUploadRateLimitPath(method: string, path: string): boolean {
  if (method !== 'POST') return false;
  if (path === '/v1/uploads') return true;
  if (path === '/v1/uploads/init') return true;
  if (/^\/v1\/uploads\/[^/]+\/chunks\/\d+$/.test(path)) return true;
  if (/^\/v1\/uploads\/[^/]+\/complete$/.test(path)) return true;
  return false;
}
