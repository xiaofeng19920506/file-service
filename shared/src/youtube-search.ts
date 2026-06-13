import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isValidYoutubeVideoId, resolveYtdlpPath } from './youtube-audio-extract.js';

const execFileAsync = promisify(execFile);

export type YoutubeSearchResult = {
  videoId: string;
  title: string;
  videoUrl: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  relevanceScore: number;
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

export async function searchYoutubeVideos(
  query: string,
  apiKey: string | undefined,
  options?: { maxResults?: number },
): Promise<YoutubeSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  if (!apiKey) throw new Error('youtube_api_key_missing');

  const maxResults = Math.min(Math.max(options?.maxResults ?? 12, 1), 25);
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('q', q);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('safeSearch', 'none');
  url.searchParams.set('videoEmbeddable', 'true');

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`youtube_search_failed:${res.status}:${body.slice(0, 120)}`);
  }

  const data = (await res.json()) as { items?: SearchApiItem[] };
  const seen = new Set<string>();
  const ranked: YoutubeSearchResult[] = [];

  for (const item of data.items ?? []) {
    const videoId = item.id?.videoId?.trim() ?? '';
    const title = item.snippet?.title?.trim() ?? '';
    if (!isValidYoutubeVideoId(videoId) || seen.has(videoId)) continue;
    if (shouldSkipSearchResult(title, item.snippet?.liveBroadcastContent)) continue;

    seen.add(videoId);
    const relevanceScore = scoreYoutubeTitleMatch(q, title);
    if (relevanceScore < 12) continue;

    ranked.push({
      videoId,
      title,
      videoUrl: youtubeVideoUrl(videoId),
      channelTitle: item.snippet?.channelTitle?.trim() || null,
      thumbnailUrl:
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.default?.url ??
        null,
      relevanceScore,
    });
  }

  ranked.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return ranked.slice(0, maxResults);
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

export async function searchYoutubeVideosViaYtdlp(
  query: string,
  ytdlpPath: string,
  options?: { maxResults?: number },
): Promise<YoutubeSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const maxResults = Math.min(Math.max(options?.maxResults ?? 12, 1), 25);
  const bin = resolveYtdlpPath(ytdlpPath);

  let stdout = '';
  try {
    const result = await execFileAsync(
      bin,
      [
        `ytsearch${maxResults}:${q}`,
        '--flat-playlist',
        '--print',
        '%(id)s|||%(title)s|||%(channel)s',
        '--no-warnings',
        '--no-playlist',
      ],
      { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 },
    );
    stdout = result.stdout;
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === 'ENOENT') throw new Error('ytdlp_not_installed');
    throw new Error('youtube_search_failed');
  }

  const seen = new Set<string>();
  const ranked: YoutubeSearchResult[] = [];

  for (const line of stdout.split('\n')) {
    const parsed = parseYtdlpSearchLine(line);
    if (!parsed || seen.has(parsed.videoId)) continue;
    if (shouldSkipSearchResult(parsed.title)) continue;

    seen.add(parsed.videoId);
    const relevanceScore = scoreYoutubeTitleMatch(q, parsed.title);
    if (relevanceScore < 12) continue;

    ranked.push({
      videoId: parsed.videoId,
      title: parsed.title,
      videoUrl: youtubeVideoUrl(parsed.videoId),
      channelTitle: parsed.channelTitle,
      thumbnailUrl: `https://i.ytimg.com/vi/${parsed.videoId}/mqdefault.jpg`,
      relevanceScore,
    });
  }

  ranked.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return ranked.slice(0, maxResults);
}
