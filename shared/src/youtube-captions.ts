import { YoutubeTranscript } from 'youtube-transcript';

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

const YT_PAGE_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)';

const INNERTUBE_API_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const INNERTUBE_CLIENT_VERSION = '20.10.38';
const INNERTUBE_USER_AGENT = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`;

const ZH_LANG_CODES = ['zh-Hans', 'zh-CN', 'zh-Hant', 'zh-TW', 'zh', 'yue'] as const;
const EN_LANG_CODES = ['en', 'en-US', 'en-GB'] as const;
const ZH_TRANSLATION_LANGS = ['zh-Hant', 'zh-Hans', 'zh-CN'] as const;
const EN_TRANSLATION_LANGS = ['en', 'en-US', 'en-GB'] as const;

export type SubtitleLanguage = 'zh' | 'en';

export type CaptionCue = {
  start: number;
  end: number;
  text: string;
};

export type YoutubeCaptionsResult = {
  videoId: string;
  language: string;
  sourceLanguage: string | null;
  translated: boolean;
  cues: CaptionCue[];
};

type CaptionTrack = {
  baseUrl: string;
  languageCode: string;
  kind?: string;
};

type CaptionTrackList = {
  tracks: CaptionTrack[];
  translationLanguages: string[];
  title: string | null;
};

type PlayerPayload = {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
      translationLanguages?: Array<{ languageCode?: string }>;
    };
  };
  videoDetails?: { title?: string };
};

export type TranscriptLine = {
  text: string;
  duration: number;
  offset: number;
  lang?: string;
};

function isChineseLang(code: string): boolean {
  const normalized = code.toLowerCase();
  return normalized.startsWith('zh') || normalized === 'cmn' || normalized === 'yue';
}

function isEnglishLang(code: string): boolean {
  return code.toLowerCase().startsWith('en');
}

export function isLikelyChineseText(text: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
}

function cuesContainChinese(cues: CaptionCue[]): boolean {
  const sample = cues
    .slice(0, 30)
    .map((cue) => cue.text)
    .join('');
  return isLikelyChineseText(sample);
}

function cuesContainEnglish(cues: CaptionCue[]): boolean {
  const sample = cues
    .slice(0, 30)
    .map((cue) => cue.text)
    .join('');
  if (isLikelyChineseText(sample)) return false;
  return /[a-zA-Z]/.test(sample);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

export function isBlockedCaptionPayload(xml: string): boolean {
  return xml.includes('Sorry...') || xml.includes('class="g-recaptcha"');
}

function attrNumber(attrs: string, name: string): number | null {
  const match = new RegExp(`\\b${name}="(\\d+(?:\\.\\d+)?)"`).exec(attrs);
  if (!match) return null;
  const value = parseFloat(match[1]!);
  return Number.isFinite(value) ? value : null;
}

function parseTranscriptXml(xml: string): TranscriptLine[] {
  if (isBlockedCaptionPayload(xml)) {
    throw new Error('caption_blocked');
  }

  const results: TranscriptLine[] = [];

  const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = pRegex.exec(xml))) {
    const startMs = attrNumber(match[1] ?? '', 't');
    if (startMs == null) continue;
    const durMs = attrNumber(match[1] ?? '', 'd') ?? 0;
    const inner = match[2] ?? '';
    let text = '';
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = sRegex.exec(inner))) {
      text += sMatch[1] ?? '';
    }
    if (!text) text = inner.replace(/<[^>]+>/g, '');
    text = decodeEntities(text).trim();
    if (text) {
      results.push({ text, duration: durMs, offset: startMs });
    }
  }
  if (results.length > 0) return results;

  const classicRegex = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  while ((match = classicRegex.exec(xml))) {
    const start = attrNumber(match[1] ?? '', 'start');
    if (start == null) continue;
    const dur = attrNumber(match[1] ?? '', 'dur') ?? 0;
    const text = decodeEntities((match[2] ?? '').replace(/<[^>]+>/g, '')).trim();
    if (text) {
      results.push({ text, duration: dur * 1000, offset: start * 1000 });
    }
  }
  return results;
}

const LRC_LINE_RE = /^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/;

export function parseLrcToCues(lrc: string): CaptionCue[] {
  const rows: Array<{ start: number; text: string }> = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const match = LRC_LINE_RE.exec(raw.trim());
    if (!match) continue;
    const text = (match[4] ?? '').trim();
    if (!text) continue;
    const minutes = Number.parseInt(match[1] ?? '0', 10);
    const seconds = Number.parseInt(match[2] ?? '0', 10);
    const frac = match[3] ?? '0';
    const millis =
      frac.length <= 2 ? Number.parseInt(frac.padEnd(2, '0'), 10) * 10 : Number.parseInt(frac.slice(0, 3), 10);
    rows.push({ start: minutes * 60 + seconds + millis / 1000, text });
  }
  return rows.map((row, index) => ({
    start: row.start,
    end: rows[index + 1]?.start ?? row.start + 4,
    text: row.text,
  }));
}

const CJK_RUN_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]{2,}/g;

const BRACKET_PAIRS: Array<[string, string]> = [
  ['【', '】'],
  ['[', ']'],
  ['『', '』'],
  ['「', '」'],
  ['（', '）'],
  ['(', ')'],
];

const DECORATION_PATTERN =
  /動態歌詞|动态歌词|歌詞|歌词|Lyrics?|Karaoke|卡拉OK|官方影像|官方|Official(?:\s+(?:Music\s+)?Video)?|字幕|Color\s*Coded|Lyric\s*Video|Music\s*Video|\bM\/V\b|\bMV\b|\bHD\b|\b4K\b|\b1080p\b|\b720p\b/gi;

const DECORATION_ONLY_RE =
  /^(新版|完整版|高清|高音質|高音质|音質|音质|純音樂|纯音乐|Instrumental|Live|LIVE|現場|现场|Cover|翻唱|Audio|Visualizer|Video|MV|HD|4K|字幕|歌詞|歌词|Lyrics)$/i;

export type LyricsArtistTrack = {
  artist: string;
  track: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (trimmed.length < 2) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function extractCjkRuns(text: string): string[] {
  return text.match(CJK_RUN_RE) ?? [];
}

function isDecorationFragment(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (DECORATION_ONLY_RE.test(trimmed)) return true;
  const stripped = trimmed
    .replace(DECORATION_PATTERN, ' ')
    .replace(/[\s\-_|/·•.,:：!！?？~～*]+/g, ' ')
    .trim();
  return !stripped || stripped.length < 2 || DECORATION_ONLY_RE.test(stripped);
}

function isLikelySongTitleFragment(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 48) return false;
  if (isDecorationFragment(trimmed)) return false;
  return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(trimmed) || /[a-zA-Z]{3,}/.test(trimmed);
}

function extractBracketFragments(title: string): string[] {
  const fragments: string[] = [];
  for (const [open, close] of BRACKET_PAIRS) {
    const re = new RegExp(`${escapeRegExp(open)}([^${escapeRegExp(close)}]{1,80})${escapeRegExp(close)}`, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(title))) {
      const inner = (match[1] ?? '').trim();
      if (inner) fragments.push(inner);
    }
  }
  return fragments;
}

function stripDecorations(text: string): string {
  return text
    .replace(DECORATION_PATTERN, ' ')
    .replace(/#[^\s#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rewriteTitleBrackets(title: string): string {
  let result = title;
  for (const [open, close] of BRACKET_PAIRS) {
    const re = new RegExp(`${escapeRegExp(open)}([^${escapeRegExp(close)}]{0,80})${escapeRegExp(close)}`, 'g');
    result = result.replace(re, (_all, inner: string) => {
      const trimmed = String(inner ?? '').trim();
      return isLikelySongTitleFragment(trimmed) ? ` ${trimmed} ` : ' ';
    });
  }
  return result;
}

export function cleanYoutubeTitleForLyrics(title: string): string {
  return stripDecorations(rewriteTitleBrackets(title))
    .replace(/^[-–—|/\s]+|[-–—|/\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitArtistCandidates(text: string): string[] {
  const candidates: string[] = [];
  for (const chunk of text.split(/[\s\-–—/|]+/)) {
    const trimmed = chunk.trim();
    if (trimmed.length < 2 || isDecorationFragment(trimmed)) continue;
    candidates.push(trimmed);
    const runs = trimmed.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+|[A-Za-z0-9.]+/g) ?? [];
    for (const run of runs) {
      if (run.length >= 2 && run !== trimmed && !isDecorationFragment(run)) {
        candidates.push(run);
      }
    }
  }
  return uniqueNonEmpty(candidates);
}

function extractSongLikeBrackets(title: string): string[] {
  return uniqueNonEmpty(extractBracketFragments(title).filter(isLikelySongTitleFragment));
}

export function extractArtistTrackPairs(title: string): LyricsArtistTrack[] {
  const pairs: LyricsArtistTrack[] = [];
  const seen = new Set<string>();
  const add = (artist: string, track: string) => {
    const a = artist.replace(/\s+/g, ' ').trim();
    const t = track.replace(/\s+/g, ' ').trim();
    if (a.length < 2 || t.length < 2 || a.toLowerCase() === t.toLowerCase()) return;
    const key = `${a.toLowerCase()}\0${t.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ artist: a, track: t });
  };

  const songLikes = extractSongLikeBrackets(title);
  let outside = title;
  for (const fragment of extractBracketFragments(title)) {
    outside = outside.replace(fragment, ' ');
  }
  outside = stripDecorations(rewriteTitleBrackets(outside));
  const artists = splitArtistCandidates(outside).sort((a, b) => {
    const rank = (name: string) =>
      (extractCjkRuns(name).length > 0 ? 30 : 0) + (name.length >= 5 ? 10 : 0) + name.length;
    return rank(b) - rank(a);
  });
  for (const song of songLikes) {
    for (const artist of artists) add(artist, song);
  }

  const cleaned = cleanYoutubeTitleForLyrics(title);
  const dashParts = cleaned.split(/\s+[-–—]\s+/).map((part) => part.trim()).filter(Boolean);
  if (dashParts.length >= 2) {
    add(dashParts[0]!, dashParts.slice(1).join(' - '));
  }

  return pairs;
}

