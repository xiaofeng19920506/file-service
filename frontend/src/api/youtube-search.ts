import { apiFetch, parseJson } from './http';

export type YoutubeVideoCacheStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type YoutubeSearchResult = {
  videoId: string;
  title: string;
  videoUrl: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  relevanceScore: number;
  inLibrary?: boolean;
  video?: { status: YoutubeVideoCacheStatus };
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
    /** 敬拜邀请令牌：走公开邀请搜索接口 */
    inviteToken?: string;
  },
): Promise<YoutubeSearchPageResponse> {
  const params = new URLSearchParams({
    q: query.trim(),
    limit: String(options?.limit ?? YOUTUBE_SEARCH_PAGE_SIZE),
  });
  if (options?.pageToken) params.set('pageToken', options.pageToken);
  if (options?.offset) params.set('offset', String(options.offset));
  const path = options?.inviteToken
    ? `/v1/playlists/invite/${encodeURIComponent(options.inviteToken)}/youtube/search?${params}`
    : `/v1/youtube/search?${params}`;
  const res = await apiFetch(path);
  return parseJson<YoutubeSearchPageResponse>(res);
}

export async function fetchYoutubeSearchSuggestions(
  query: string,
  options?: { inviteToken?: string },
): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];
  const params = new URLSearchParams({ q });
  const path = options?.inviteToken
    ? `/v1/playlists/invite/${encodeURIComponent(options.inviteToken)}/youtube/search/suggest?${params}`
    : `/v1/youtube/search/suggest?${params}`;
  const res = await apiFetch(path);
  const data = await parseJson<{ suggestions: string[] }>(res);
  return data.suggestions ?? [];
}
