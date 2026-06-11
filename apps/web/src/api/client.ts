import type { BlobRecord, JobResponse, UploadResult } from '../types';
import { apiFetch, parseJson } from './http';
import { uploadFileChunked } from './upload-chunked';
import type { UploadProgress } from './upload-with-progress';
import { postFormWithProgress, parseJson as parseUploadJson } from './upload-with-progress';

const CHUNKED_UPLOAD_MIN_BYTES = 8 * 1024 * 1024;

export type { UploadProgress, BlobRecord };

export async function uploadFile(
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
  if (file.size >= CHUNKED_UPLOAD_MIN_BYTES) {
    return uploadFileChunked(file, metadata, onProgress);
  }

  const form = new FormData();
  form.append('file', file);
  if (metadata?.title) form.append('title', metadata.title);
  if (metadata?.titleEn) form.append('titleEn', metadata.titleEn);
  if (metadata?.titleZhCn) form.append('titleZhCn', metadata.titleZhCn);
  if (metadata?.titleZhTw) form.append('titleZhTw', metadata.titleZhTw);
  if (metadata?.composer) form.append('composer', metadata.composer);
  if (metadata?.author) form.append('author', metadata.author);
  if (metadata?.notes) form.append('notes', metadata.notes);
  const res = await postFormWithProgress('/v1/uploads', form, onProgress);
  return parseUploadJson<UploadResult>(res);
}

export async function checkBlobExists(sha256: string): Promise<boolean> {
  const params = new URLSearchParams({ sha256 });
  const res = await apiFetch(`/v1/blobs/exists?${params.toString()}`);
  const data = await parseJson<{ exists: boolean }>(res);
  return data.exists;
}

export async function searchBlobs(
  query: string,
  options?: { limit?: number },
): Promise<BlobRecord[]> {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (options?.limit) params.set('limit', String(options.limit));
  const res = await apiFetch(`/v1/blobs?${params.toString()}`);
  return parseJson<BlobRecord[]>(res);
}

export async function createJob(
  inputs: { blobId: string; order: number }[],
  options?: { webhookUrl?: string },
): Promise<{ jobId: string; status: string }> {
  const res = await apiFetch('/v1/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs, webhookUrl: options?.webhookUrl }),
  });
  return parseJson(res);
}

export async function getJob(jobId: string): Promise<JobResponse> {
  const res = await apiFetch(`/v1/jobs/${jobId}`);
  return parseJson(res);
}

export async function getDownloadUrl(
  jobId: string,
): Promise<{ url: string; expiresAt: string }> {
  const res = await apiFetch(`/v1/jobs/${jobId}/download-url`, {
    method: 'POST',
  });
  return parseJson(res);
}

export async function updateJobOutput(
  jobId: string,
  file: File,
): Promise<{ jobId: string; sizeBytes: number }> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch(`/v1/jobs/${jobId}/output`, {
    method: 'PUT',
    body: form,
  });
  return parseJson(res);
}

export async function downloadBlobContent(blobId: string, filename: string): Promise<void> {
  const res = await apiFetch(`/v1/blobs/${blobId}/content`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const code =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : res.statusText;
    throw new Error(code);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'presentation.pptx';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function openBlobPreviewTab(blobId: string, title: string): void {
  const params = new URLSearchParams({ title });
  const url = `${window.location.origin}${window.location.pathname}#/preview/${blobId}?${params.toString()}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openMergeEditTab(blobIds: string[], title?: string): void {
  if (!blobIds.length) return;
  const params = new URLSearchParams({ blobs: blobIds.join(',') });
  if (title?.trim()) params.set('title', title.trim());
  const url = `${window.location.origin}${window.location.pathname}#/merge/edit?${params.toString()}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function fetchBlobPreviewPptx(blobId: string): Promise<Blob> {
  const res = await apiFetch(`/v1/blobs/${blobId}/preview.pptx`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const code =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : res.statusText;
    if (code === 'preview_conversion_failed' || res.status === 503) {
      throw new Error('preview_conversion_failed');
    }
    if (code === 'unauthorized' || res.status === 401) {
      throw new Error('unauthorized');
    }
    throw new Error(code);
  }
  return res.blob();
}

export async function updateBlobMetadata(
  blobId: string,
  metadata: {
    title?: string;
    titleEn?: string;
    titleZhCn?: string;
    titleZhTw?: string;
    composer?: string;
    author?: string;
    notes?: string;
  },
  options?: { overwrite?: boolean },
): Promise<{
  blobId: string;
  metadata: import('../types').MetadataSnapshot;
  updatedAt: string | null;
  updatedBy: string | null;
}> {
  const res = await apiFetch(`/v1/blobs/${blobId}/metadata`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...metadata, overwrite: options?.overwrite ?? false }),
  });
  return parseJson(res);
}

export async function updateBlobContent(
  blobId: string,
  file: File,
): Promise<{
  blobId: string;
  sha256: string;
  sizeBytes: number;
  updatedAt: string | null;
  updatedBy: string | null;
}> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch(`/v1/blobs/${blobId}/content`, {
    method: 'PUT',
    body: form,
  });
  return parseJson(res);
}

export async function deleteBlob(blobId: string): Promise<void> {
  const res = await apiFetch(`/v1/blobs/${blobId}`, { method: 'DELETE' });
  await parseJson<{ ok: boolean }>(res);
}
