import { apiFetch, parseJson } from './http';

export type YoutubeSearchResult = {
  videoId: string;
  title: string;
  videoUrl: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  relevanceScore: number;
};

export type YoutubeSearchPageResponse = {
  query: string;
  results: YoutubeSearchResult[];
  nextPageToken: string | null;
  hasMore: boolean;
  nextOffset: number;
};

export const YOUTUBE_SEARCH_PAGE_SIZE = 15;

export async function searchYoutubeVideos(
  query: string,
  options?: {
    limit?: number;
    pageToken?: string;
    offset?: number;
  },
): Promise<YoutubeSearchPageResponse> {
  const params = new URLSearchParams({
    q: query.trim(),
    limit: String(options?.limit ?? YOUTUBE_SEARCH_PAGE_SIZE),
  });
  if (options?.pageToken) params.set('pageToken', options.pageToken);
  if (options?.offset) params.set('offset', String(options.offset));
  const res = await apiFetch(`/v1/youtube/search?${params}`);
  return parseJson<YoutubeSearchPageResponse>(res);
}
