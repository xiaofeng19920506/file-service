const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** 调用 Docker 内的 LibreOffice 预览服务，将 PPTX 指定页渲染为 PNG */
export async function renderSlidePngViaService(
  serviceUrl: string,
  pptx: Buffer,
  slideNumber: number,
): Promise<Buffer> {
  const base = serviceUrl.replace(/\/$/, '');
  const url = `${base}/render-slide.png?slide=${encodeURIComponent(String(slideNumber))}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': PPTX_MIME },
    body: new Uint8Array(pptx),
  });
  if (!res.ok) {
    throw new Error(`slide_preview_service_failed:${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
