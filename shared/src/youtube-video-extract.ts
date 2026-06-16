import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { isValidYoutubeVideoId, resolveYtdlpPath } from './youtube-audio-extract.js';

const execFileAsync = promisify(execFile);

export { isValidYoutubeVideoId };

/** 下载 YouTube 视频为 MP4（最高 480p，供 VIP 缓存播放） */
export async function extractYoutubeVideoMp4(
  videoId: string,
  workDir: string,
  ytdlpPath = 'yt-dlp',
): Promise<string> {
  if (!isValidYoutubeVideoId(videoId)) {
    throw new Error('invalid_video_id');
  }

  const outputTemplate = join(workDir, 'video.%(ext)s');
  await execFileAsync(
    resolveYtdlpPath(ytdlpPath),
    [
      '-f',
      'bv*[height<=480]+ba/b[height<=480]/b',
      '--merge-output-format',
      'mp4',
      '-o',
      outputTemplate,
      '--no-playlist',
      '--no-warnings',
      `https://www.youtube.com/watch?v=${videoId}`,
    ],
    {
      env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH ?? '') },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 600_000,
    },
  );

  const files = await readdir(workDir);
  const mp4 = files.find((f) => f.endsWith('.mp4'));
  if (!mp4) throw new Error('video_extract_failed');
  return join(workDir, mp4);
}