export function extractLyricsSearchQueries(title: string): string[] {
  const raw = title.trim();
  if (!raw) return [];

  const queries: string[] = [];
  const songLikes = extractSongLikeBrackets(raw);
  queries.push(...songLikes);

  for (const pair of extractArtistTrackPairs(raw)) {
    queries.push(`${pair.artist} ${pair.track}`);
  }

  const cleaned = cleanYoutubeTitleForLyrics(raw);
  if (cleaned) queries.push(cleaned);

  const dashParts = cleaned.split(/\s+[-–—]\s+/).map((part) => part.trim()).filter(Boolean);
  if (dashParts.length >= 2) {
    queries.push(dashParts.slice(1).join(' - '));
  }

  queries.push(raw);
  return uniqueNonEmpty(queries);
}

export function transcriptLinesToCues(lines: TranscriptLine[]): CaptionCue[] {
  const prepared = lines
    .map((line) => ({
      start: line.offset / 1000,
      duration: line.duration / 1000,
      text: line.text,
    }))
    .filter((row) => row.text.length > 0);

  return prepared.map((row, index) => {
    const nextStart = prepared[index + 1]?.start;
    let end = row.duration > 0 ? row.start + row.duration : row.start + 2;
    if (nextStart != null && nextStart > row.start && (row.duration <= 0 || end > nextStart)) {
      end = nextStart;
    }
    return { start: row.start, end, text: row.text };
  });
}

