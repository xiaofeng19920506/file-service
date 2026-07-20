const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** 调用 Docker 内的 LibreOffice 预览服务，将 PPTX 指定页渲染为 PNG */
export async function renderSlidePngViaService(
  serviceUrl: string,
  pptx: Buffer,
  slideNumber: number,
  options?: { timeoutMs?: number; retries?: number },
): Promise<Buffer> {
  const base = serviceUrl.replace(/\/$/, '');
  const url = `${base}/render-slide.png?slide=${encodeURIComponent(String(slideNumber))}`;
  const timeoutMs = options?.timeoutMs ?? 90_000;
  const retries = options?.retries ?? 2;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
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
        await sleep(300 * (attempt + 1));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('slide_preview_service_failed');
}
