import {
  cuesContainChinese,
  cuesMatchSongTitle,
  extractLyricsSearchQueries,
  parseLrcToCues,
  type CaptionCue,
} from './youtube-captions.js';

const CATALOG_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const CREDIT_LINE_RE =
  /^(作词|作曲|编曲|作詞|編曲|歌詞|歌词|Lyricist|Composer|Arranger)\s*[:：]/i;

export type CatalogLyrics = {
  cues: CaptionCue[];
  language: 'zh' | 'en';
  source: 'netease';
};

function stripCreditCues(cues: CaptionCue[]): CaptionCue[] {
  return cues.filter((cue) => !CREDIT_LINE_RE.test(cue.text.trim()));
}

function songNameMatchesTitle(title: string, songName: string): boolean {
  if (!songName.trim()) return false;
  return cuesMatchSongTitle([{ start: 0, end: 1, text: songName }], title);
}

type NeteaseSong = {
  id?: number;
  name?: string;
  artists?: Array<{ name?: string }>;
};

async function searchNeteaseSongs(query: string): Promise<NeteaseSong[]> {
  const url = new URL('https://music.163.com/api/search/get');
  url.searchParams.set('s', query);
  url.searchParams.set('type', '1');
  url.searchParams.set('limit', '8');
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': CATALOG_UA, Referer: 'https://music.163.com/' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { result?: { songs?: NeteaseSong[] } };
  return Array.isArray(data.result?.songs) ? data.result.songs : [];
}

async function fetchNeteaseLrc(songId: number): Promise<string | null> {
  const url = new URL('https://music.163.com/api/song/lyric');
  url.searchParams.set('id', String(songId));
  url.searchParams.set('lv', '1');
  url.searchParams.set('kv', '1');
  url.searchParams.set('tv', '-1');
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': CATALOG_UA, Referer: 'https://music.163.com/' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { lrc?: { lyric?: string | null } };
  const lyric = data.lrc?.lyric?.trim();
  return lyric || null;
}

export async function fetchCatalogLyrics(title: string): Promise<CatalogLyrics | null> {
  const queries = extractLyricsSearchQueries(title).slice(0, 4);
  if (queries.length === 0) return null;

  try {
    const seen = new Set<number>();
    for (const query of queries) {
      const songs = await searchNeteaseSongs(query);
      for (const song of songs) {
        const id = song.id;
        const name = song.name ?? '';
        if (!id || seen.has(id) || !songNameMatchesTitle(title, name)) continue;
        seen.add(id);
        const lrc = await fetchNeteaseLrc(id);
        if (!lrc?.includes('[')) continue;
        const cues = stripCreditCues(parseLrcToCues(lrc));
        if (cues.length < 4) continue;
        if (!cuesMatchSongTitle(cues, title) && !songNameMatchesTitle(title, name)) continue;
        return {
          cues,
          language: cuesContainChinese(cues) ? 'zh' : 'en',
          source: 'netease',
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}