function linesToCues(lines: TranscriptLine[]): CaptionCue[] {
  return transcriptLinesToCues(lines);
}

export function captionXmlToCues(xml: string): CaptionCue[] {
  return linesToCues(parseTranscriptXml(xml));
}

function parseInlineJson(html: string, globalName: string): unknown | null {
  const startToken = `var ${globalName} = `;
  const startIndex = html.indexOf(startToken);
  if (startIndex === -1) return null;
  const jsonStart = startIndex + startToken.length;
  let depth = 0;
  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(jsonStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function isAsrTrack(track: CaptionTrack): boolean {
  return track.kind === 'asr';
}

function pickChineseTrack(tracks: CaptionTrack[], allowAsr = true): CaptionTrack | undefined {
  const chinese = tracks.filter((track) => isChineseLang(track.languageCode));
  for (const code of ZH_LANG_CODES) {
    const exact = chinese.find((track) => track.languageCode === code && !isAsrTrack(track));
    if (exact) return exact;
  }
  const manual = chinese.find((track) => !isAsrTrack(track));
  if (manual) return manual;
  if (!allowAsr) return undefined;
  for (const code of ZH_LANG_CODES) {
    const exact = chinese.find((track) => track.languageCode === code);
    if (exact) return exact;
  }
  return chinese[0];
}

function pickEnglishTrack(tracks: CaptionTrack[], allowAsr = true): CaptionTrack | undefined {
  const english = tracks.filter((track) => isEnglishLang(track.languageCode));
  const manual = english.find((track) => !isAsrTrack(track));
  if (manual) return manual;
  if (!allowAsr) return undefined;
  return english[0];
}

function pickTranslationSourceTrack(tracks: CaptionTrack[]): CaptionTrack | undefined {
  return (
    pickEnglishTrack(tracks, true) ??
    pickChineseTrack(tracks, true) ??
    tracks.find((track) => !isAsrTrack(track)) ??
    tracks[0]
  );
}

function pickChineseTranslationLangs(translationLanguages: string[]): string[] {
  const fromYoutube = translationLanguages.filter((code) => isChineseLang(code));
  const merged = [...fromYoutube];
  for (const code of ZH_TRANSLATION_LANGS) {
    if (!merged.includes(code)) merged.push(code);
  }
  return merged;
}

function pickEnglishTranslationLangs(translationLanguages: string[]): string[] {
  const fromYoutube = translationLanguages.filter((code) => isEnglishLang(code));
  const merged = [...fromYoutube];
  for (const code of EN_TRANSLATION_LANGS) {
    if (!merged.includes(code)) merged.push(code);
  }
  return merged;
}

function parseCaptionTrackList(data: PlayerPayload | null | undefined): CaptionTrackList {
  const renderer = data?.captions?.playerCaptionsTracklistRenderer;
  const tracks = renderer?.captionTracks ?? [];
  const translationLanguages = (renderer?.translationLanguages ?? [])
    .map((entry) => entry.languageCode)
    .filter((code): code is string => Boolean(code));
  const title = data?.videoDetails?.title?.trim() || null;
  return { tracks, translationLanguages, title };
}

async function fetchInnertubePlayer(videoId: string, clientName: 'ANDROID' | 'WEB'): Promise<PlayerPayload | null> {
  const isAndroid = clientName === 'ANDROID';
  try {
    const resp = await fetch(INNERTUBE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': isAndroid ? INNERTUBE_USER_AGENT : YT_PAGE_USER_AGENT,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName,
            clientVersion: isAndroid ? INNERTUBE_CLIENT_VERSION : '2.20240815.00.00',
            hl: 'zh-CN',
          },
        },
        videoId,
      }),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as PlayerPayload;
  } catch {
    return null;
  }
}

