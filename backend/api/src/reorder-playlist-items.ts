import { and, eq } from 'drizzle-orm';
import { playlistItems, type Db } from '@file-service/shared';

/**
 * 重排 playlist_items.sort_order。
 * 表上有 (playlist_id, sort_order) 唯一索引，不能直接写成目标序号（并行/中间态会 23505）。
 * 先写成互不冲突的负数，再写成 0..n-1。
 */
export async function reorderPlaylistItems(
  db: Db,
  playlistId: string,
  itemIds: readonly string[],
): Promise<void> {
  if (!itemIds.length) return;
  await db.transaction(async (tx) => {
    for (let i = 0; i < itemIds.length; i++) {
      await tx
        .update(playlistItems)
        .set({ sortOrder: -(i + 1) })
        .where(and(eq(playlistItems.id, itemIds[i]!), eq(playlistItems.playlistId, playlistId)));
    }
    for (let i = 0; i < itemIds.length; i++) {
      await tx
        .update(playlistItems)
        .set({ sortOrder: i })
        .where(and(eq(playlistItems.id, itemIds[i]!), eq(playlistItems.playlistId, playlistId)));
    }
  });
}
