import { desc, eq, sql } from 'drizzle-orm';
import { isValidYoutubeVideoId } from './youtube-audio-extract.js';
import { getUserLibraryVideoIdSet } from './playlist-video-ids.js';
import {
  fetchRecentUserPlaysForRecommendations,
  fetchRecentUserSearchesForRecommendations,
} from './youtube-user-activity.js';
import {
  playlistItems,
  playlists,
  youtubeVideoDailyPlays,
  type Db,
} from './db/index.js';
import type { TrendingSong, TrendingScope } from './youtube-trending.js';

export type RecommendationScope = TrendingScope | 'personalized';

export type RecommendationSignals = {
  recentPlays: number;
  recentSearches: number;
  librarySize: number;
};

export type RecommendationsResult = {
  scope: RecommendationScope;
  songs: TrendingSong[];
  signals: RecommendationSignals;
};

type RecommendationCandidate = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  playCount: number;
  inLibrary: boolean;
};

type UserProfile = {
  recentVideoIds: Set<string>;
  channelWeights: Map<string, number>;
  artistWeights: Map<string, number>;
  tokenWeights: Map<string, number>;
};

const PROFILE_PLAY_LIMIT = 40;
const PROFILE_SEARCH_LIMIT = 12;
const CATALOG_CANDIDATE_LIMIT = 800;
const TRENDING_CANDIDATE_LIMIT = 80;

const RECOMMENDATION_STOP_TOKENS = new Set([
  'official',
  'music',
  'video',
  'lyrics',
  'audio',
  'mv',
  'hd',
  '4k',
  'live',
  '歌词',
  '官方',
  '完整版',
  '高清',
  '现场',
]);

/** 分词：空格/标点切分 + 连续中文片段，供标题/搜索词匹配 */
export function tokenizeRecommendationText(text: string): string[] {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return [];

  const tokens = new Set<string>();
  for (const part of normalized.split(/[\s/|，,、。.!?'"+()[\]{}【】：:；;·\-–—]+/)) {
    const trimmed = part.trim();
    if (trimmed.length >= 2 && !RECOMMENDATION_STOP_TOKENS.has(trimmed)) tokens.add(trimmed);
  }
  for (const run of normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
    if (!RECOMMENDATION_STOP_TOKENS.has(run)) tokens.add(run);
    if (run.length > 4) {
      for (let i = 0; i <= run.length - 2; i += 1) {
        const gram = run.slice(i, i + 2);
        if (!RECOMMENDATION_STOP_TOKENS.has(gram)) tokens.add(gram);
      }
    }
  }
  return [...tokens];
}

/** 从标题/频道抽出歌手名：`五月天 - 歌名`、`MAYDAY五月天 [`、频道名 */
export function extractArtistHints(title: string, channelTitle: string | null): string[] {
  const hints = new Set<string>();
  const channel = channelTitle?.trim().toLowerCase();
  if (channel && channel.length >= 2) hints.add(channel);

  const raw = title.trim();
  if (!raw) return [...hints];

  const dashParts = raw.split(/\s[-–—]\s/);
  if (dashParts.length >= 2) {
    const artist = dashParts[0]!.trim().toLowerCase();
    if (artist.length >= 2 && artist.length <= 40) hints.add(artist);
  }

  const bracket = raw.match(/^(.{2,40}?)\s*[\[【]/);
  if (bracket) {
    hints.add(bracket[1]!.trim().toLowerCase());
  }

  return [...hints];
}

function addTokenWeights(target: Map<string, number>, text: string, weight: number) {
  for (const token of tokenizeRecommendationText(text)) {
    target.set(token, (target.get(token) ?? 0) + weight);
  }
}

export function buildRecommendationProfile(input: {
  plays: Array<{ videoId: string; title: string; channelTitle: string | null; weight: number }>;
  searches: Array<{ query: string; weight: number }>;
  libraryTitles: string[];
}): UserProfile {
  const recentVideoIds = new Set<string>();
  const channelWeights = new Map<string, number>();
  const artistWeights = new Map<string, number>();
  const tokenWeights = new Map<string, number>();

  for (const play of input.plays) {
    if (play.weight >= 4) recentVideoIds.add(play.videoId);
    addTokenWeights(tokenWeights, play.title, play.weight);
    if (play.channelTitle?.trim()) {
      const channel = play.channelTitle.trim();
      channelWeights.set(channel, (channelWeights.get(channel) ?? 0) + play.weight);
      addTokenWeights(tokenWeights, channel, play.weight * 0.6);
    }
    for (const artist of extractArtistHints(play.title, play.channelTitle)) {
      artistWeights.set(artist, (artistWeights.get(artist) ?? 0) + play.weight);
    }
  }

  for (const search of input.searches) {
    addTokenWeights(tokenWeights, search.query, search.weight * 1.4);
    for (const artist of extractArtistHints(search.query, null)) {
      artistWeights.set(artist, (artistWeights.get(artist) ?? 0) + search.weight);
    }
  }

  for (const title of input.libraryTitles) {
    addTokenWeights(tokenWeights, title, 0.2);
    for (const artist of extractArtistHints(title, null)) {
      artistWeights.set(artist, (artistWeights.get(artist) ?? 0) + 0.25);
    }
  }

  return { recentVideoIds, channelWeights, artistWeights, tokenWeights };
}

export function scoreRecommendationCandidate(
  candidate: RecommendationCandidate,
  profile: UserProfile,
): number {
  if (profile.recentVideoIds.has(candidate.videoId)) return -1;

  let score = 0;

  const text = `${candidate.title} ${candidate.channelTitle ?? ''}`;
  for (const token of tokenizeRecommendationText(text)) {
    score += profile.tokenWeights.get(token) ?? 0;
  }

  const channel = candidate.channelTitle?.trim();
  if (channel && profile.channelWeights.has(channel)) {
    score += (profile.channelWeights.get(channel) ?? 0) * 3.2;
  }

  for (const artist of extractArtistHints(candidate.title, candidate.channelTitle)) {
    score += (profile.artistWeights.get(artist) ?? 0) * 2.8;
  }

  if (candidate.inLibrary) score += 0.25;
  score += Math.log1p(candidate.playCount) * 0.45;

  return score;
}

export function rankRecommendationCandidates(
  candidates: RecommendationCandidate[],
  profile: UserProfile,
  limit: number,
): RecommendationCandidate[] {
  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreRecommendationCandidate(candidate, profile),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.candidate.playCount !== a.candidate.playCount) {
        return b.candidate.playCount - a.candidate.playCount;
      }
      return a.candidate.videoId.localeCompare(b.candidate.videoId);
    });

  if (scored.length === 0) {
    return candidates
      .filter((candidate) => !profile.recentVideoIds.has(candidate.videoId))
      .sort((a, b) => b.playCount - a.playCount || a.videoId.localeCompare(b.videoId))
      .slice(0, limit);
  }

  return scored.slice(0, limit).map((row) => row.candidate);
}