async function fetchCaptionTrackList(videoId: string): Promise<CaptionTrackList> {
  let best: CaptionTrackList = { tracks: [], translationLanguages: [], title: null };

  for (const client of ['ANDROID', 'WEB'] as const) {
    const payload = await fetchInnertubePlayer(videoId, client);
    const list = parseCaptionTrackList(payload);
    if (!best.title && list.title) best = { ...best, title: list.title };
    if (list.tracks.length > 0) return { ...list, title: list.title ?? best.title };
  }

  try {
    const page = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
      headers: {
        'User-Agent': YT_PAGE_USER_AGENT,
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });
    const html = await page.text();
    const player = parseInlineJson(html, 'ytInitialPlayerResponse') as PlayerPayload | null;
    const list = parseCaptionTrackList(player);
    return { ...list, title: list.title ?? best.title };
  } catch {
    return best;
  }
}

function buildCaptionTrackUrl(track: CaptionTrack, tlang?: string): string {
  const url = new URL(track.baseUrl);
  url.searchParams.delete('fmt');
  url.searchParams.set('fmt', 'srv3');
  if (tlang) url.searchParams.set('tlang', tlang);
  return url.toString();
}

async function fetchCaptionXmlFromTrack(track: CaptionTrack, tlang?: string): Promise<string> {
  const res = await fetch(buildCaptionTrackUrl(track, tlang), {
    headers: {
      'User-Agent': YT_PAGE_USER_AGENT,
      Referer: 'https://www.youtube.com/',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`caption_download_failed:${res.status}`);
  return res.text();
}

async function fetchCuesFromTrack(
  track: CaptionTrack,
  tlang?: string,
): Promise<CaptionCue[] | null> {
  try {
    const xml = await fetchCaptionXmlFromTrack(track, tlang);
    const cues = captionXmlToCues(xml);
    return cues.length > 0 ? cues : null;
  } catch (e) {
    if (e instanceof Error && e.message === 'caption_blocked') throw e;
    return null;
  }
}

async function fetchTranscriptCues(
  videoId: string,
  lang?: string,
): Promise<TranscriptLine[] | null> {
  try {
    const lines = await YoutubeTranscript.fetchTranscript(videoId, lang ? { lang } : undefined);
    return lines.length > 0 ? lines : null;
  } catch {
    return null;
  }
}

async function fetchChineseViaTranscript(videoId: string): Promise<CaptionCue[] | null> {
  for (const lang of ZH_LANG_CODES) {
    const lines = await fetchTranscriptCues(videoId, lang);
    if (lines?.length) return linesToCues(lines);
  }
  const auto = await fetchTranscriptCues(videoId);
  if (auto?.length) {
    const cues = linesToCues(auto);
    if (cuesContainChinese(cues)) return cues;
  }
  return null;
}

async function fetchEnglishViaTranscript(videoId: string): Promise<CaptionCue[] | null> {
  for (const lang of EN_LANG_CODES) {
    const lines = await fetchTranscriptCues(videoId, lang);
    if (lines?.length) return linesToCues(lines);
  }
  const auto = await fetchTranscriptCues(videoId);
  if (auto?.length) {
    const cues = linesToCues(auto);
    if (cuesContainEnglish(cues)) return cues;
  }
  return null;
}

function buildChineseResult(
  videoId: string,
  cues: CaptionCue[],
  language: string,
  sourceLanguage: string | null,
  translated: boolean,
): YoutubeCaptionsResult | null {
  if (!cuesContainChinese(cues)) return null;
  return { videoId, language, sourceLanguage, translated, cues };
}

function buildEnglishResult(
  videoId: string,
  cues: CaptionCue[],
  language: string,
  sourceLanguage: string | null,
  translated: boolean,
): YoutubeCaptionsResult | null {
  if (!cuesContainEnglish(cues)) return null;
  return { videoId, language, sourceLanguage, translated, cues };
}

type LrclibHit = {
  trackName?: string;
  artistName?: string;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
};

type LrclibMatch = {
  syncedCues: CaptionCue[] | null;
  unsyncedCues: CaptionCue[] | null;
  language: 'zh' | 'en';
};

export function plainLyricsToCues(plain: string): CaptionCue[] {
  const lines = plain
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^\[[^\]]+\]$/.test(line))
    .filter((line) => !/^(作词|作曲|编曲|作詞|編曲|歌詞|歌词|Lyricist|Composer)\s*[:：]/.test(line));
  if (lines.length < 3) return [];
  return lines.map((text, index) => ({
    start: index * 4,
    end: index * 4 + 4,
    text,
  }));
}

