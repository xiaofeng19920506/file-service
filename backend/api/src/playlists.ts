import { and, asc, desc, eq, inArray, max, or, sql } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import {
  blobs,
  ensureYoutubeAudioJobs,
  fetchYoutubePlaylistData,
  formatUserDisplayName,
  getAudioCacheMap,
  isValidYoutubeVideoId,
  assertPremiumPlaybackAccess,
  playlistItems,
  playlists,
  signPlaylistShareToken,
  verifyPlaylistShareToken,
  type ApiEnv,
  type Db,
  type YoutubeAudioCachePublic,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';
import { expandSearchQuery } from './chinese-search.js';
import { resolveMailConfig, resolveWebAppUrl, sendMail } from './mail.js';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[【】[\]()（）]/g, ' ')
    .trim();
}

async function matchBlobIdForTitle(db: Db, title: string): Promise<string | null> {
  const terms = expandSearchQuery(title);
  if (!terms.length) return null;

  const termClauses = terms.map((term) => {
    const text = `%${term}%`;
    return sql`(
      lower(${blobs.titleEn}) LIKE ${text}
      OR lower(${blobs.titleZhCn}) LIKE ${text}
      OR lower(${blobs.titleZhTw}) LIKE ${text}
      OR lower(${blobs.title}) LIKE ${text}
      OR lower(${blobs.originalFilename}) LIKE ${text}
    )`;
  });

  const rows = await db
    .select()
    .from(blobs)
    .where(termClauses.length === 1 ? termClauses[0]! : or(...termClauses)!)
    .limit(12);

  const target = normalizeTitle(title);
  for (const row of rows) {
    const candidates = [row.titleZhCn, row.titleZhTw, row.titleEn, row.title, row.originalFilename]
      .filter(Boolean)
      .map((v) => normalizeTitle(String(v)));
    if (candidates.some((c) => c === target || c.includes(target) || target.includes(c))) {
      return row.id;
    }
  }

  return rows[0]?.id ?? null;
}

const MANUAL_PLAYLIST_SOURCE = 'manual://playlist';
const LIBRARY_PLAYLIST_SOURCE = 'manual://library';
const LIBRARY_PLAYLIST_TITLE = '我的音乐';

async function assertPlaylistAccess(
  db: Db,
  playlistId: string,
  user: { id: string; role: string },
) {
  const [playlist] = await db.select().from(playlists).where(eq(playlists.id, playlistId));
  if (!playlist) return { error: 'not_found' as const, playlist: null };
  if (playlist.createdByUserId !== user.id && user.role !== 'admin') {
    return { error: 'forbidden' as const, playlist: null };
  }
  return { error: null, playlist };
}

function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

async function appendVideosToPlaylist(
  db: Db,
  playlistId: string,
  videos: { videoId: string; title: string }[],
  audioQueue: Queue,
) {
  const existing = await db
    .select({ youtubeVideoId: playlistItems.youtubeVideoId })
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId));
  const existingIds = new Set(existing.map((row) => row.youtubeVideoId));

  const [maxOrderRow] = await db
    .select({ value: max(playlistItems.sortOrder) })
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId));
  let nextOrder = (maxOrderRow?.value ?? -1) + 1;

  const itemRows = [];
  let skipped = 0;
  for (const video of videos) {
    const videoId = video.videoId.trim();
    const title = video.title.trim();
    if (!isValidYoutubeVideoId(videoId) || !title) continue;
    if (existingIds.has(videoId)) {
      skipped++;
      continue;
    }
    existingIds.add(videoId);
    const blobId = await matchBlobIdForTitle(db, title);
    itemRows.push({
      playlistId,
      sortOrder: nextOrder++,
      title,
      youtubeVideoId: videoId,
      youtubeUrl: youtubeWatchUrl(videoId),
      blobId,
    });
  }

  if (itemRows.length > 0) {
    await db.insert(playlistItems).values(itemRows);
    await db
      .update(playlists)
      .set({ updatedAt: new Date() })
      .where(eq(playlists.id, playlistId));
  }

  const [updated] = await db.select().from(playlists).where(eq(playlists.id, playlistId));
  const detail = await buildPlaylistDetail(db, updated!, audioQueue);
  return { detail, addedCount: itemRows.length, skippedCount: skipped };
}

