import type { UploadResult } from '../types';
import { apiFetch, parseJson } from './http';
import type { UploadProgress } from './upload-with-progress';

export async function uploadFileChunked(
  file: File,
  metadata?: {
    title?: string;
    titleEn?: string;
    titleZhCn?: string;
    titleZhTw?: string;
    composer?: string;
    author?: string;
    notes?: string;
  },
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult> {
  const initBody: Record<string, unknown> = {
    filename: file.name,
    size: file.size,
  };
  if (metadata?.title) initBody.title = metadata.title;
  if (metadata?.titleEn) initBody.titleEn = metadata.titleEn;
  if (metadata?.titleZhCn) initBody.titleZhCn = metadata.titleZhCn;
  if (metadata?.titleZhTw) initBody.titleZhTw = metadata.titleZhTw;
  if (metadata?.composer) initBody.composer = metadata.composer;
  if (metadata?.author) initBody.author = metadata.author;
  if (metadata?.notes) initBody.notes = metadata.notes;

  const initRes = await apiFetch('/v1/uploads/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(initBody),
  });
  const init = await parseJson<{
    uploadId: string;
    chunkSize: number;
    totalChunks: number;
  }>(initRes);

  for (let i = 0; i < init.totalChunks; i++) {
    const start = i * init.chunkSize;
    const end = Math.min(start + init.chunkSize, file.size);
    const slice = file.slice(start, end);
    const form = new FormData();
    form.append('chunk', slice, `chunk-${i}`);

    const chunkRes = await apiFetch(
      `/v1/uploads/${init.uploadId}/chunks/${i}`,
      { method: 'POST', body: form },
    );
    if (!chunkRes.ok) {
      await parseJson(chunkRes);
    }

    onProgress?.({
      loaded: end,
      total: file.size,
      percent: Math.min(100, Math.round((end / file.size) * 100)),
    });
  }

  const completeRes = await apiFetch(
    `/v1/uploads/${init.uploadId}/complete`,
    { method: 'POST' },
  );
  return parseJson<UploadResult>(completeRes);
}