export function cuesLookLikeLineLyrics(cues: CaptionCue[]): boolean {
  if (cues.length < 5) return false;
  const sample = cues.slice(0, 48);
  const lengths = sample.map((cue) => cue.text.replace(/\s+/g, ' ').trim().length).filter((n) => n > 0);
  if (lengths.length < 5) return false;
  const avg = lengths.reduce((sum, n) => sum + n, 0) / lengths.length;
  const longRatio = lengths.filter((n) => n > 48).length / lengths.length;
  const timedRatio = sample.filter((cue) => cue.end > cue.start + 0.2).length / sample.length;
  if (timedRatio < 0.7 || longRatio > 0.4) return false;
  if (cuesContainChinese(sample) && avg > 24) return false;
  if (!cuesContainChinese(sample) && avg > 56) return false;
  return true;
}

function latinTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-–—/|\[\]()【】『』「」（）]+/)
    .filter((token) => token.length >= 3 && !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(token) && !/^\d+$/.test(token));
}

export function scoreLrclibHit(query: string, hit: LrclibHit): number {
  const track = hit.trackName ?? '';
  const artist = hit.artistName ?? '';
  const hay = `${artist} ${track}`.toLowerCase();
  let score = 0;

  for (const run of extractCjkRuns(query)) {
    if (track.includes(run)) score += run.length * 6;
    else if (artist.includes(run)) score += run.length;
    else score -= run.length * 8;
  }

  for (const token of latinTokens(query)) {
    if (track.toLowerCase().includes(token)) score += token.length * 3;
    else if (hay.includes(token)) score += token.length;
  }

  const trackNorm = track.toLowerCase().replace(/\s+/g, '');
  const queryNorm = query.toLowerCase().replace(/\s+/g, '');
  if (trackNorm.length >= 2 && (queryNorm.includes(trackNorm) || trackNorm.includes(queryNorm))) {
    score += Math.min(trackNorm.length, queryNorm.length) * 2;
  }

  return score;
}

function trackContainsQueryTitle(query: string, hit: LrclibHit): boolean {
  const track = hit.trackName ?? '';
  const cjkRuns = extractCjkRuns(query);
  if (cjkRuns.length > 0) {
    const longest = cjkRuns.reduce((best, run) => (run.length >= best.length ? run : best));
    if (longest.length >= 4) return track.includes(longest);
    return cjkRuns.some((run) => track.includes(run));
  }
  const tokens = latinTokens(query);
  if (tokens.length === 0) return false;
  const inTrack = tokens.filter((token) => track.toLowerCase().includes(token));
  return inTrack.reduce((sum, token) => sum + token.length, 0) >= 6;
}

function hitPassesThreshold(
  query: string,
  hit: LrclibHit,
  score: number,
  secondScore?: number,
): boolean {
  const track = hit.trackName ?? '';
  const artist = hit.artistName ?? '';
  const cjkRuns = extractCjkRuns(query);
  if (cjkRuns.length > 0) {
    const missing = cjkRuns.filter((run) => !track.includes(run) && !artist.includes(run));
    if (missing.length > 0) return false;
    if (!cjkRuns.some((run) => track.includes(run))) return false;
  } else {
    const tokens = latinTokens(query);
    const inTrack = tokens.filter((token) => track.toLowerCase().includes(token));
    if (inTrack.reduce((sum, token) => sum + token.length, 0) < 6) return false;
  }

  const minScore = cjkRuns.length > 0 ? Math.max(10, cjkRuns.reduce((sum, run) => sum + run.length, 0)) : 8;
  if (score < minScore) return false;

  if (secondScore != null && score - secondScore < 4 && !trackContainsQueryTitle(query, hit)) {
    return false;
  }
  return true;
}

