import { and, eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import {
  fetchYoutubePlaylistData,
  fetchYoutubeSearchSuggestionsRemote,
  playlistItems,
  playlists,
  searchYoutubeVideos,
  searchYoutubeVideosViaYtdlp,
  verifyPlaylistEditToken,
  weeklyBulletins,
  YOUTUBE_SEARCH_DEFAULT_PAGE_SIZE,
  YOUTUBE_SEARCH_MAX_PAGE_SIZE,
  parsePlayClipSeconds,
  assertClipRange,
  type ApiEnv,
  type Db,
} from '@file-service/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { appendVideosToPlaylist, buildPlaylistDetail } from './playlists.js';
import { notifyBulletinPlaylistUpdated } from './bulletin-realtime.js';
import { parseWorshipInviteRest } from './worship-invite-path.js';

async function resolvePlaylistEditInvite(
  db: Db,
  secret: string,
  token: string,
): Promise<
  | { error: 'invalid_invite_token' | 'not_found' }
  | {
      playlist: typeof playlists.$inferSelect;
      bulletin: typeof weeklyBulletins.$inferSelect;
    }
> {
  const claims = verifyPlaylistEditToken({ secret, token });
  if (!claims) return { error: 'invalid_invite_token' };

  const [playlist] = await db.select().from(playlists).where(eq(playlists.id, claims.playlistId));
  if (!playlist) return { error: 'not_found' };

  const [bulletin] = await db
    .select()
    .from(weeklyBulletins)
    .where(eq(weeklyBulletins.id, claims.bulletinId));
  if (!bulletin || bulletin.servicePlaylistId !== playlist.id) {
    return { error: 'invalid_invite_token' };
  }

  return { playlist, bulletin };
}

function inviteError(reply: FastifyReply, error: 'invalid_invite_token' | 'not_found') {
  if (error === 'invalid_invite_token') {
    return reply.code(400).send({ error: 'invalid_invite_token' });
  }
  return reply.code(404).send({ error: 'not_found' });
}

/**
 * 敬拜邀请：令牌很长且含多个 `.`，Fastify `:param` 会匹配失败（约 >100 字符）。
 * 统一注册 `/v1/playlists/invite/*`，再从通配段解析 token 与子路径。
 */
export function registerWorshipPlaylistInviteRoutes(
  app: FastifyInstance,
  opts: { db: Db; env: ApiEnv; audioQueue: Queue; redisUrl: string },
) {
  const { db, env, audioQueue, redisUrl } = opts;

  const notifyPlaylist = (bulletinId: string) => {
    void notifyBulletinPlaylistUpdated(redisUrl, bulletinId).catch((err) => {
      app.log.error(err, 'bulletin playlist realtime notify failed');
    });
  };

  app.get<{ Params: { '*': string }; Querystring: Record<string, string | undefined> }>(
    '/v1/playlists/invite/*',
    async (request, reply) => {
      const parsed = parseWorshipInviteRest(request.params['*'] ?? '');
      if (parsed.kind === 'unknown') {
        return reply.code(404).send({ error: 'not_found' });
      }

      if (parsed.kind === 'youtubeSuggest') {
        const resolved = await resolvePlaylistEditInvite(
          db,
          env.DOWNLOAD_HMAC_SECRET,
          parsed.token,
        );
        if ('error' in resolved) return inviteError(reply, resolved.error);

        const q = request.query.q?.trim() ?? '';
        if (!q) return { suggestions: [] };
        if (q.length > 200) return reply.code(400).send({ error: 'query_too_long' });

        try {
          const suggestions = await fetchYoutubeSearchSuggestionsRemote(q);
          return { suggestions: suggestions.slice(0, 12) };
        } catch (e) {
          request.log.warn(e, 'invite youtube search suggest failed');
          return { suggestions: [] };
        }
      }

      if (parsed.kind === 'youtubeSearch') {
        const resolved = await resolvePlaylistEditInvite(
          db,
          env.DOWNLOAD_HMAC_SECRET,
          parsed.token,
        );
        if ('error' in resolved) return inviteError(reply, resolved.error);

        const q = request.query.q?.trim() ?? '';
        if (!q) return reply.code(400).send({ error: 'query_required' });
        if (q.length > 200) return reply.code(400).send({ error: 'query_too_long' });

        const limitRaw = Number.parseInt(
          request.query.limit ?? String(YOUTUBE_SEARCH_DEFAULT_PAGE_SIZE),
          10,
        );
        const maxResults = Number.isFinite(limitRaw)
          ? Math.min(Math.max(limitRaw, 1), YOUTUBE_SEARCH_MAX_PAGE_SIZE)
          : YOUTUBE_SEARCH_DEFAULT_PAGE_SIZE;

        const pageToken = request.query.pageToken?.trim() || undefined;
        const offsetRaw = Number.parseInt(request.query.offset ?? '0', 10);
        const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

        try {
          const page = env.YOUTUBE_API_KEY
            ? await searchYoutubeVideos(q, env.YOUTUBE_API_KEY, { maxResults, pageToken })
            : await searchYoutubeVideosViaYtdlp(q, env.YT_DLP_PATH, { maxResults, offset });

          return {
            query: q,
            ...page,
            results: page.results.map((row) => ({
              ...row,
              inLibrary: false,
            })),
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'youtube_search_failed';
          if (msg === 'ytdlp_not_installed') {
            return reply.code(503).send({ error: 'ytdlp_not_installed' });
          }
          request.log.error(e, 'invite youtube search failed');
          return reply.code(502).send({ error: 'youtube_search_failed' });
        }
      }

      if (parsed.kind !== 'detail') {
        return reply.code(404).send({ error: 'not_found' });
      }

      const resolved = await resolvePlaylistEditInvite(
        db,
        env.DOWNLOAD_HMAC_SECRET,
        parsed.token,
      );
      if ('error' in resolved) return inviteError(reply, resolved.error);

      const detail = await buildPlaylistDetail(db, resolved.playlist, audioQueue);
      return {
        ...detail,
        bulletin: {
          id: resolved.bulletin.id,
          serviceDate: resolved.bulletin.serviceDate,
          serviceTime: resolved.bulletin.serviceTime,
        },
        canEdit: true,
      };
    },
  );

  app.post<{
    Params: { '*': string };
    Body: { url?: string; items?: { videoId?: string; title?: string }[] };
  }>('/v1/playlists/invite/*', async (request, reply) => {
    const parsed = parseWorshipInviteRest(request.params['*'] ?? '');
    if (parsed.kind !== 'items') {
      return reply.code(404).send({ error: 'not_found' });
    }

    const resolved = await resolvePlaylistEditInvite(
      db,
      env.DOWNLOAD_HMAC_SECRET,
      parsed.token,
    );
    if ('error' in resolved) return inviteError(reply, resolved.error);

    const playlistId = resolved.playlist.id;
    const bodyItems = request.body?.items;
    if (Array.isArray(bodyItems) && bodyItems.length > 0) {
      const videos = bodyItems
        .map((row) => ({
          videoId: row.videoId?.trim() ?? '',
          title: row.title?.trim() ?? '',
        }))
        .filter((row) => row.videoId && row.title);
      if (!videos.length) return reply.code(400).send({ error: 'invalid_request' });

      const result = await appendVideosToPlaylist(db, playlistId, videos, audioQueue);
      if (!result.addedCount) {
        return reply.code(409).send({
          error: 'playlist_items_duplicate',
          skipped: result.skippedCount,
        });
      }
      notifyPlaylist(resolved.bulletin.id);
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
      request.log.error(e, 'youtube invite add items failed');
      return reply.code(502).send({ error: 'youtube_import_failed' });
    }

    if (!imported.items.length) {
      return reply.code(400).send({ error: 'youtube_playlist_empty' });
    }

    const result = await appendVideosToPlaylist(
      db,
      playlistId,
      imported.items.map((video) => ({ videoId: video.videoId, title: video.title })),
      audioQueue,
    );
    if (!result.addedCount) {
      return reply.code(409).send({
        error: 'playlist_items_duplicate',
        skipped: result.skippedCount,
      });
    }
    notifyPlaylist(resolved.bulletin.id);
    return { ...result.detail, addedCount: result.addedCount, skippedCount: result.skippedCount };
  });

  app.put<{ Params: { '*': string }; Body: { itemIds?: string[] } }>(
    '/v1/playlists/invite/*',
    async (request, reply) => {
      const parsed = parseWorshipInviteRest(request.params['*'] ?? '');
      if (parsed.kind !== 'order') {
        return reply.code(404).send({ error: 'not_found' });
      }

      const resolved = await resolvePlaylistEditInvite(
        db,
        env.DOWNLOAD_HMAC_SECRET,
        parsed.token,
      );
      if ('error' in resolved) return inviteError(reply, resolved.error);

      const itemIds = request.body?.itemIds;
      if (!Array.isArray(itemIds) || !itemIds.length) {
        return reply.code(400).send({ error: 'invalid_request' });
      }

      const playlistId = resolved.playlist.id;
      const items = await db
        .select()
        .from(playlistItems)
        .where(eq(playlistItems.playlistId, playlistId));
      const itemMap = new Map(items.map((item) => [item.id, item]));
      if (itemIds.some((id) => !itemMap.has(id))) {
        return reply.code(400).send({ error: 'invalid_request' });
      }

      await Promise.all(
        itemIds.map((id, index) =>
          db
            .update(playlistItems)
            .set({ sortOrder: index })
            .where(and(eq(playlistItems.id, id), eq(playlistItems.playlistId, playlistId))),
        ),
      );
      await db
        .update(playlists)
        .set({ updatedAt: new Date() })
        .where(eq(playlists.id, playlistId));

      const [updated] = await db.select().from(playlists).where(eq(playlists.id, playlistId));
      notifyPlaylist(resolved.bulletin.id);
      return buildPlaylistDetail(db, updated!, audioQueue);
    },
  );

  app.delete<{ Params: { '*': string } }>('/v1/playlists/invite/*', async (request, reply) => {
    const parsed = parseWorshipInviteRest(request.params['*'] ?? '');
    if (parsed.kind !== 'item') {
      return reply.code(404).send({ error: 'not_found' });
    }

    const resolved = await resolvePlaylistEditInvite(
      db,
      env.DOWNLOAD_HMAC_SECRET,
      parsed.token,
    );
    if ('error' in resolved) return inviteError(reply, resolved.error);

    const { itemId } = parsed;
    const playlistId = resolved.playlist.id;
    const [deleted] = await db
      .delete(playlistItems)
      .where(and(eq(playlistItems.id, itemId), eq(playlistItems.playlistId, playlistId)))
      .returning();

    if (!deleted) return reply.code(404).send({ error: 'not_found' });

    await db
      .update(playlists)
      .set({ updatedAt: new Date() })
      .where(eq(playlists.id, playlistId));

    notifyPlaylist(resolved.bulletin.id);
    return { ok: true };
  });

  app.patch<{
    Params: { '*': string };
    Body: {
      title?: string;
      playStartSec?: number | null;
      playEndSec?: number | null;
    };
  }>('/v1/playlists/invite/*', async (request, reply) => {
    const parsed = parseWorshipInviteRest(request.params['*'] ?? '');
    if (parsed.kind !== 'item') {
      return reply.code(404).send({ error: 'not_found' });
    }

    const resolved = await resolvePlaylistEditInvite(
      db,
      env.DOWNLOAD_HMAC_SECRET,
      parsed.token,
    );
    if ('error' in resolved) return inviteError(reply, resolved.error);

    const { itemId } = parsed;
    const playlistId = resolved.playlist.id;
    const body = request.body ?? {};

    const [existing] = await db
      .select()
      .from(playlistItems)
      .where(and(eq(playlistItems.id, itemId), eq(playlistItems.playlistId, playlistId)));
    if (!existing) return reply.code(404).send({ error: 'not_found' });

    const clip = parsePlayClipSeconds({
      playStartSec: body.playStartSec,
      playEndSec: body.playEndSec,
    });
    if (!clip.ok) return reply.code(400).send({ error: clip.error });

    const nextStart =
      clip.playStartSec !== undefined ? clip.playStartSec : existing.playStartSec;
    const nextEnd = clip.playEndSec !== undefined ? clip.playEndSec : existing.playEndSec;
    const rangeError = assertClipRange(nextStart, nextEnd);
    if (rangeError) return reply.code(400).send({ error: rangeError });

    const itemPatch: Partial<typeof playlistItems.$inferInsert> = {};
    if (typeof body.title === 'string') {
      const title = body.title.trim();
      if (!title) return reply.code(400).send({ error: 'title_required' });
      itemPatch.title = title;
    }
    if (clip.playStartSec !== undefined) itemPatch.playStartSec = clip.playStartSec;
    if (clip.playEndSec !== undefined) itemPatch.playEndSec = clip.playEndSec;

    if (Object.keys(itemPatch).length === 0) {
      return reply.code(400).send({ error: 'empty_patch' });
    }

    await db
      .update(playlistItems)
      .set(itemPatch)
      .where(and(eq(playlistItems.id, itemId), eq(playlistItems.playlistId, playlistId)));

    await db
      .update(playlists)
      .set({ updatedAt: new Date() })
      .where(eq(playlists.id, playlistId));

    const [updated] = await db.select().from(playlists).where(eq(playlists.id, playlistId));
    notifyPlaylist(resolved.bulletin.id);
    return buildPlaylistDetail(db, updated!, audioQueue);
  });
}
