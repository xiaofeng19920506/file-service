import { getYoutubeAudioStatus } from './youtube-audio';
import { apiFetch, parseJson } from './http';

const AUDIO_POLL_MS = 1_500;
const AUDIO_POLL_TIMEOUT_MS = 10 * 60_000;

export type AdminNasSaveResult = {
  saved: true;
  kind: 'mp3' | 'mp4';
  filename: string;
  nasPath: string;
};

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

export async function saveAdminAudioToNas(
  videoId: string,
  title: string,
): Promise<AdminNasSaveResult> {
  const post = async () =>
    apiFetch(`/v1/admin/youtube/videos/${encodeURIComponent(videoId)}/audio/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });

  let res = await post();
  if (res.status === 202) {
    await parseJson(res);
    await waitUntilAudioReady(videoId);
    res = await post();
  }
  if (!res.ok) throw new Error(await readError(res));
  return parseJson<AdminNasSaveResult>(res);
}

export async function saveAdminVideoToNas(
  videoId: string,
  title: string,
): Promise<AdminNasSaveResult> {
  const res = await apiFetch(
    `/v1/admin/youtube/videos/${encodeURIComponent(videoId)}/video/download`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  return parseJson<AdminNasSaveResult>(res);
}