function bestQueryForHit(queries: string[], hit: LrclibHit): string {
  return queries.reduce((best, query) => (scoreLrclibHit(query, hit) > scoreLrclibHit(best, hit) ? query : best), queries[0] ?? '');
}

export function pickBestLrclibHit(
  queries: string[],
  hits: LrclibHit[],
  opts: { lyrics?: 'synced' | 'unsynced' | 'any' } = {},
): LrclibHit | null {
  if (queries.length === 0 || hits.length === 0) return null;
  const lyrics = opts.lyrics ?? 'synced';
  const filtered = hits.filter((hit) => {
    if (hit.instrumental) return false;
    const hasSync = Boolean(hit.syncedLyrics?.includes('['));
    const hasPlain = Boolean(hit.plainLyrics?.trim());
    if (lyrics === 'synced') return hasSync;
    if (lyrics === 'unsynced') return hasPlain && !hasSync;
    return hasSync || hasPlain;
  });
  if (filtered.length === 0) return null;

  const scored = filtered.map((hit) => {
    const query = bestQueryForHit(queries, hit);
    return { hit, query, score: scoreLrclibHit(query, hit) };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]!;
  const second = scored[1];
  if (!hitPassesThreshold(best.query, best.hit, best.score, second?.score)) return null;
  return best.hit;
}

function isHighConfidenceHit(title: string, hit: LrclibHit): boolean {
  const longest = extractCjkRuns(title).reduce((best, run) => (run.length >= best.length ? run : best), '');
  if (longest.length >= 4) return (hit.trackName ?? '').includes(longest);
  return trackContainsQueryTitle(cleanYoutubeTitleForLyrics(title) || title, hit);
}

function lrclibHitToCues(hit: LrclibHit, allowUnsynced: boolean): CaptionCue[] | null {
  if (hit.syncedLyrics?.includes('[')) {
    const cues = parseLrcToCues(hit.syncedLyrics);
    if (cues.length > 0) return cues;
  }
  if (allowUnsynced && hit.plainLyrics) {
    const cues = plainLyricsToCues(hit.plainLyrics);
    if (cues.length > 0) return cues;
  }
  return null;
}

async function searchLrclib(params: Record<string, string>): Promise<LrclibHit[]> {
  try {
    const url = new URL('https://lrclib.net/api/search');
    for (const [key, value] of Object.entries(params)) {
      const trimmed = value.trim();
      if (trimmed) url.searchParams.set(key, trimmed);
    }
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': YT_PAGE_USER_AGENT },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as LrclibHit[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function fetchLrclibMatch(title: string): Promise<LrclibMatch | null> {
  const queries = extractLyricsSearchQueries(title);
  const pairs = extractArtistTrackPairs(title);
  if (queries.length === 0) return null;

  const collected: LrclibHit[] = [];
  const seen = new Set<string>();
  const addHits = (rows: LrclibHit[]) => {
    for (const row of rows) {
      const key = `${row.artistName ?? ''}\0${row.trackName ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(row);
    }
  };

  const firstBatch: Array<Promise<LrclibHit[]>> = pairs
    .slice(0, 2)
    .map((pair) => searchLrclib({ track_name: pair.track, artist_name: pair.artist }));
  if (queries[0]) firstBatch.push(searchLrclib({ q: queries[0] }));
  for (const rows of await Promise.all(firstBatch)) addHits(rows);

  const confident = collected.some((hit) => isHighConfidenceHit(title, hit) && hit.syncedLyrics?.includes('['));
  if (!confident) {
    const rest: Array<Promise<LrclibHit[]>> = queries.slice(1, 6).map((query) => searchLrclib({ q: query }));
    for (const pair of pairs.slice(2, 3)) {
      rest.push(searchLrclib({ track_name: pair.track, artist_name: pair.artist }));
    }
    if (rest.length > 0) {
      for (const rows of await Promise.all(rest)) addHits(rows);
    }
  }

  const syncedHit = pickBestLrclibHit(queries, collected, { lyrics: 'synced' });
  const syncedCues = syncedHit ? lrclibHitToCues(syncedHit, false) : null;
  const unsyncedHit = syncedCues ? null : pickBestLrclibHit(queries, collected, { lyrics: 'unsynced' });
  const unsyncedCues = unsyncedHit ? lrclibHitToCues(unsyncedHit, true) : null;
  const sample = syncedCues ?? unsyncedCues;
  if (!sample?.length) return null;
  return {
    syncedCues,
    unsyncedCues,
    language: cuesContainChinese(sample) ? 'zh' : 'en',
  };
}

export async function fetchLrclibCues(title: string): Promise<CaptionCue[] | null> {
  const match = await fetchLrclibMatch(title);
  return match?.syncedCues ?? null;
}

function lrclibMatchToResult(
  videoId: string,
  match: LrclibMatch | null | undefined,
  preferUnsynced: boolean,
): YoutubeCaptionsResult | null {
  const cues = preferUnsynced ? match?.unsyncedCues : match?.syncedCues;
  if (!cues?.length) return null;
  return {
    videoId,
    language: match?.language ?? (cuesContainChinese(cues) ? 'zh' : 'en'),
    sourceLanguage: 'lrclib',
    translated: false,
    cues,
  };
}

async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', sourceLang);
    url.searchParams.set('tl', targetLang);
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', trimmed);
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': YT_PAGE_USER_AGENT },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<Array<Array<string>> | undefined>;
    const translated = data?.[0]?.map((part) => part[0]).join('').trim();
    return translated || null;
  } catch {
    return null;
  }
}

async function translateCues(
  cues: CaptionCue[],
  sourceLanguage: string,
  targetLang: string,
  validate: (cues: CaptionCue[]) => boolean,
): Promise<CaptionCue[] | null> {
  const sourceLang = isChineseLang(sourceLanguage)
    ? 'zh-CN'
    : isEnglishLang(sourceLanguage)
      ? 'en'
      : 'auto';
  const translated: CaptionCue[] = [];
  const batchSize = 5;

  for (let i = 0; i < cues.length; i += batchSize) {
    const batch = cues.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (cue) => {
        const text = await translateText(cue.text, sourceLang, targetLang);
        return text ? { ...cue, text } : null;
      }),
    );
    for (const cue of results) {
      if (!cue) return null;
      translated.push(cue);
    }
  }

  return validate(translated) ? translated : null;
}

function hasManualChineseTrack(tracks: CaptionTrack[]): boolean {
  return tracks.some((track) => isChineseLang(track.languageCode) && !isAsrTrack(track));
}

function hasManualEnglishTrack(tracks: CaptionTrack[]): boolean {
  return tracks.some((track) => isEnglishLang(track.languageCode) && !isAsrTrack(track));
}

async function fetchManualChineseCues(
  videoId: string,
  tracks: CaptionTrack[],
): Promise<YoutubeCaptionsResult | null> {
  const zhTrack = pickChineseTrack(tracks, false);
  if (zhTrack) {
    const cues = await fetchCuesFromTrack(zhTrack);
    if (cues?.length) {
      return buildChineseResult(videoId, cues, zhTrack.languageCode, null, false);
    }
  }

  if (!hasManualChineseTrack(tracks)) return null;
  const viaTranscript = await fetchChineseViaTranscript(videoId);
  if (viaTranscript?.length) {
    return buildChineseResult(videoId, viaTranscript, 'zh', null, false);
  }
  return null;
}

async function fetchAsrChineseIfLyricLike(
  videoId: string,
  tracks: CaptionTrack[],
): Promise<YoutubeCaptionsResult | null> {
  const zhTrack = pickChineseTrack(tracks, true);
  if (zhTrack && isAsrTrack(zhTrack)) {
    const cues = await fetchCuesFromTrack(zhTrack);
    if (cues?.length && cuesLookLikeLineLyrics(cues)) {
      return buildChineseResult(videoId, cues, zhTrack.languageCode, null, false);
    }
  }

  if (tracks.some((track) => isChineseLang(track.languageCode))) {
    const viaTranscript = await fetchChineseViaTranscript(videoId);
    if (viaTranscript?.length && cuesLookLikeLineLyrics(viaTranscript)) {
      return buildChineseResult(videoId, viaTranscript, 'zh', null, false);
    }
  }
  return null;
}

async function fetchChineseMachineTranslation(
  tracks: CaptionTrack[],
  translationLanguages: string[],
  videoId: string,
): Promise<YoutubeCaptionsResult | null> {
  const sourceTrack = pickTranslationSourceTrack(tracks);
  if (!sourceTrack) return null;

  const tlangs = pickChineseTranslationLangs(translationLanguages);
  for (const tlang of tlangs) {
    const cues = await fetchCuesFromTrack(sourceTrack, tlang);
    if (cues?.length) {
      const result = buildChineseResult(videoId, cues, tlang, sourceTrack.languageCode, true);
      if (result) return result;
    }
  }

  const sourceCues = await fetchCuesFromTrack(sourceTrack);
  if (sourceCues?.length) {
    const machineTranslated = await translateCues(
      sourceCues,
      sourceTrack.languageCode,
      'zh-CN',
      cuesContainChinese,
    );
    if (machineTranslated?.length) {
      return buildChineseResult(videoId, machineTranslated, 'zh-CN', sourceTrack.languageCode, true);
    }
  }
  return null;
}

async function fetchManualEnglishCues(
  videoId: string,
  tracks: CaptionTrack[],
): Promise<YoutubeCaptionsResult | null> {
  const enTrack = pickEnglishTrack(tracks, false);
  if (enTrack) {
    const cues = await fetchCuesFromTrack(enTrack);
    if (cues?.length) {
      return buildEnglishResult(videoId, cues, enTrack.languageCode, null, false);
    }
  }

  if (!hasManualEnglishTrack(tracks)) return null;
  const viaTranscript = await fetchEnglishViaTranscript(videoId);
  if (viaTranscript?.length) {
    return buildEnglishResult(videoId, viaTranscript, 'en', null, false);
  }
  return null;
}

async function fetchAsrEnglishIfLyricLike(
  videoId: string,
  tracks: CaptionTrack[],
): Promise<YoutubeCaptionsResult | null> {
  const enTrack = pickEnglishTrack(tracks, true);
  if (enTrack && isAsrTrack(enTrack)) {
    const cues = await fetchCuesFromTrack(enTrack);
    if (cues?.length && cuesLookLikeLineLyrics(cues)) {
      return buildEnglishResult(videoId, cues, enTrack.languageCode, null, false);
    }
  }

  if (tracks.some((track) => isEnglishLang(track.languageCode))) {
    const viaTranscript = await fetchEnglishViaTranscript(videoId);
    if (viaTranscript?.length && cuesLookLikeLineLyrics(viaTranscript)) {
      return buildEnglishResult(videoId, viaTranscript, 'en', null, false);
    }
  }
  return null;
}

async function fetchEnglishMachineTranslation(
  tracks: CaptionTrack[],
  translationLanguages: string[],
  videoId: string,
): Promise<YoutubeCaptionsResult | null> {
  const zhTrack = pickChineseTrack(tracks, true);
  if (zhTrack) {
    const tlangs = pickEnglishTranslationLangs(translationLanguages);
    for (const tlang of tlangs) {
      const cues = await fetchCuesFromTrack(zhTrack, tlang);
      if (cues?.length) {
        const result = buildEnglishResult(videoId, cues, tlang, zhTrack.languageCode, true);
        if (result) return result;
      }
    }

    const chineseCues = await fetchCuesFromTrack(zhTrack);
    if (chineseCues?.length) {
      const machineTranslated = await translateCues(
        chineseCues,
        zhTrack.languageCode,
        'en',
        cuesContainEnglish,
      );
      if (machineTranslated?.length) {
        return buildEnglishResult(videoId, machineTranslated, 'en', zhTrack.languageCode, true);
      }
    }
  }

  const enTrack = pickEnglishTrack(tracks, true);
  if (enTrack) {
    const cues = await fetchCuesFromTrack(enTrack);
    if (cues?.length) {
      return buildEnglishResult(videoId, cues, enTrack.languageCode, null, false);
    }
  }
  return null;
}

async function fetchCaptionsForLanguage(
  videoId: string,
  subtitleLang: SubtitleLanguage,
  tracks: CaptionTrack[],
  translationLanguages: string[],
  lrclibMatch: Promise<LrclibMatch | null> | null,
): Promise<YoutubeCaptionsResult | null> {
  const wantEnglish = subtitleLang === 'en';
  const manual = wantEnglish
    ? await fetchManualEnglishCues(videoId, tracks)
    : await fetchManualChineseCues(videoId, tracks);
  if (manual?.cues.length) return manual;

  const lrclib = lrclibMatch ? await lrclibMatch : null;
  const synced = lrclibMatchToResult(videoId, lrclib, false);
  if (synced) return synced;

  const asr = wantEnglish
    ? await fetchAsrEnglishIfLyricLike(videoId, tracks)
    : await fetchAsrChineseIfLyricLike(videoId, tracks);
  if (asr?.cues.length) return asr;

  const unsynced = lrclibMatchToResult(videoId, lrclib, true);
  if (unsynced) return unsynced;

  return wantEnglish
    ? fetchEnglishMachineTranslation(tracks, translationLanguages, videoId)
    : fetchChineseMachineTranslation(tracks, translationLanguages, videoId);
}

export async function fetchYoutubeVideoCaptions(
  videoId: string,
  opts: { subtitleLang?: SubtitleLanguage; title?: string } = {},
): Promise<YoutubeCaptionsResult | null> {
  if (!VIDEO_ID_RE.test(videoId)) return null;

  const subtitleLang = opts.subtitleLang === 'en' ? 'en' : 'zh';
  const titleHint = opts.title?.trim() || '';
  const lrclibFromHint = titleHint ? fetchLrclibMatch(titleHint) : null;
  const { tracks, translationLanguages, title } = await fetchCaptionTrackList(videoId);
  const hintTitle = titleHint || title;
  const lrclibMatch = lrclibFromHint ?? (hintTitle ? fetchLrclibMatch(hintTitle) : null);

  return fetchCaptionsForLanguage(videoId, subtitleLang, tracks, translationLanguages, lrclibMatch);
}
