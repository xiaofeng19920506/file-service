import { apiFetch, parseJson } from './http';
import type { YoutubeVideoCacheStatus } from './youtube-search';
import type { TrendingScope, TrendingSong } from './youtube-trending';

export type RecommendationScope = TrendingScope | 'personalized';

export type RecommendationSignals = {
  recentPlays: number;
  recentSearches: number;
  librarySize: number;
};

export type YoutubeRecommendationsResponse = {
  scope: RecommendationScope;
  songs: TrendingSong[];
  signals: RecommendationSignals;
};

export async function fetchYoutubeRecommendations(limit = 24): Promise<YoutubeRecommendationsResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await apiFetch(`/v1/youtube/recommendations?${params}`);
  return parseJson<YoutubeRecommendationsResponse>(res);
}

export async function recordYoutubeSearch(query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;
  const res = await apiFetch('/v1/youtube/searches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: trimmed }),
  });
  await parseJson<{ ok: boolean }>(res);
}

export type { TrendingSong, YoutubeVideoCacheStatus };
