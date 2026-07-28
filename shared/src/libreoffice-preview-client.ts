const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** 解析逗号分隔的预览服务 URL 列表 */
export function parseLibreOfficePreviewUrls(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

let roundRobin = 0;

function pickUrl(urls: string[]): string {
  if (!urls.length) throw new Error('slide_preview_service_url_missing');
  const i = roundRobin++ % urls.length;
  return urls[i]!;
}

function rotateUrls(urls: string[], start: string): string[] {
  const idx = urls.indexOf(start);
  if (idx <= 0) return urls;
  return [...urls.slice(idx), ...urls.slice(0, idx)];
}

/**
 * 调用 Docker 内的 LibreOffice 预览服务，将 PPTX 指定页渲染为 PNG。
 * `serviceUrl` 支持单个 URL，或多个逗号分隔 / 数组（轮询 + 失败换实例）。
 */
export async function renderSlidePngViaService(
  serviceUrl: string | string[],
  pptx: Buffer,
  slideNumber: number,
  options?: { timeoutMs?: number; retries?: number },
): Promise<Buffer> {
  const urls = Array.isArray(serviceUrl)
    ? serviceUrl.map((u) => u.replace(/\/$/, '')).filter(Boolean)
    : parseLibreOfficePreviewUrls(serviceUrl);
  if (!urls.length) throw new Error('slide_preview_service_url_missing');

  const timeoutMs = options?.timeoutMs ?? 90_000;
  const retries = options?.retries ?? 2;
  const order = rotateUrls(urls, pickUrl(urls));

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const base = order[attempt % order.length]!;
    const url = `${base}/render-slide.png?slide=${encodeURIComponent(String(slideNumber))}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': PPTX_MIME },
        body: new Uint8Array(pptx),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`slide_preview_service_failed:${res.status}`);
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(250 * (attempt + 1));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('slide_preview_service_failed');
}
