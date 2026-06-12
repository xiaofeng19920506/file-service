/**
 * 创建 / 更新 App Store 审核演示账号与示例歌单。
 *
 * 用法（在 file-service 根目录）：
 *   npm run seed:app-store-review
 *
 * 环境变量（可选，见 .env.example）：
 *   APP_STORE_REVIEW_EMAIL
 *   APP_STORE_REVIEW_PASSWORD
 *   APP_STORE_REVIEW_FIRST_NAME
 *   APP_STORE_REVIEW_LAST_NAME
 *   APP_STORE_REVIEW_PLAYLIST_URL   — YouTube 歌单或单曲链接，留空则用内置演示曲目
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { createDb, fetchYoutubePlaylistData, playlistItems, playlists, users } from '@file-service/shared';
import { hashPassword } from '../backend/api/src/auth.js';

const MANUAL_SOURCE = 'manual://app-store-review';

const DEFAULT_EMAIL = 'appstore.review@playlistplayer.app';
const DEFAULT_PASSWORD = 'ReviewDemo2026!';

/** 无网络或导入失败时的兜底曲目（Creative Commons / 稳定公开视频） */
const FALLBACK_ITEMS = [
  {
    videoId: 'C0DPdy98e4c',
    title: 'Demo Track 1 — Kevin MacLeod (CC)',
    youtubeUrl: 'https://www.youtube.com/watch?v=C0DPdy98e4c',
  },
  {
    videoId: '496o8UIH_rU',
    title: 'Demo Track 2 — Gymnopedie (Classical)',
    youtubeUrl: 'https://www.youtube.com/watch?v=496o8UIH_rU',
  },
  {
    videoId: 'jgHeM9o5YlQ',
    title: 'Demo Track 3 — Ambient Demo',
    youtubeUrl: 'https://www.youtube.com/watch?v=jgHeM9o5YlQ',
  },
] as const;

function env(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v || fallback;
}

async function resolvePlaylistItems(): Promise<
  { title: string; sourceUrl: string; youtubePlaylistId: string | null; items: typeof FALLBACK_ITEMS[number][] }
> {
  const importUrl = process.env.APP_STORE_REVIEW_PLAYLIST_URL?.trim();
  if (importUrl) {
    try {
      const imported = await fetchYoutubePlaylistData(importUrl, process.env.YOUTUBE_API_KEY);
      if (imported.items.length) {
        const slice = imported.items.slice(0, 12);
        return {
          title: imported.title || 'App Store 审核演示',
          sourceUrl: imported.sourceUrl,
          youtubePlaylistId: imported.playlistId,
          items: slice.map((v) => ({
            videoId: v.videoId,
            title: v.title,
            youtubeUrl: v.videoUrl,
          })),
        };
      }
    } catch (err) {
      console.warn('[seed] YouTube 导入失败，使用内置演示曲目:', err instanceof Error ? err.message : err);
    }
  }

  return {
    title: 'App Store 审核演示',
    sourceUrl: MANUAL_SOURCE,
    youtubePlaylistId: null,
    items: [...FALLBACK_ITEMS],
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const email = env('APP_STORE_REVIEW_EMAIL', DEFAULT_EMAIL).toLowerCase();
  const password = env('APP_STORE_REVIEW_PASSWORD', DEFAULT_PASSWORD);
  const firstName = env('APP_STORE_REVIEW_FIRST_NAME', 'App Store');
  const lastName = env('APP_STORE_REVIEW_LAST_NAME', 'Reviewer');

  const db = createDb(databaseUrl);
  const passwordHash = hashPassword(password);

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  let userId: string;

  if (existing) {
    await db
      .update(users)
      .set({ passwordHash, firstName, lastName, role: 'member' })
      .where(eq(users.id, existing.id));
    userId = existing.id;
    console.log(`[seed] 已更新用户: ${email}`);
  } else {
    const [created] = await db
      .insert(users)
      .values({ email, passwordHash, firstName, lastName, role: 'member' })
      .returning();
    userId = created!.id;
    console.log(`[seed] 已创建用户: ${email}`);
  }

  const demo = await resolvePlaylistItems();
  const reviewTitle = 'App Store 审核演示';

  const existingPlaylists = await db
    .select()
    .from(playlists)
    .where(eq(playlists.createdByUserId, userId));

  const reviewPlaylist =
    existingPlaylists.find((p) => p.title === reviewTitle) ?? existingPlaylists[0];

  const now = new Date();
  let playlistId: string;

  if (reviewPlaylist) {
    playlistId = reviewPlaylist.id;
    await db
      .update(playlists)
      .set({
        title: reviewTitle,
        sourceUrl: demo.sourceUrl,
        youtubePlaylistId: demo.youtubePlaylistId,
        updatedAt: now,
      })
      .where(eq(playlists.id, playlistId));
    await db.delete(playlistItems).where(eq(playlistItems.playlistId, playlistId));
    console.log(`[seed] 已重置歌单: ${reviewTitle}`);
  } else {
    const [created] = await db
      .insert(playlists)
      .values({
        title: reviewTitle,
        sourceUrl: demo.sourceUrl,
        youtubePlaylistId: demo.youtubePlaylistId,
        createdByUserId: userId,
        updatedAt: now,
      })
      .returning();
    playlistId = created!.id;
    console.log(`[seed] 已创建歌单: ${reviewTitle}`);
  }

  await db.insert(playlistItems).values(
    demo.items.map((item, index) => ({
      playlistId,
      sortOrder: index,
      title: item.title,
      youtubeVideoId: item.videoId,
      youtubeUrl: item.youtubeUrl,
    })),
  );

  console.log('');
  console.log('=== App Store 审核账号 ===');
  console.log(`邮箱:     ${email}`);
  console.log(`密码:     ${password}`);
  console.log(`歌单:     ${reviewTitle}（${demo.items.length} 首）`);
  console.log('');
  console.log('请将以上信息填入 App Store Connect → App 审核信息。');
  console.log('首次播放某曲目时 worker 会提取音频，请确保 API + Worker 已运行。');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
