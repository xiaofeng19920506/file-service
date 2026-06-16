import { execFile, spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { isValidYoutubeVideoId, resolveYtdlpPath } from './youtube-audio-extract.js';

const execFileAsync = promisify(execFile);

export { isValidYoutubeVideoId };

const YTDLP_ENV = {
  PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH ?? ''),
};

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

const YTDLP_FORMAT = 'bv*[height<=480]+ba/b[height<=480]/b';

/** 预估下载体积（字节）；失败时返回 null */
export async function estimateYoutubeVideoBytes(
  videoId: string,
  ytdlpPath = 'yt-dlp',
): Promise<number | null> {
  if (!isValidYoutubeVideoId(videoId)) return null;
  try {
    const { stdout } = await execFileAsync(
      resolveYtdlpPath(ytdlpPath),
      ['-j', '-f', YTDLP_FORMAT, '--no-playlist', '--no-warnings', watchUrl(videoId)],
      { env: { ...process.env, ...YTDLP_ENV }, maxBuffer: 8 * 1024 * 1024, timeout: 90_000 },
    );
    const info = JSON.parse(stdout) as { filesize?: number; filesize_approx?: number };
    const size = info.filesize ?? info.filesize_approx;
    return typeof size === 'number' && size > 0 ? size : null;
  } catch {
    return null;
  }
}

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
      YTDLP_FORMAT,
      '--merge-output-format',
      'mp4',
      '-o',
      outputTemplate,
      '--no-playlist',
      '--no-warnings',
      watchUrl(videoId),
    ],
    {
      env: { ...process.env, ...YTDLP_ENV },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 600_000,
    },
  );

  const files = await readdir(workDir);
  const mp4 = files.find((f) => f.endsWith('.mp4'));
  if (!mp4) throw new Error('video_extract_failed');
  return join(workDir, mp4);
}

/** 大文件：边下边存到指定路径，使用 fragmented MP4 便于边缓存边播 */
export async function extractYoutubeVideoMp4ToFile(
  videoId: string,
  outputPath: string,
  opts?: {
    ytdlpPath?: string;
    onProgress?: (bytes: number) => void | Promise<void>;
    progressIntervalMs?: number;
  },
): Promise<number> {
  if (!isValidYoutubeVideoId(videoId)) {
    throw new Error('invalid_video_id');
  }

  const ytdlp = resolveYtdlpPath(opts?.ytdlpPath ?? 'yt-dlp');
  const args = [
    '-f',
    YTDLP_FORMAT,
    '--merge-output-format',
    'mp4',
    '--postprocessor-args',
    'ffmpeg:-movflags frag_keyframe+empty_moov+default_base_moof',
    '-o',
    outputPath,
    '--no-playlist',
    '--no-warnings',
    watchUrl(videoId),
  ];

  let lastReported = 0;
  const intervalMs = opts?.progressIntervalMs ?? 1500;
  const report = async () => {
    if (!opts?.onProgress) return;
    try {
      const size = (await stat(outputPath)).size;
      if (size > lastReported) {
        lastReported = size;
        await opts.onProgress(size);
      }
    } catch {
      /* 文件尚未创建 */
    }
  };

  const timer = setInterval(() => {
    void report();
  }, intervalMs);

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ytdlp, args, {
        env: { ...process.env, ...YTDLP_ENV },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `video_extract_failed:${code}`));
      });
    });
    const finalSize = (await stat(outputPath)).size;
    if (opts?.onProgress && finalSize > lastReported) {
      await opts.onProgress(finalSize);
    }
    return finalSize;
  } finally {
    clearInterval(timer);
  }
}

export function shouldUseProgressiveVideoDownload(
  estimatedBytes: number | null,
  thresholdBytes: number,
  storageBackend: 'fs' | 's3',
): boolean {
  return (
    storageBackend === 'fs'
    && estimatedBytes !== null
    && estimatedBytes >= thresholdBytes
  );
}
