import { execFile, spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { isValidYoutubeVideoId, resolveYtdlpPath } from './youtube-audio-extract.js';
import {
  withYtdlpPlayerClientFallback,
  ytdlpProcessEnv,
  ytdlpSharedArgs,
} from './ytdlp-common.js';

const execFileAsync = promisify(execFile);

export { isValidYoutubeVideoId };

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** VIP 缓存最高分辨率（H.264，兼容移动端浏览器） */
export const YOUTUBE_VIDEO_MAX_HEIGHT = 1080;

function ytdlpHeightFilter(): string {
  return `[height<=${YOUTUBE_VIDEO_MAX_HEIGHT}]`;
}

/**
 * VIP 缓存主格式：仅 H.264 (avc) + AAC，兼容 iOS / Android / 鸿蒙浏览器。
 * 不含 VP9/HEVC 回退，避免 WebView 黑屏仅有声。
 */
export const YOUTUBE_VIDEO_YTDLP_FORMAT =
  `bestvideo[vcodec^=avc1]${ytdlpHeightFilter()}+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc]${ytdlpHeightFilter()}+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]${ytdlpHeightFilter()}+bestaudio/bestvideo[vcodec^=avc]${ytdlpHeightFilter()}+bestaudio`;

/** 无原生 H.264 流时的转码回退（输出仍为 H.264 MP4，较慢） */
export const YOUTUBE_VIDEO_YTDLP_FORMAT_TRANSCODE =
  `bestvideo${ytdlpHeightFilter()}+bestaudio/best${ytdlpHeightFilter()}`;

/** 已选 H.264 源：直接封装，不二次编码 */
export const YOUTUBE_VIDEO_FFMPEG_COPY_FASTSTART =
  'ffmpeg:-c:v copy -c:a copy -movflags +faststart';

/** 转码为 H.264 + AAC（完整文件） */
export const YOUTUBE_VIDEO_FFMPEG_TRANSCODE_FASTSTART =
  'ffmpeg:-c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k -movflags +faststart';

/** 转码为 H.264 + AAC（分段边下边播） */
export const YOUTUBE_VIDEO_FFMPEG_TRANSCODE_PROGRESSIVE =
  'ffmpeg:-c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k -movflags frag_keyframe+empty_moov+default_base_moof';

/** H.264 源分段边下边播 */
export const YOUTUBE_VIDEO_FFMPEG_COPY_PROGRESSIVE =
  'ffmpeg:-c:v copy -c:a copy -movflags frag_keyframe+empty_moov+default_base_moof';

type YtdlpMp4Opts = {
  ytdlpPath?: string;
  format: string;
  ffmpegPostprocessor: string;
};

function isFormatUnavailableError(message: string): boolean {
  return /requested format is not available|no video formats|format is not available/i.test(
    message,
  );
}

async function execYtdlpMp4ToWorkDir(
  videoId: string,
  workDir: string,
  opts: YtdlpMp4Opts,
): Promise<string> {
  const ytdlpPath = opts.ytdlpPath ?? 'yt-dlp';
  const outputTemplate = join(workDir, 'video.%(ext)s');
  await withYtdlpPlayerClientFallback((playerClient) =>
    execFileAsync(
      resolveYtdlpPath(ytdlpPath),
      [
        '-f',
        opts.format,
        '--merge-output-format',
        'mp4',
        '--postprocessor-args',
        opts.ffmpegPostprocessor,
        '-o',
        outputTemplate,
        ...ytdlpSharedArgs(playerClient),
        watchUrl(videoId),
      ],
      {
        env: ytdlpProcessEnv(),
        maxBuffer: 64 * 1024 * 1024,
        timeout: 600_000,
      },
    ),
  );

  const files = await readdir(workDir);
  const mp4 = files.find((f) => f.endsWith('.mp4'));
  if (!mp4) throw new Error('video_extract_failed');
  return join(workDir, mp4);
}

async function spawnYtdlpMp4ToFile(
  videoId: string,
  outputPath: string,
  opts: YtdlpMp4Opts,
): Promise<void> {
  const ytdlp = resolveYtdlpPath(opts.ytdlpPath ?? 'yt-dlp');
  await withYtdlpPlayerClientFallback((playerClient) =>
    new Promise<void>((resolve, reject) => {
      const args = [
        '-f',
        opts.format,
        '--merge-output-format',
        'mp4',
        '--postprocessor-args',
        opts.ffmpegPostprocessor,
        '-o',
        outputPath,
        ...ytdlpSharedArgs(playerClient),
        watchUrl(videoId),
      ];
      const child = spawn(ytdlp, args, {
        env: ytdlpProcessEnv(),
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
    }),
  );
}

/** 预估下载体积（字节）；失败时返回 null */
export async function estimateYoutubeVideoBytes(
  videoId: string,
  ytdlpPath = 'yt-dlp',
): Promise<number | null> {
  if (!isValidYoutubeVideoId(videoId)) return null;
  try {
    const { stdout } = await withYtdlpPlayerClientFallback((playerClient) =>
      execFileAsync(
        resolveYtdlpPath(ytdlpPath),
        [
          '-j',
          '-f',
          YOUTUBE_VIDEO_YTDLP_FORMAT,
          ...ytdlpSharedArgs(playerClient),
          watchUrl(videoId),
        ],
        { env: ytdlpProcessEnv(), maxBuffer: 8 * 1024 * 1024, timeout: 90_000 },
      ),
    );
    const info = JSON.parse(stdout) as { filesize?: number; filesize_approx?: number };
    const size = info.filesize ?? info.filesize_approx;
    return typeof size === 'number' && size > 0 ? size : null;
  } catch {
    return null;
  }
}

/** 下载 YouTube 视频为 H.264 MP4（最高 1080p，供 VIP 缓存播放） */
export async function extractYoutubeVideoMp4(
  videoId: string,
  workDir: string,
  ytdlpPath = 'yt-dlp',
): Promise<string> {
  if (!isValidYoutubeVideoId(videoId)) {
    throw new Error('invalid_video_id');
  }

  const primary: YtdlpMp4Opts = {
    ytdlpPath,
    format: YOUTUBE_VIDEO_YTDLP_FORMAT,
    ffmpegPostprocessor: YOUTUBE_VIDEO_FFMPEG_COPY_FASTSTART,
  };
  const transcode: YtdlpMp4Opts = {
    ytdlpPath,
    format: YOUTUBE_VIDEO_YTDLP_FORMAT_TRANSCODE,
    ffmpegPostprocessor: YOUTUBE_VIDEO_FFMPEG_TRANSCODE_FASTSTART,
  };

  try {
    return await execYtdlpMp4ToWorkDir(videoId, workDir, primary);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!isFormatUnavailableError(message)) throw e;
    return execYtdlpMp4ToWorkDir(videoId, workDir, transcode);
  }
}

/** 大文件：边下边存到指定路径，使用 fragmented MP4 便于边缓存边播（H.264） */
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

  const primary: YtdlpMp4Opts = {
    ytdlpPath: opts?.ytdlpPath,
    format: YOUTUBE_VIDEO_YTDLP_FORMAT,
    ffmpegPostprocessor: YOUTUBE_VIDEO_FFMPEG_COPY_PROGRESSIVE,
  };
  const transcode: YtdlpMp4Opts = {
    ytdlpPath: opts?.ytdlpPath,
    format: YOUTUBE_VIDEO_YTDLP_FORMAT_TRANSCODE,
    ffmpegPostprocessor: YOUTUBE_VIDEO_FFMPEG_TRANSCODE_PROGRESSIVE,
  };

  try {
    try {
      await spawnYtdlpMp4ToFile(videoId, outputPath, primary);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!isFormatUnavailableError(message)) throw e;
      await spawnYtdlpMp4ToFile(videoId, outputPath, transcode);
    }

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
