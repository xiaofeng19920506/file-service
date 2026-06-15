import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const TOOL_PATH =
  '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH ?? '');

export function resolveYtdlpPath(configured = 'yt-dlp'): string {
  for (const candidate of [
    configured,
    '/opt/homebrew/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
  ]) {
    if (candidate.includes('/') && existsSync(candidate)) return candidate;
  }
  return configured;
}

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
    resolveYtdlpPath(ytdlpPath),
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
    {
      timeout: 600_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PATH: TOOL_PATH },
    },
  );

  const files = await readdir(workDir);
  const mp3 = files.find((name) => name.endsWith('.mp3'));
  if (!mp3) throw new Error('audio_extract_failed');
  return join(workDir, mp3);
}

/** 将 YouTube 音频流式输出到 stdout，供即时播放（不等待完整 MP3 缓存） */
export function spawnYoutubeAudioPreviewStream(
  videoId: string,
  ytdlpPath = 'yt-dlp',
): ChildProcess {
  if (!isValidYoutubeVideoId(videoId)) {
    throw new Error('invalid_video_id');
  }

  return spawn(
    resolveYtdlpPath(ytdlpPath),
    [
      '-f',
      'ba[ext=m4a]/ba[ext=mp3]/ba/b',
      '--no-playlist',
      '--no-warnings',
      '--no-part',
      '-o',
      '-',
      `https://www.youtube.com/watch?v=${videoId}`,
    ],
    {
      env: { ...process.env, PATH: TOOL_PATH },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}