async function getOrCreateLibraryPlaylist(db: Db, userId: string) {
  const [existing] = await db
    .select()
    .from(playlists)
    .where(
      and(eq(playlists.createdByUserId, userId), eq(playlists.sourceUrl, LIBRARY_PLAYLIST_SOURCE)),
    );
  if (existing) return existing;

  const now = new Date();
  const [created] = await db
    .insert(playlists)
    .values({
      title: LIBRARY_PLAYLIST_TITLE,
      sourceUrl: LIBRARY_PLAYLIST_SOURCE,
      createdByUserId: userId,
      updatedAt: now,
    })
    .returning();
  return created!;
}

async function clonePlaylistForUser(
  db: Db,
  sourcePlaylistId: string,
  userId: string,
): Promise<typeof playlists.$inferSelect | null> {
  const [source] = await db.select().from(playlists).where(eq(playlists.id, sourcePlaylistId));
  if (!source) return null;

  const items = await db
    .select()
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, source.id))
    .orderBy(asc(playlistItems.sortOrder));

  const now = new Date();
  const [newPlaylist] = await db
    .insert(playlists)
    .values({
      title: source.title,
      sourceUrl: source.sourceUrl,
      youtubePlaylistId: source.youtubePlaylistId,
      createdByUserId: userId,
      updatedAt: now,
    })
    .returning();

  if (items.length > 0) {
    await db.insert(playlistItems).values(
      items.map((item) => ({
        playlistId: newPlaylist!.id,
        sortOrder: item.sortOrder,
        title: item.title,
        youtubeVideoId: item.youtubeVideoId,
        youtubeUrl: item.youtubeUrl,
        blobId: item.blobId,
      })),
    );
  }

  return newPlaylist!;
}

async function buildPlaylistDetail(
  db: Db,
  playlist: typeof playlists.$inferSelect,
  audioQueue?: Queue,
) {
  const items = await db
    .select()
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlist.id))
    .orderBy(asc(playlistItems.sortOrder));

  if (audioQueue && items.length > 0) {
    await ensureYoutubeAudioJobs(
      db,
      audioQueue,
      items.map((item) => ({ videoId: item.youtubeVideoId, title: item.title })),
    );
  }

  const audioMap = await getAudioCacheMap(
    db,
    items.map((item) => item.youtubeVideoId),
  );

  const blobIds = [...new Set(items.map((i) => i.blobId).filter(Boolean))] as string[];
  const blobRows =
    blobIds.length > 0
      ? await db.select().from(blobs).where(inArray(blobs.id, blobIds))
      : [];
  const blobMap = new Map(blobRows.map((b) => [b.id, b]));

  return {
    playlist: {
      id: playlist.id,
      title: playlist.title,
      sourceUrl: playlist.sourceUrl,
      youtubePlaylistId: playlist.youtubePlaylistId,
      itemCount: items.length,
      matchedCount: items.filter((i) => i.blobId).length,
      createdAt: playlist.createdAt.toISOString(),
    },
    items: items.map((item) =>
      serializePlaylistItem(
        item,
        item.blobId ? blobMap.get(item.blobId) : null,
        audioMap.get(item.youtubeVideoId),
      ),
    ),
  };
}

function serializePlaylistItem(
  item: typeof playlistItems.$inferSelect,
  blob?: typeof blobs.$inferSelect | null,
  audio?: YoutubeAudioCachePublic,
) {
  return {
    id: item.id,
    sortOrder: item.sortOrder,
    title: item.title,
    youtubeVideoId: item.youtubeVideoId,
    youtubeUrl: item.youtubeUrl,
    blobId: item.blobId,
    audio: audio ?? {
      videoId: item.youtubeVideoId,
      status: 'pending' as const,
      blobId: null,
      errorCode: null,
    },
    blob: blob
      ? {
          id: blob.id,
          title: blob.title,
          titleEn: blob.titleEn,
          titleZhCn: blob.titleZhCn,
          titleZhTw: blob.titleZhTw,
          composer: blob.composer,
          author: blob.author,
          originalFilename: blob.originalFilename,
        }
      : null,
  };
}