function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchCatalogCandidates(db: Db) {
  const [catalog, channelRows] = await Promise.all([
    db
      .select({
        videoId: playlistItems.youtubeVideoId,
        title: sql<string>`max(${playlistItems.title})`,
        playCount: sql<number>`count(*)::int`,
      })
      .from(playlistItems)
      .groupBy(playlistItems.youtubeVideoId)
      .orderBy(desc(sql`count(*)`), desc(playlistItems.youtubeVideoId))
      .limit(CATALOG_CANDIDATE_LIMIT),
    db
      .select({
        videoId: youtubeVideoDailyPlays.youtubeVideoId,
        channelTitle: sql<string | null>`max(${youtubeVideoDailyPlays.channelTitle})`,
      })
      .from(youtubeVideoDailyPlays)
      .groupBy(youtubeVideoDailyPlays.youtubeVideoId),
  ]);

  const channelByVideo = new Map<string, string>();
  for (const row of channelRows) {
    const channel = row.channelTitle?.trim();
    if (channel) channelByVideo.set(row.videoId, channel);
  }

  return catalog
    .filter((row) => isValidYoutubeVideoId(row.videoId) && row.title.trim())
    .map((row) => ({
      videoId: row.videoId,
      title: row.title.trim(),
      channelTitle: channelByVideo.get(row.videoId) ?? null,
      playCount: Number(row.playCount) || 1,
    }));
}

async function fetchUserLibraryTitles(db: Db, userId: string) {
  const rows = await db
    .select({
      title: sql<string>`max(${playlistItems.title})`,
    })
    .from(playlistItems)
    .innerJoin(playlists, eq(playlistItems.playlistId, playlists.id))
    .where(eq(playlists.createdByUserId, userId))
    .groupBy(playlistItems.youtubeVideoId)
    .limit(80);

  return rows.map((row) => row.title.trim()).filter(Boolean);
}

