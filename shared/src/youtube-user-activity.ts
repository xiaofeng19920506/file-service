import { desc, eq, sql } from 'drizzle-orm';
import { isValidYoutubeVideoId } from './youtube-audio-extract.js';
import { youtubeUserPlays, youtubeUserSearches, type Db } from './db/index.js';

const USER_PLAY_RETENTION = 120;
const USER_SEARCH_RETENTION = 60;

export async function recordYoutubeUserPlay(
  db: Db,
  userId: string,
  input: { videoId: string; title: string; channelTitle?: string | null },
): Promise<void> {
  const videoId = input.videoId.trim();
  const title = input.title.trim();
  if (!isValidYoutubeVideoId(videoId) || !title) return;

  await db.insert(youtubeUserPlays).values({
    userId,
    youtubeVideoId: videoId,
    title,
    channelTitle: input.channelTitle?.trim() || null,
  });

  await db.execute(sql`
    DELETE FROM youtube_user_plays
    WHERE user_id = ${userId}
      AND id NOT IN (
        SELECT id FROM youtube_user_plays
        WHERE user_id = ${userId}
        ORDER BY played_at DESC
        LIMIT ${USER_PLAY_RETENTION}
      )
  `);
}

export async function recordYoutubeUserSearch(db: Db, userId: string, query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length > 200) return;

  await db.insert(youtubeUserSearches).values({
    userId,
    query: trimmed,
  });

  await db.execute(sql`
    DELETE FROM youtube_user_searches
    WHERE user_id = ${userId}
      AND id NOT IN (
        SELECT id FROM youtube_user_searches
        WHERE user_id = ${userId}
        ORDER BY searched_at DESC
        LIMIT ${USER_SEARCH_RETENTION}
      )
  `);
}

export async function fetchRecentUserPlaysForRecommendations(
  db: Db,
  userId: string,
  limit: number,
) {
  const rows = await db
    .select({
      videoId: youtubeUserPlays.youtubeVideoId,
      title: youtubeUserPlays.title,
      channelTitle: youtubeUserPlays.channelTitle,
      playedAt: youtubeUserPlays.playedAt,
    })
    .from(youtubeUserPlays)
    .where(eq(youtubeUserPlays.userId, userId))
    .orderBy(desc(youtubeUserPlays.playedAt))
    .limit(limit);

  const seen = new Set<string>();
  const plays: Array<{ videoId: string; title: string; channelTitle: string | null; weight: number }> =
    [];
  for (const row of rows) {
    if (!isValidYoutubeVideoId(row.videoId) || !row.title.trim()) continue;
    if (seen.has(row.videoId)) continue;
    seen.add(row.videoId);
    plays.push({
      videoId: row.videoId,
      title: row.title.trim(),
      channelTitle: row.channelTitle?.trim() || null,
      weight: 5 * Math.pow(0.82, plays.length),
    });
  }
  return plays;
}

export async function fetchRecentUserSearchesForRecommendations(
  db: Db,
  userId: string,
  limit: number,
) {
  const rows = await db
    .select({
      query: youtubeUserSearches.query,
      searchedAt: youtubeUserSearches.searchedAt,
    })
    .from(youtubeUserSearches)
    .where(eq(youtubeUserSearches.userId, userId))
    .orderBy(desc(youtubeUserSearches.searchedAt))
    .limit(limit);

  const seen = new Set<string>();
  const searches: Array<{ query: string; weight: number }> = [];
  for (const row of rows) {
    const query = row.query.trim();
    if (!query) continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    searches.push({ query, weight: 4 * Math.pow(0.82, searches.length) });
  }
  return searches;
}
