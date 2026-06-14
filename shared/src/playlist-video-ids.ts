import { eq } from 'drizzle-orm';
import { playlistItems, playlists, type Db } from './db/index.js';

export async function getUserLibraryVideoIdSet(db: Db, userId: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ youtubeVideoId: playlistItems.youtubeVideoId })
    .from(playlistItems)
    .innerJoin(playlists, eq(playlistItems.playlistId, playlists.id))
    .where(eq(playlists.createdByUserId, userId));

  return new Set(rows.map((row) => row.youtubeVideoId));
}