export function registerPlaylistRoutes(
  app: FastifyInstance,
  opts: { db: Db; env: ApiEnv; audioQueue: Queue },
) {
  const { db, env, audioQueue } = opts;

  app.post<{ Body: { title?: string } }>('/v1/playlists', async (request, reply) => {
    const user = request.authUser;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const title = request.body?.title?.trim();
    if (!title) return reply.code(400).send({ error: 'title_required' });

    const now = new Date();
    const [playlist] = await db
      .insert(playlists)
      .values({
        title,
        sourceUrl: MANUAL_PLAYLIST_SOURCE,
        createdByUserId: user.id,
        updatedAt: now,
      })
      .returning();

    return buildPlaylistDetail(db, playlist!, audioQueue);
  });

  app.get('/v1/playlists/library', async (request, reply) => {
    const user = request.authUser;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const playlist = await getOrCreateLibraryPlaylist(db, user.id);
    return buildPlaylistDetail(db, playlist, audioQueue);
  });

  app.post<{ Body: { url?: string } }>('/v1/playlists/import', async (request, reply) => {
    const user = request.authUser;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const url = request.body?.url?.trim();
    if (!url) return reply.code(400).send({ error: 'url_required' });

    let imported;
    try {
      imported = await fetchYoutubePlaylistData(url, env.YOUTUBE_API_KEY);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'youtube_import_failed';
      if (msg === 'invalid_youtube_url') {
        return reply.code(400).send({ error: 'invalid_youtube_url' });
      }
      request.log.error(e, 'youtube import failed');
      return reply.code(502).send({ error: 'youtube_import_failed' });
    }

    if (!imported.items.length) {
      return reply.code(400).send({ error: 'youtube_playlist_empty' });
    }

    const now = new Date();
    const [playlist] = await db
      .insert(playlists)
      .values({
        title: imported.title,
        sourceUrl: imported.sourceUrl,
        youtubePlaylistId: imported.playlistId,
        createdByUserId: user.id,
        updatedAt: now,
      })
      .returning();

    const itemRows = [];
    for (let i = 0; i < imported.items.length; i++) {
      const video = imported.items[i]!;
      const blobId = await matchBlobIdForTitle(db, video.title);
      itemRows.push({
        playlistId: playlist.id,
        sortOrder: i,
        title: video.title,
        youtubeVideoId: video.videoId,
        youtubeUrl: video.videoUrl,
        blobId,
      });
    }

    const insertedItems = await db.insert(playlistItems).values(itemRows).returning();

    await ensureYoutubeAudioJobs(
      db,
      audioQueue,
      insertedItems.map((item) => ({ videoId: item.youtubeVideoId, title: item.title })),
    );

    return buildPlaylistDetail(db, playlist!, audioQueue);
  });

  app.get('/v1/playlists', async (request) => {
    const user = request.authUser;
    const rows = user
      ? await db
          .select()
          .from(playlists)
          .where(eq(playlists.createdByUserId, user.id))
          .orderBy(desc(playlists.createdAt))
      : [];

    const counts = await Promise.all(
      rows.map(async (row) => {
        const items = await db
          .select({ blobId: playlistItems.blobId })
          .from(playlistItems)
          .where(eq(playlistItems.playlistId, row.id));
        return {
          itemCount: items.length,
          matchedCount: items.filter((i) => i.blobId).length,
        };
      }),
    );

    return {
      playlists: rows.map((row, index) => ({
        id: row.id,
        title: row.title,
        sourceUrl: row.sourceUrl,
        youtubePlaylistId: row.youtubePlaylistId,
        itemCount: counts[index]?.itemCount ?? 0,
        matchedCount: counts[index]?.matchedCount ?? 0,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });

  app.get<{ Params: { id: string } }>('/v1/playlists/:id', async (request, reply) => {
    const user = request.authUser;
    const id = request.params.id;
    const [playlist] = await db.select().from(playlists).where(eq(playlists.id, id));
    if (!playlist) return reply.code(404).send({ error: 'not_found' });
    if (user && playlist.createdByUserId !== user.id && user.role !== 'admin') {
      return reply.code(403).send({ error: 'forbidden' });
    }

    return buildPlaylistDetail(db, playlist, audioQueue);
  });

  app.post<{
    Params: { id: string };
    Body: { url?: string; items?: { videoId?: string; title?: string }[] };
  }>(
    '/v1/playlists/:id/items',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const { id } = request.params;
      const access = await assertPlaylistAccess(db, id, user);
      if (access.error === 'not_found') return reply.code(404).send({ error: 'not_found' });
      if (access.error === 'forbidden') return reply.code(403).send({ error: 'forbidden' });

      const premiumAccess = await assertPremiumPlaybackAccess(db, user.id, request.headers);
      if (!premiumAccess.ok) {
        return reply.code(403).send({ error: premiumAccess.error });
      }

      const bodyItems = request.body?.items;
      if (Array.isArray(bodyItems) && bodyItems.length > 0) {
        const videos = bodyItems
          .map((row) => ({
            videoId: row.videoId?.trim() ?? '',
            title: row.title?.trim() ?? '',
          }))
          .filter((row) => row.videoId && row.title);
        if (!videos.length) return reply.code(400).send({ error: 'invalid_request' });

        const result = await appendVideosToPlaylist(db, id, videos, audioQueue);
        if (!result.addedCount) {
          return reply.code(409).send({
            error: 'playlist_items_duplicate',
            skipped: result.skippedCount,
          });
        }
        return { ...result.detail, addedCount: result.addedCount, skippedCount: result.skippedCount };
      }

      const url = request.body?.url?.trim();
      if (!url) return reply.code(400).send({ error: 'url_required' });

      let imported;
      try {
        imported = await fetchYoutubePlaylistData(url, env.YOUTUBE_API_KEY);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'youtube_import_failed';
        if (msg === 'invalid_youtube_url') {
          return reply.code(400).send({ error: 'invalid_youtube_url' });
        }
        request.log.error(e, 'youtube add items failed');
        return reply.code(502).send({ error: 'youtube_import_failed' });
      }

      if (!imported.items.length) {
        return reply.code(400).send({ error: 'youtube_playlist_empty' });
      }

      const result = await appendVideosToPlaylist(
        db,
        id,
        imported.items.map((video) => ({ videoId: video.videoId, title: video.title })),
        audioQueue,
      );
      if (!result.addedCount) {
        return reply.code(409).send({
          error: 'playlist_items_duplicate',
          skipped: result.skippedCount,
        });
      }
      return { ...result.detail, addedCount: result.addedCount, skippedCount: result.skippedCount };
    },
  );

  app.patch<{ Params: { id: string }; Body: { title?: string } }>(
    '/v1/playlists/:id',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const { id } = request.params;
      const access = await assertPlaylistAccess(db, id, user);
      if (access.error === 'not_found') return reply.code(404).send({ error: 'not_found' });
      if (access.error === 'forbidden') return reply.code(403).send({ error: 'forbidden' });

      const title = request.body?.title?.trim();
      if (!title) return reply.code(400).send({ error: 'title_required' });

      const now = new Date();
      await db
        .update(playlists)
        .set({ title, updatedAt: now })
        .where(eq(playlists.id, id));

      const [updated] = await db.select().from(playlists).where(eq(playlists.id, id));
      return buildPlaylistDetail(db, updated!, audioQueue);
    },
  );

  app.delete<{ Params: { id: string } }>('/v1/playlists/:id', async (request, reply) => {
    const user = request.authUser;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const id = request.params.id;
    const [playlist] = await db.select().from(playlists).where(eq(playlists.id, id));
    if (!playlist) return reply.code(404).send({ error: 'not_found' });
    if (playlist.createdByUserId !== user.id && user.role !== 'admin') {
      return reply.code(403).send({ error: 'forbidden' });
    }

    await db.delete(playlists).where(eq(playlists.id, id));
    return { ok: true };
  });

  app.put<{ Params: { id: string }; Body: { itemIds?: string[] } }>(
    '/v1/playlists/:id/items/order',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const { id } = request.params;
      const access = await assertPlaylistAccess(db, id, user);
      if (access.error === 'not_found') return reply.code(404).send({ error: 'not_found' });
      if (access.error === 'forbidden') return reply.code(403).send({ error: 'forbidden' });

      const itemIds = request.body?.itemIds;
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return reply.code(400).send({ error: 'invalid_order' });
      }

      const existing = await db
        .select({ id: playlistItems.id })
        .from(playlistItems)
        .where(eq(playlistItems.playlistId, id));

      if (existing.length !== itemIds.length) {
        return reply.code(400).send({ error: 'invalid_order' });
      }

      const idSet = new Set(existing.map((row) => row.id));
      if (!itemIds.every((itemId) => idSet.has(itemId))) {
        return reply.code(400).send({ error: 'invalid_order' });
      }

      await db.transaction(async (tx) => {
        for (let i = 0; i < itemIds.length; i++) {
          await tx
            .update(playlistItems)
            .set({ sortOrder: -(i + 1) })
            .where(and(eq(playlistItems.id, itemIds[i]!), eq(playlistItems.playlistId, id)));
        }
        for (let i = 0; i < itemIds.length; i++) {
          await tx
            .update(playlistItems)
            .set({ sortOrder: i })
            .where(and(eq(playlistItems.id, itemIds[i]!), eq(playlistItems.playlistId, id)));
        }
      });

      await db
        .update(playlists)
        .set({ updatedAt: new Date() })
        .where(eq(playlists.id, id));

      const [updated] = await db.select().from(playlists).where(eq(playlists.id, id));
      return buildPlaylistDetail(db, updated!, audioQueue);
    },
  );

  app.delete<{ Params: { id: string; itemId: string } }>(
    '/v1/playlists/:id/items/:itemId',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const { id, itemId } = request.params;
      const access = await assertPlaylistAccess(db, id, user);
      if (access.error === 'not_found') return reply.code(404).send({ error: 'not_found' });
      if (access.error === 'forbidden') return reply.code(403).send({ error: 'forbidden' });

      const [deleted] = await db
        .delete(playlistItems)
        .where(and(eq(playlistItems.id, itemId), eq(playlistItems.playlistId, id)))
        .returning();

      if (!deleted) return reply.code(404).send({ error: 'not_found' });

      await db
        .update(playlists)
        .set({ updatedAt: new Date() })
        .where(eq(playlists.id, id));

      return { ok: true };
    },
  );

  app.patch<{
    Params: { id: string; itemId: string };
    Body: { blobId?: string | null };
  }>('/v1/playlists/:id/items/:itemId', async (request, reply) => {
    const user = request.authUser;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const { id, itemId } = request.params;
    const [playlist] = await db.select().from(playlists).where(eq(playlists.id, id));
    if (!playlist) return reply.code(404).send({ error: 'not_found' });
    if (playlist.createdByUserId !== user.id && user.role !== 'admin') {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const blobId = request.body?.blobId ?? null;
    if (blobId) {
      const [blob] = await db.select().from(blobs).where(eq(blobs.id, blobId));
      if (!blob) return reply.code(400).send({ error: 'unknown_blob_id' });
    }

    const [item] = await db
      .update(playlistItems)
      .set({ blobId })
      .where(and(eq(playlistItems.id, itemId), eq(playlistItems.playlistId, id)))
      .returning();

    if (!item) return reply.code(404).send({ error: 'not_found' });

    const blob = blobId
      ? (await db.select().from(blobs).where(eq(blobs.id, blobId)))[0] ?? null
      : null;

    return { item: serializePlaylistItem(item, blob) };
  });

  app.post<{ Params: { id: string }; Body: { email?: string; message?: string } }>(
    '/v1/playlists/:id/share',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const mailConfig = resolveMailConfig(env);
      if (!mailConfig) {
        return reply.code(503).send({ error: 'email_not_configured' });
      }

      const { id } = request.params;
      const access = await assertPlaylistAccess(db, id, user);
      if (access.error === 'not_found') return reply.code(404).send({ error: 'not_found' });
      if (access.error === 'forbidden') return reply.code(403).send({ error: 'forbidden' });

      const recipientEmail = normalizeEmail(request.body?.email ?? '');
      if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
        return reply.code(400).send({ error: 'invalid_email' });
      }

      const playlist = access.playlist!;
      const detail = await buildPlaylistDetail(db, playlist, audioQueue);
      const expiresAtUnix = Math.floor(Date.now() / 1000) + env.SHARE_LINK_TTL_SECONDS;
      const token = signPlaylistShareToken({
        secret: env.DOWNLOAD_HMAC_SECRET,
        playlistId: playlist.id,
        expiresAtUnix,
      });

      const webAppUrl = resolveWebAppUrl(env);
      const shareUrl = `${webAppUrl}/#/playlists?share=${encodeURIComponent(token)}`;
      const senderName = formatUserDisplayName(user) || user.email;
      const optionalMessage = request.body?.message?.trim();
      const trackLabel = `${detail.playlist.itemCount}`;

      const subject = `${senderName} 分享了敬拜列表「${playlist.title}」`;
      const textLines = [
        `${senderName} 向你分享了敬拜列表「${playlist.title}」（${trackLabel} 首）。`,
        optionalMessage ? `\n附言：${optionalMessage}\n` : '',
        `打开链接查看并保存到你的账户：`,
        shareUrl,
        '',
        `链接 ${Math.ceil(env.SHARE_LINK_TTL_SECONDS / 86_400)} 天内有效。`,
      ].filter((line) => line !== '');

      try {
        await sendMail({
          config: mailConfig,
          to: recipientEmail,
          subject,
          text: textLines.join('\n'),
          html: [
            `<p><strong>${escapeHtml(senderName)}</strong> 向你分享了敬拜列表「${escapeHtml(playlist.title)}」（${trackLabel} 首）。</p>`,
            optionalMessage
              ? `<p><strong>附言：</strong>${escapeHtml(optionalMessage)}</p>`
              : '',
            `<p><a href="${escapeHtml(shareUrl)}">打开链接查看并保存</a></p>`,
            `<p style="color:#666;font-size:13px;">链接 ${Math.ceil(env.SHARE_LINK_TTL_SECONDS / 86_400)} 天内有效。</p>`,
          ]
            .filter(Boolean)
            .join(''),
        });
      } catch (e) {
        request.log.error(e, 'playlist share email failed');
        return reply.code(502).send({ error: 'email_send_failed' });
      }

      return { ok: true };
    },
  );

  app.get<{ Params: { token: string } }>(
    '/v1/playlists/share/:token',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const claims = verifyPlaylistShareToken({
        secret: env.DOWNLOAD_HMAC_SECRET,
        token: request.params.token,
      });
      if (!claims) return reply.code(400).send({ error: 'invalid_share_token' });

      const [playlist] = await db
        .select()
        .from(playlists)
        .where(eq(playlists.id, claims.playlistId));
      if (!playlist) return reply.code(404).send({ error: 'not_found' });

      const detail = await buildPlaylistDetail(db, playlist, audioQueue);

      return {
        ...detail,
        sharedByPlaylistId: playlist.id,
        isOwner: playlist.createdByUserId === user.id,
      };
    },
  );

  app.post<{ Params: { token: string } }>(
    '/v1/playlists/share/:token/accept',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const claims = verifyPlaylistShareToken({
        secret: env.DOWNLOAD_HMAC_SECRET,
        token: request.params.token,
      });
      if (!claims) return reply.code(400).send({ error: 'invalid_share_token' });

      const [playlist] = await db
        .select()
        .from(playlists)
        .where(eq(playlists.id, claims.playlistId));
      if (!playlist) return reply.code(404).send({ error: 'not_found' });

      if (playlist.createdByUserId === user.id) {
        return buildPlaylistDetail(db, playlist, audioQueue);
      }

      const cloned = await clonePlaylistForUser(db, playlist.id, user.id);
      if (!cloned) return reply.code(404).send({ error: 'not_found' });

      return buildPlaylistDetail(db, cloned, audioQueue);
    },
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
