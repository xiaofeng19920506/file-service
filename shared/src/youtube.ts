export type YoutubeVideoRef = {
  videoId: string;
  title: string;
  position: number;
  videoUrl: string;
};

export type YoutubeImportSource =
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'video'; videoId: string };

export type YoutubePlaylistData = {
  playlistId: string | null;
  title: string;
  sourceUrl: string;
  items: YoutubeVideoRef[];
};

const PLAYLIST_ID_RE = /^[a-zA-Z0-9_-]{10,}$/;
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

const SKIPPED_VIDEO_TITLES = new Set(['Private video', 'Deleted video', '已设为私享', '私人视频', '已删除的视频']);

const INNERTUBE_CLIENT = {
  clientName: 'WEB',
  clientVersion: '2.20250220.01.00',
  hl: 'en',
  gl: 'US',
};

export function parseYoutubeImportSource(input: string): YoutubeImportSource | null {
  const raw = input.trim();
  if (!raw) return null;

  try {
    const url = raw.startsWith('http') ? new URL(raw) : new URL(`https://${raw}`);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const videoId = url.pathname.slice(1).split('/')[0] ?? '';
      if (VIDEO_ID_RE.test(videoId)) return { kind: 'video', videoId };
      return null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const list = url.searchParams.get('list');
      if (list && PLAYLIST_ID_RE.test(list)) {
        return { kind: 'playlist', playlistId: list };
      }
      const videoId = url.searchParams.get('v');
      if (videoId && VIDEO_ID_RE.test(videoId)) {
        return { kind: 'video', videoId };
      }
      if (url.pathname.startsWith('/playlist') && list && PLAYLIST_ID_RE.test(list)) {
        return { kind: 'playlist', playlistId: list };
      }
    }
  } catch {
    return null;
  }

  return null;
}

function youtubeVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function extractVideoIdFromUrl(input: string): string | null {
  const raw = input.trim();
  try {
    const url = raw.startsWith('http') ? new URL(raw) : new URL(`https://${raw}`);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const videoId = url.pathname.slice(1).split('/')[0] ?? '';
      return VIDEO_ID_RE.test(videoId) ? videoId : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const videoId = url.searchParams.get('v');
      return videoId && VIDEO_ID_RE.test(videoId) ? videoId : null;
    }
  } catch {
    return null;
  }

  return null;
}

async function fallbackToLinkedVideo(sourceUrl: string): Promise<YoutubePlaylistData | null> {
  const videoId = extractVideoIdFromUrl(sourceUrl);
  if (!videoId) return null;
  return fetchVideoPublic(videoId, sourceUrl);
}

