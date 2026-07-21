import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isValidYoutubeVideoId, resolveYtdlpPath } from './youtube-audio-extract.js';

const execFileAsync = promisify(execFile);

export const YOUTUBE_SEARCH_MAX_PAGE_SIZE = 50;
export const YOUTUBE_SEARCH_DEFAULT_PAGE_SIZE = 15;

export type YoutubeSearchResult = {
  videoId: string;
  title: string;
  videoUrl: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  relevanceScore: number;
};

export type YoutubeSearchPage = {
  results: YoutubeSearchResult[];
  nextPageToken: string | null;
  hasMore: boolean;
  nextOffset: number;
};

const SKIPPED_TITLES = new Set(['Private video', 'Deleted video', '已设为私享', '私人视频', '已删除的视频']);

const BLOCKED_TITLE_RE =
  /(full album|continuous mix|10 hours|8 hours|1 hour loop|nightcore|karaoke version only)/i;

function youtubeVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/【[^】]*】/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function scoreYoutubeTitleMatch(query: string, title: string): number {
  const q = normalizeForMatch(query);
  const t = normalizeForMatch(title);
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q) || q.startsWith(t)) return 92;
  if (t.includes(q) || q.includes(t)) return 78;

  const qTokens = q.split(' ').filter((w) => w.length > 1);
  if (!qTokens.length) return 8;
  const matched = qTokens.filter((w) => t.includes(w)).length;
  return Math.round((matched / qTokens.length) * 72);
}

function shouldSkipSearchResult(title: string, liveBroadcastContent?: string | null): boolean {
  const trimmed = title.trim();
  if (!trimmed || SKIPPED_TITLES.has(trimmed)) return true;
  if (BLOCKED_TITLE_RE.test(trimmed)) return true;
  if (liveBroadcastContent && liveBroadcastContent !== 'none') return true;
  return false;
}

type SearchApiItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    liveBroadcastContent?: string;
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
  };
};

function clampPageSize(maxResults: number | undefined): number {
  return Math.min(Math.max(maxResults ?? YOUTUBE_SEARCH_DEFAULT_PAGE_SIZE, 1), YOUTUBE_SEARCH_MAX_PAGE_SIZE);
}

function rankSearchResults(query: string, items: SearchApiItem[]): YoutubeSearchResult[] {
  const q = query.trim();
  const seen = new Set<string>();
  const ranked: YoutubeSearchResult[] = [];

  for (const item of items) {
    const videoId = item.id?.videoId?.trim() ?? '';
    const title = item.snippet?.title?.trim() ?? '';
    if (!isValidYoutubeVideoId(videoId) || seen.has(videoId)) continue;
    if (shouldSkipSearchResult(title, item.snippet?.liveBroadcastContent)) continue;

    seen.add(videoId);
    ranked.push({
      videoId,
      title,
      videoUrl: youtubeVideoUrl(videoId),
      channelTitle: item.snippet?.channelTitle?.trim() || null,
      thumbnailUrl:
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.default?.url ??
        null,
      // 仅作辅助排序/预取权重；不过滤，保留 YouTube 原始相关度顺序
      relevanceScore: scoreYoutubeTitleMatch(q, title),
    });
  }

  return ranked;
}

export async function searchYoutubeVideos(
  query: string,
  apiKey: string | undefined,
  options?: { maxResults?: number; pageToken?: string },
): Promise<YoutubeSearchPage> {
  const q = query.trim();
  if (!q) {
    return { results: [], nextPageToken: null, hasMore: false, nextOffset: 0 };
  }
  if (!apiKey) throw new Error('youtube_api_key_missing');

  const maxResults = clampPageSize(options?.maxResults);
  if (!maxResults) {
    return { results: [], nextPageToken: null, hasMore: false, nextOffset: 0 };
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('q', q);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('safeSearch', 'none');
  if (options?.pageToken) {
    url.searchParams.set('pageToken', options.pageToken);
  }

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`youtube_search_failed:${res.status}:${body.slice(0, 120)}`);
  }

  const data = (await res.json()) as { items?: SearchApiItem[]; nextPageToken?: string };
  const results = rankSearchResults(q, data.items ?? []);
  const nextPageToken = data.nextPageToken?.trim() || null;

  return {
    results,
    nextPageToken,
    hasMore: Boolean(nextPageToken),
    nextOffset: 0,
  };
}

function parseYtdlpSearchLine(line: string): { videoId: string; title: string; channelTitle: string | null } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const [videoId, title, channelTitle] = trimmed.split('|||');
  if (!videoId || !title || !isValidYoutubeVideoId(videoId.trim())) return null;
  return {
    videoId: videoId.trim(),
    title: title.trim(),
    channelTitle: channelTitle?.trim() || null,
  };
}

function ytdlpSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
}

export async function searchYoutubeVideosViaYtdlp(
  query: string,
  ytdlpPath: string,
  options?: { maxResults?: number; offset?: number },
): Promise<YoutubeSearchPage> {
  const q = query.trim();
  if (!q) {
    return { results: [], nextPageToken: null, hasMore: false, nextOffset: 0 };
  }

  const offset = Math.max(options?.offset ?? 0, 0);
  const maxResults = clampPageSize(options?.maxResults);

  const bin = resolveYtdlpPath(ytdlpPath);
  const start = offset + 1;
  const end = offset + maxResults;

  let stdout = '';
  try {
    const result = await execFileAsync(
      bin,
      [
        ytdlpSearchUrl(q),
        '--flat-playlist',
        '--playlist-items',
        `${start}-${end}`,
        '--print',
        '%(id)s|||%(title)s|||%(channel)s',
        '--no-warnings',
        '--no-playlist',
      ],
      { timeout: 45_000, maxBuffer: 2 * 1024 * 1024 },
    );
    stdout = result.stdout;
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === 'ENOENT') throw new Error('ytdlp_not_installed');
    throw new Error('youtube_search_failed');
  }

  const seen = new Set<string>();
  const ranked: YoutubeSearchResult[] = [];
  let rawCount = 0;

  for (const line of stdout.split('\n')) {
    const parsed = parseYtdlpSearchLine(line);
    if (!parsed) continue;
    rawCount += 1;
    if (seen.has(parsed.videoId)) continue;
    if (shouldSkipSearchResult(parsed.title)) continue;

    seen.add(parsed.videoId);
    ranked.push({
      videoId: parsed.videoId,
      title: parsed.title,
      videoUrl: youtubeVideoUrl(parsed.videoId),
      channelTitle: parsed.channelTitle,
      thumbnailUrl: `https://i.ytimg.com/vi/${parsed.videoId}/mqdefault.jpg`,
      relevanceScore: scoreYoutubeTitleMatch(q, parsed.title),
    });
  }

  const nextOffset = offset + maxResults;
  const hasMore = rawCount >= maxResults;

  return {
    results: ranked,
    nextPageToken: null,
    hasMore,
    nextOffset,
  };
}
