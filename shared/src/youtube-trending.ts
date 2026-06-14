import { desc, eq, sql } from 'drizzle-orm';
import { isValidYoutubeVideoId } from './youtube-audio-extract.js';
import { getUserLibraryVideoIdSet } from './playlist-video-ids.js';
import { playlistItems, youtubeVideoDailyPlays, type Db } from './db/index.js';

export type TrendingSong = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  playCount: number;
  inLibrary: boolean;
};

export type TrendingScope = 'today' | 'all_time' | 'popular';

export type TrendingSongsResult = {
  scope: TrendingScope;
  songs: TrendingSong[];
};

function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function recordYoutubeVideoPlay(
  db: Db,
  input: { videoId: string; title: string; channelTitle?: string | null },
): Promise<void> {
  const videoId = input.videoId.trim();
  const title = input.title.trim();
  if (!isValidYoutubeVideoId(videoId) || !title) return;

  const playDate = todayUtcDateString();
  const channelTitle = input.channelTitle?.trim() || null;

  await db
    .insert(youtubeVideoDailyPlays)
    .values({
      playDate,
      youtubeVideoId: videoId,
      title,
      channelTitle,
      playCount: 1,
    })
    .onConflictDoUpdate({
      target: [youtubeVideoDailyPlays.playDate, youtubeVideoDailyPlays.youtubeVideoId],
      set: {
        playCount: sql`${youtubeVideoDailyPlays.playCount} + 1`,
        title,
        channelTitle,
      },
    });
}

async function fetchTodayTrending(db: Db, limit: number): Promise<Omit<TrendingSong, 'inLibrary'>[]> {
  const playDate = todayUtcDateString();
  const rows = await db
    .select({
      videoId: youtubeVideoDailyPlays.youtubeVideoId,
      title: youtubeVideoDailyPlays.title,
      channelTitle: youtubeVideoDailyPlays.channelTitle,
      playCount: youtubeVideoDailyPlays.playCount,
    })
    .from(youtubeVideoDailyPlays)
    .where(eq(youtubeVideoDailyPlays.playDate, playDate))
    .orderBy(desc(youtubeVideoDailyPlays.playCount), desc(youtubeVideoDailyPlays.youtubeVideoId))
    .limit(limit);

  return rows.map((row) => ({
    videoId: row.videoId,
    title: row.title,
    channelTitle: row.channelTitle,
    playCount: row.playCount,
  }));
}

async function fetchAllTimeTrending(db: Db, limit: number): Promise<Omit<TrendingSong, 'inLibrary'>[]> {
  const rows = await db
    .select({
      videoId: youtubeVideoDailyPlays.youtubeVideoId,
      title: sql<string>`max(${youtubeVideoDailyPlays.title})`,
      channelTitle: sql<string | null>`max(${youtubeVideoDailyPlays.channelTitle})`,
      playCount: sql<number>`sum(${youtubeVideoDailyPlays.playCount})::int`,
    })
    .from(youtubeVideoDailyPlays)
    .groupBy(youtubeVideoDailyPlays.youtubeVideoId)
    .orderBy(desc(sql`sum(${youtubeVideoDailyPlays.playCount})`), desc(youtubeVideoDailyPlays.youtubeVideoId))
    .limit(limit);

  return rows
    .filter((row) => isValidYoutubeVideoId(row.videoId) && row.title.trim())
    .map((row) => ({
      videoId: row.videoId,
      title: row.title.trim(),
      channelTitle: row.channelTitle?.trim() || null,
      playCount: Number(row.playCount) || 0,
    }));
}

async function fetchPopularFromLibrary(db: Db, limit: number): Promise<Omit<TrendingSong, 'inLibrary'>[]> {
  const rows = await db
    .select({
      videoId: playlistItems.youtubeVideoId,
      title: sql<string>`max(${playlistItems.title})`,
      playCount: sql<number>`count(*)::int`,
    })
    .from(playlistItems)
    .groupBy(playlistItems.youtubeVideoId)
    .orderBy(desc(sql`count(*)`), desc(playlistItems.youtubeVideoId))
    .limit(limit);

  return rows
    .filter((row) => isValidYoutubeVideoId(row.videoId) && row.title.trim())
    .map((row) => ({
      videoId: row.videoId,
      title: row.title.trim(),
      channelTitle: null,
      playCount: Number(row.playCount) || 0,
    }));
}

export async function getTrendingYoutubeSongs(
  db: Db,
  limit = 10,
  userId?: string,
): Promise<TrendingSongsResult> {
  const capped = Math.min(Math.max(limit, 1), 20);

  let scope: TrendingScope = 'popular';
  let songs: Omit<TrendingSong, 'inLibrary'>[] = [];

  const today = await fetchTodayTrending(db, capped);
  if (today.length > 0) {
    scope = 'today';
    songs = today;
  } else {
    const allTime = await fetchAllTimeTrending(db, capped);
    if (allTime.length > 0) {
      scope = 'all_time';
      songs = allTime;
    } else {
      songs = await fetchPopularFromLibrary(db, capped);
    }
  }

  const libraryIds = userId ? await getUserLibraryVideoIdSet(db, userId) : new Set<string>();
  return {
    scope,
    songs: songs.map((song) => ({
      ...song,
      inLibrary: libraryIds.has(song.videoId),
    })),
  };
}

export function trendingSongVideoUrl(videoId: string): string {
  return youtubeWatchUrl(videoId);
}
