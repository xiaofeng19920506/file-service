import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const YOUTUBE_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function isValidYoutubeVideoId(videoId: string): boolean {
  return YOUTUBE_VIDEO_ID_RE.test(videoId);
}

export async function extractYoutubeAudioMp3(
  videoId: string,
  workDir: string,
  ytdlpPath = 'yt-dlp',
): Promise<string> {
  if (!isValidYoutubeVideoId(videoId)) {
    throw new Error('invalid_video_id');
  }

  const outputTemplate = join(workDir, 'audio.%(ext)s');
  await execFileAsync(
    ytdlpPath,
    [
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '5',
      '-o',
      outputTemplate,
      '--no-playlist',
      '--no-warnings',
      `https://www.youtube.com/watch?v=${videoId}`,
    ],
    { timeout: 600_000, maxBuffer: 4 * 1024 * 1024 },
  );

  const files = await readdir(workDir);
  const mp3 = files.find((name) => name.endsWith('.mp3'));
  if (!mp3) throw new Error('audio_extract_failed');
  return join(workDir, mp3);
}
