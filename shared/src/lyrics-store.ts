import { and, eq } from 'drizzle-orm';
import type { Db } from './db/index.js';
import { youtubeVideoLyrics, type YoutubeVideoLyricsRow } from './db/schema.js';
import type { CaptionCue, SubtitleLanguage } from './youtube-captions.js';

export const YOUTUBE_LYRICS_QUEUE_NAME = 'youtube-lyrics-generate';

const RETRY_FAILED_AFTER_MS = 24 * 60 * 60 * 1000;
const PENDING_STALE_MS = 12 * 60 * 1000;

export type StoredLyrics = {
  videoId: string;
  language: string;
  sourceLanguage: string | null;
  translated: false;
  cues: CaptionCue[];
  generating: boolean;
};

export function lyricsJobId(videoId: string, language: SubtitleLanguage): string {
  return `yt-lyrics-${videoId}-${language}`;
}

export async function readStoredLyrics(
  db: Db,
  videoId: string,
  language: SubtitleLanguage,
): Promise<YoutubeVideoLyricsRow | null> {
  const rows = await db
    .select()
    .from(youtubeVideoLyrics)
    .where(
      and(eq(youtubeVideoLyrics.youtubeVideoId, videoId), eq(youtubeVideoLyrics.language, language)),
    )
    .limit(1);
  return rows[0] ?? null;
}

export function storedLyricsToResult(
  row: YoutubeVideoLyricsRow,
  videoId: string,
): StoredLyrics | null {
  if (row.status === 'ready' && Array.isArray(row.cues) && row.cues.length > 0) {
    return {
      videoId,
      language: row.language,
      sourceLanguage: row.source,
      translated: false,
      cues: row.cues,
      generating: false,
    };
  }
  if (row.status === 'pending') {
    return {
      videoId,
      language: row.language,
      sourceLanguage: row.source,
      translated: false,
      cues: [],
      generating: true,
    };
  }
  return null;
}

export async function saveReadyLyrics(
  db: Db,
  opts: {
    videoId: string;
    language: string;
    source: string | null;
    title?: string;
    cues: CaptionCue[];
  },
): Promise<void> {
  const now = new Date();
  await db
    .insert(youtubeVideoLyrics)
    .values({
      youtubeVideoId: opts.videoId,
      language: opts.language,
      status: 'ready',
      source: opts.source,
      title: opts.title ?? null,
      cues: opts.cues,
      errorCode: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [youtubeVideoLyrics.youtubeVideoId, youtubeVideoLyrics.language],
      set: {
        status: 'ready',
        source: opts.source,
        title: opts.title ?? null,
        cues: opts.cues,
        errorCode: null,
        updatedAt: now,
      },
    });
}

export async function markLyricsPending(
  db: Db,
  videoId: string,
  language: SubtitleLanguage,
  title?: string,
): Promise<void> {
  const now = new Date();
  await db
    .insert(youtubeVideoLyrics)
    .values({
      youtubeVideoId: videoId,
      language,
      status: 'pending',
      source: null,
      title: title ?? null,
      cues: [],
      errorCode: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [youtubeVideoLyrics.youtubeVideoId, youtubeVideoLyrics.language],
      set: {
        status: 'pending',
        title: title ?? null,
        errorCode: null,
        updatedAt: now,
      },
    });
}

export async function markLyricsFailed(
  db: Db,
  videoId: string,
  language: SubtitleLanguage,
  errorCode: string,
): Promise<void> {
  const now = new Date();
  await db
    .insert(youtubeVideoLyrics)
    .values({
      youtubeVideoId: videoId,
      language,
      status: 'failed',
      source: null,
      title: null,
      cues: [],
      errorCode,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [youtubeVideoLyrics.youtubeVideoId, youtubeVideoLyrics.language],
      set: {
        status: 'failed',
        errorCode,
        updatedAt: now,
      },
    });
}

export function shouldEnqueueLyricsJob(row: YoutubeVideoLyricsRow | null, now = Date.now()): boolean {
  if (!row) return true;
  if (row.status === 'ready' && row.cues.length > 0) return false;
  if (row.status === 'pending') return now - row.updatedAt.getTime() > PENDING_STALE_MS;
  if (row.status === 'failed') return now - row.updatedAt.getTime() > RETRY_FAILED_AFTER_MS;
  return true;
}

export type LyricsGenerateQueue = {
  add(
    name: string,
    data: { videoId: string; title?: string; subtitleLang: SubtitleLanguage },
    opts?: {
      jobId?: string;
      removeOnComplete?: number;
      removeOnFail?: number;
    },
  ): Promise<unknown>;
};

export async function enqueueLyricsGenerate(
  db: Db,
  queue: LyricsGenerateQueue,
  opts: { videoId: string; title?: string; subtitleLang: SubtitleLanguage },
): Promise<boolean> {
  const row = await readStoredLyrics(db, opts.videoId, opts.subtitleLang);
  if (!shouldEnqueueLyricsJob(row)) {
    return row?.status === 'pending';
  }
  await markLyricsPending(db, opts.videoId, opts.subtitleLang, opts.title);
  await queue.add(
    'generate',
    {
      videoId: opts.videoId,
      title: opts.title,
      subtitleLang: opts.subtitleLang,
    },
    {
      jobId: lyricsJobId(opts.videoId, opts.subtitleLang),
      removeOnComplete: 80,
      removeOnFail: 40,
    },
  );
  return true;
}
