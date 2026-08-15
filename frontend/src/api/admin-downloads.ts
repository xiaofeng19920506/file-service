import { apiFetch, parseJson } from './http';

export type AdminMediaFolderId = 'movies' | 'tv' | 'shortdrama' | 'videos' | 'anime' | 'variety';

export type AdminDownloadJobStatus = 'queued' | 'running' | 'done' | 'failed';

export type AdminDownloadJob = {
  jobId: string;
  kind: 'mp3' | 'mp4';
  videoId: string;
  title?: string;
  folder?: AdminMediaFolderId;
  folderLabel?: string;
  seriesName?: string;
  status: AdminDownloadJobStatus;
  percent: number;
  stage: string;
  queuePosition: number;
  nasPath?: string;
  filename?: string;
  error?: string;
  createdAt: number;
};

async function readError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  if (typeof data === 'object' && data && 'error' in data) {
    return String((data as { error: string }).error);
  }
  return res.statusText || 'download_failed';
}

export async function listAdminDownloadJobs(): Promise<AdminDownloadJob[]> {
  const res = await apiFetch('/v1/admin/downloads/jobs');
  if (!res.ok) throw new Error(await readError(res));
  const data = await parseJson<{ jobs: AdminDownloadJob[] }>(res);
  return data.jobs ?? [];
}

export async function startAdminAudioJob(videoId: string, title: string): Promise<AdminDownloadJob> {
  const res = await apiFetch(`/v1/admin/youtube/videos/${encodeURIComponent(videoId)}/audio/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok && res.status !== 202) throw new Error(await readError(res));
  return parseJson<AdminDownloadJob>(res);
}

export async function retryAdminDownloadJob(jobId: string): Promise<AdminDownloadJob> {
  const res = await apiFetch(`/v1/admin/downloads/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: 'POST',
  });
  if (!res.ok && res.status !== 202) throw new Error(await readError(res));
  return parseJson<AdminDownloadJob>(res);
}

export async function startAdminVideoJob(
  videoId: string,
  title: string,
  folder: AdminMediaFolderId,
  series?: string,
): Promise<AdminDownloadJob> {
  const res = await apiFetch(`/v1/admin/youtube/videos/${encodeURIComponent(videoId)}/video/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, folder, series: series?.trim() || undefined }),
  });
  if (!res.ok && res.status !== 202) throw new Error(await readError(res));
  return parseJson<AdminDownloadJob>(res);
}
