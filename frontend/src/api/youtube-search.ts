import { apiFetch, parseJson } from './http';

export type YoutubeSearchResult = {
  videoId: string;
  title: string;
  videoUrl: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  relevanceScore: number;
};

export async function searchYoutubeVideos(
  query: string,
  limit = 50,
): Promise<{ query: string; results: YoutubeSearchResult[] }> {
  const params = new URLSearchParams({ q: query.trim(), limit: String(limit) });
  const res = await apiFetch(`/v1/youtube/search?${params}`);
  return parseJson<{ query: string; results: YoutubeSearchResult[] }>(res);
}
