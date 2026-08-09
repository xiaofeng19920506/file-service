/** 是否跳过全局限流（健康检查、静态资源、音视频状态轮询、周报预览 PNG） */
export function shouldSkipRateLimit(method: string, path: string): boolean {
  if (path === '/health' || path === '/ready') return true;
  if (path === '/docs' || path.startsWith('/docs/')) return true;
  if (!path.startsWith('/v1/')) return true;
  if (method === 'GET' && /^\/v1\/jobs\/[^/]+\/download$/.test(path)) return true;
  // VIP / 敬拜页会高频轮询缓存状态，不应计入全局限流
  if (method === 'GET' && /^\/v1\/youtube\/videos\/[^/]+\/video$/.test(path)) return true;
  if (method === 'GET' && /^\/v1\/youtube\/videos\/[^/]+\/audio$/.test(path)) return true;
  if (method === 'POST' && path === '/v1/youtube/video/status') return true;
  // 周报预览会并行拉多页 PNG + deck-plan，极易顶满限流窗口
  if (method === 'GET' && path === '/v1/bulletins/template/deck-plan') return true;
  if (
    method === 'GET' &&
    /^\/v1\/bulletins\/template\/slides\/\d+\/preview\.png$/.test(path)
  ) {
    return true;
  }
  // 登录态轻量轮询（服事表 / Drive 同步状态）
  if (method === 'GET' && path === '/v1/bulletins/service-rotation/schedule') return true;
  if (method === 'GET' && path === '/v1/bulletins/drive-sync/status') return true;
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