async function fetchTrendingCandidates(db: Db, limit: number) {
  const playDate = todayUtcDateString();
  const todayRows = await db
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

  if (todayRows.length > 0) {
    return {
      scope: 'today' as const,
      rows: todayRows,
    };
  }

  const allTimeRows = await db
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

  if (allTimeRows.length > 0) {
    return {
      scope: 'all_time' as const,
      rows: allTimeRows.map((row) => ({
        videoId: row.videoId,
        title: row.title,
        channelTitle: row.channelTitle,
        playCount: Number(row.playCount) || 0,
      })),
    };
  }

  const libraryPopular = await db
    .select({
      videoId: playlistItems.youtubeVideoId,
      title: sql<string>`max(${playlistItems.title})`,
      playCount: sql<number>`count(*)::int`,
    })
    .from(playlistItems)
    .groupBy(playlistItems.youtubeVideoId)
    .orderBy(desc(sql`count(*)`), desc(playlistItems.youtubeVideoId))
    .limit(limit);

  return {
    scope: 'popular' as const,
    rows: libraryPopular.map((row) => ({
      videoId: row.videoId,
      title: row.title,
      channelTitle: null,
      playCount: Number(row.playCount) || 0,
    })),
  };
}

export async function getPersonalizedYoutubeRecommendations(
  db: Db,
  userId: string,
  limit = 10,
): Promise<RecommendationsResult> {
  const capped = Math.min(Math.max(limit, 1), 30);

  const [plays, searches, catalogCandidates, libraryTitles, trending, libraryIds] = await Promise.all([
    fetchRecentUserPlaysForRecommendations(db, userId, PROFILE_PLAY_LIMIT),
    fetchRecentUserSearchesForRecommendations(db, userId, PROFILE_SEARCH_LIMIT),
    fetchCatalogCandidates(db),
    fetchUserLibraryTitles(db, userId),
    fetchTrendingCandidates(db, TRENDING_CANDIDATE_LIMIT),
    getUserLibraryVideoIdSet(db, userId),
  ]);

  const signals: RecommendationSignals = {
    recentPlays: plays.length,
    recentSearches: searches.length,
    librarySize: libraryIds.size,
  };

  const hasPersonalSignals = plays.length > 0 || searches.length > 0 || libraryTitles.length > 0;
  if (!hasPersonalSignals) {
    const songs = trending.rows
      .filter((row) => isValidYoutubeVideoId(row.videoId) && row.title.trim())
      .slice(0, capped)
      .map((row) => ({
        videoId: row.videoId,
        title: row.title.trim(),
        channelTitle: row.channelTitle?.trim() || null,
        playCount: Number(row.playCount) || 0,
        inLibrary: libraryIds.has(row.videoId),
      }));
    return { scope: trending.scope, songs, signals };
  }

  const profile = buildRecommendationProfile({
    plays,
    searches,
    libraryTitles,
  });

  const candidateMap = new Map<string, RecommendationCandidate>();
  const addCandidate = (row: {
    videoId: string;
    title: string;
    channelTitle: string | null;
    playCount: number;
  }) => {
    if (!isValidYoutubeVideoId(row.videoId) || !row.title.trim()) return;
    const existing = candidateMap.get(row.videoId);
    const playCount = Number(row.playCount) || 0;
    if (!existing || playCount > existing.playCount) {
      candidateMap.set(row.videoId, {
        videoId: row.videoId,
        title: row.title.trim(),
        channelTitle: row.channelTitle?.trim() || null,
        playCount,
        inLibrary: libraryIds.has(row.videoId),
      });
    } else if (existing) {
      existing.inLibrary = existing.inLibrary || libraryIds.has(row.videoId);
    }
  };

  for (const row of catalogCandidates) addCandidate(row);
  for (const row of trending.rows) {
    addCandidate({
      videoId: row.videoId,
      title: row.title,
      channelTitle: row.channelTitle,
      playCount: Number(row.playCount) || 0,
    });
  }

  const ranked = rankRecommendationCandidates([...candidateMap.values()], profile, capped);
  return {
    scope: 'personalized',
    songs: ranked.map((row) => ({
      videoId: row.videoId,
      title: row.title,
      channelTitle: row.channelTitle,
      playCount: row.playCount,
      inLibrary: row.inLibrary,
    })),
    signals,
  };
}
