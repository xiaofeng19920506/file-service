import { getYoutubeAudioStatus } from './youtube-audio';
import { apiFetch, parseJson } from './http';

const AUDIO_POLL_MS = 1_500;
const AUDIO_POLL_TIMEOUT_MS = 10 * 60_000;

function safeFilename(name: string, ext: 'mp3' | 'mp4'): string {
  const base = name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\.(mp3|mp4)$/i, '').trim() || 'download';
  return `${base}.${ext}`;
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function readError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  if (typeof data === 'object' && data && 'error' in data) {
    return String((data as { error: string }).error);
  }
  return res.statusText || 'download_failed';
}

async function waitUntilAudioReady(videoId: string): Promise<void> {
  const deadline = Date.now() + AUDIO_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await getYoutubeAudioStatus(videoId);
    if (status.status === 'ready') return;
    if (status.status === 'failed') {
      throw new Error(status.errorCode || 'audio_extract_failed');
    }
    await new Promise((resolve) => setTimeout(resolve, AUDIO_POLL_MS));
  }
  throw new Error('download_timeout');
}

export async function downloadAdminAudio(videoId: string, filename: string): Promise<void> {
  const prepare = await apiFetch(
    `/v1/admin/youtube/videos/${encodeURIComponent(videoId)}/audio/download`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: filename }),
    },
  );

  if (prepare.status === 202) {
    await parseJson(prepare);
    await waitUntilAudioReady(videoId);
  } else if (!prepare.ok) {
    throw new Error(await readError(prepare));
  }

  const params = new URLSearchParams({ title: filename });
  const res = await apiFetch(
    `/v1/admin/youtube/videos/${encodeURIComponent(videoId)}/audio/download?${params}`,
  );
  if (!res.ok) throw new Error(await readError(res));
  triggerBrowserDownload(await res.blob(), safeFilename(filename, 'mp3'));
}

export async function downloadAdminVideo(videoId: string, filename: string): Promise<void> {
  const params = new URLSearchParams({ title: filename });
  const res = await apiFetch(
    `/v1/admin/youtube/videos/${encodeURIComponent(videoId)}/video/download?${params}`,
  );
  if (!res.ok) throw new Error(await readError(res));
  triggerBrowserDownload(await res.blob(), safeFilename(filename, 'mp4'));
}