async function fetchPlaylistViaHtml(playlistId: string): Promise<{
  title: string;
  items: YoutubeVideoRef[];
} | null> {
  const res = await fetch(`https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) return null;

  const html = await res.text();
  const match = html.match(/var ytInitialData = ({.+?});<\/script>/);
  if (!match) return null;

  let data: unknown;
  try {
    data = JSON.parse(match[1]!);
  } catch {
    return null;
  }

  let blocked = false;
  walkJson(data, (obj) => {
    const alert = obj.alertRenderer as { text?: unknown } | undefined;
    if (!alert) return;
    const text = readTextRuns(alert.text).toLowerCase();
    if (text.includes('does not exist') || text.includes('unviewable')) blocked = true;
  });
  if (blocked) return null;

  const items = collectPlaylistVideos(data);
  if (!items.length) return null;

  return {
    title: extractPlaylistTitle(data, `YouTube ${playlistId}`),
    items,
  };
}

function innertubeContext() {
  return { client: INNERTUBE_CLIENT };
}

function readTextRuns(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const obj = value as { simpleText?: string; runs?: Array<{ text?: string }> };
  if (obj.simpleText) return obj.simpleText;
  if (obj.runs?.length) return obj.runs.map((r) => r.text ?? '').join('');
  return '';
}

function walkJson(node: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walkJson(child, visit);
    return;
  }
  const obj = node as Record<string, unknown>;
  visit(obj);
  for (const value of Object.values(obj)) walkJson(value, visit);
}

function collectPlaylistVideos(data: unknown): YoutubeVideoRef[] {
  const items: YoutubeVideoRef[] = [];
  const seen = new Set<string>();

  walkJson(data, (obj) => {
    const renderer = obj.playlistVideoRenderer;
    if (!renderer || typeof renderer !== 'object') return;

    const v = renderer as Record<string, unknown>;
    const videoId =
      (typeof v.videoId === 'string' && v.videoId) ||
      (() => {
        const nav = v.navigationEndpoint as Record<string, unknown> | undefined;
        const watch = nav?.watchEndpoint as { videoId?: string } | undefined;
        return watch?.videoId;
      })();

    if (!videoId || seen.has(videoId)) return;
    seen.add(videoId);

    const title = readTextRuns(v.title).trim() || videoId;
    if (SKIPPED_VIDEO_TITLES.has(title)) return;

    const indexText = readTextRuns(v.index);
    const position = indexText ? Math.max(0, parseInt(indexText, 10) - 1) : items.length;

    items.push({
      videoId,
      title,
      position: Number.isFinite(position) ? position : items.length,
      videoUrl: youtubeVideoUrl(videoId),
    });
  });

  items.sort((a, b) => a.position - b.position);
  return items.map((item, index) => ({ ...item, position: index }));
}

function extractPlaylistTitle(data: unknown, fallback: string): string {
  let title = '';

  walkJson(data, (obj) => {
    if (title) return;
    if (obj.playlistMetadataRenderer) {
      const meta = obj.playlistMetadataRenderer as Record<string, unknown>;
      title = readTextRuns(meta.title).trim();
      return;
    }
    if (obj.playlistHeaderRenderer) {
      const header = obj.playlistHeaderRenderer as Record<string, unknown>;
      title = readTextRuns(header.title).trim();
    }
  });

  return title || fallback;
}

function extractContinuationTokens(data: unknown): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();

  walkJson(data, (obj) => {
    const endpoint = obj.continuationEndpoint as Record<string, unknown> | undefined;
    const command = endpoint?.continuationCommand as { token?: string } | undefined;
    const token = command?.token;
    if (token && !seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
  });

  return tokens;
}

async function innertubePost(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({ context: innertubeContext(), ...body }),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`youtube_innertube_error:${res.status}:${bodyText.slice(0, 120)}`);
  }
  return res.json();
}

async function fetchVideoTitleViaOembed(videoId: string): Promise<string> {
  const watchUrl = youtubeVideoUrl(videoId);
  const res = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
  );
  if (!res.ok) throw new Error('youtube_oembed_failed');
  const data = (await res.json()) as { title?: string };
  return data.title?.trim() || videoId;
}

async function fetchPlaylistViaInnertube(playlistId: string): Promise<{
  title: string;
  items: YoutubeVideoRef[];
}> {
  const first = await innertubePost('browse', { browseId: `VL${playlistId}` });
  const title = extractPlaylistTitle(first, `YouTube ${playlistId}`);
  const items = collectPlaylistVideos(first);

  const continuations = extractContinuationTokens(first);
  for (const token of continuations) {
    if (items.length >= 500) break;
    try {
      const page = await innertubePost('browse', { continuation: token });
      const more = collectPlaylistVideos(page);
      const seen = new Set(items.map((i) => i.videoId));
      for (const row of more) {
        if (seen.has(row.videoId)) continue;
        seen.add(row.videoId);
        items.push({ ...row, position: items.length });
      }
    } catch {
      break;
    }
  }

  return { title, items };
}

type YoutubeApiPlaylistItem = {
  snippet?: {
    title?: string;
    position?: number;
    resourceId?: { videoId?: string };
  };
};

async function youtubeApiGet<T>(apiKey: string, path: string, params: Record<string, string>): Promise<T> {
  const search = new URLSearchParams({ ...params, key: apiKey });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${search}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`youtube_api_error:${res.status}:${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function fetchVideoViaApi(apiKey: string, videoId: string, sourceUrl: string): Promise<YoutubePlaylistData> {
  const data = await youtubeApiGet<{
    items?: Array<{ snippet?: { title?: string } }>;
  }>(apiKey, 'videos', {
    part: 'snippet',
    id: videoId,
  });
  const title = data.items?.[0]?.snippet?.title?.trim() || videoId;
  return {
    playlistId: null,
    title,
    sourceUrl: sourceUrl.trim(),
    items: [
      {
        videoId,
        title,
        position: 0,
        videoUrl: youtubeVideoUrl(videoId),
      },
    ],
  };
}

async function fetchPlaylistViaApi(
  apiKey: string,
  playlistId: string,
  sourceUrl: string,
): Promise<YoutubePlaylistData> {
  const playlistMeta = await youtubeApiGet<{
    items?: Array<{ snippet?: { title?: string } }>;
  }>(apiKey, 'playlists', {
    part: 'snippet',
    id: playlistId,
  });
  const playlistTitle =
    playlistMeta.items?.[0]?.snippet?.title?.trim() || `YouTube ${playlistId}`;

  const items: YoutubeVideoRef[] = [];
  let pageToken: string | undefined;
  do {
    const page = await youtubeApiGet<{
      items?: YoutubeApiPlaylistItem[];
      nextPageToken?: string;
    }>(apiKey, 'playlistItems', {
      part: 'snippet',
      playlistId,
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });

    for (const row of page.items ?? []) {
      const videoId = row.snippet?.resourceId?.videoId;
      if (!videoId) continue;
      const rowTitle = row.snippet?.title?.trim() || videoId;
      if (SKIPPED_VIDEO_TITLES.has(rowTitle)) continue;
      items.push({
        videoId,
        title: rowTitle,
        position: row.snippet?.position ?? items.length,
        videoUrl: youtubeVideoUrl(videoId),
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  items.sort((a, b) => a.position - b.position);

  return {
    playlistId,
    title: playlistTitle,
    sourceUrl: sourceUrl.trim(),
    items,
  };
}

async function fetchVideoPublic(videoId: string, sourceUrl: string): Promise<YoutubePlaylistData> {
  const title = await fetchVideoTitleViaOembed(videoId);
  return {
    playlistId: null,
    title,
    sourceUrl: sourceUrl.trim(),
    items: [
      {
        videoId,
        title,
        position: 0,
        videoUrl: youtubeVideoUrl(videoId),
      },
    ],
  };
}

async function fetchPlaylistPublic(
  playlistId: string,
  sourceUrl: string,
): Promise<YoutubePlaylistData> {
  const htmlResult = await fetchPlaylistViaHtml(playlistId);
  if (htmlResult?.items.length) {
    return {
      playlistId,
      title: htmlResult.title,
      sourceUrl: sourceUrl.trim(),
      items: htmlResult.items,
    };
  }

  try {
    const { title, items } = await fetchPlaylistViaInnertube(playlistId);
    if (items.length) {
      return {
        playlistId,
        title,
        sourceUrl: sourceUrl.trim(),
        items,
      };
    }
  } catch {
    // try video fallback below
  }

  const fallback = await fallbackToLinkedVideo(sourceUrl);
  if (fallback) return fallback;

  throw new Error('youtube_playlist_empty');
}

export async function fetchYoutubePlaylistData(
  sourceUrl: string,
  apiKey?: string,
): Promise<YoutubePlaylistData> {
  const source = parseYoutubeImportSource(sourceUrl);
  if (!source) throw new Error('invalid_youtube_url');

  if (source.kind === 'video') {
    if (apiKey) {
      try {
        return await fetchVideoViaApi(apiKey, source.videoId, sourceUrl);
      } catch {
        // fall through to oEmbed
      }
    }
    return fetchVideoPublic(source.videoId, sourceUrl);
  }

  if (apiKey) {
    try {
      const fromApi = await fetchPlaylistViaApi(apiKey, source.playlistId, sourceUrl);
      if (fromApi.items.length) return fromApi;
    } catch {
      // fall through to public methods
    }
  }
  return fetchPlaylistPublic(source.playlistId, sourceUrl);
}
