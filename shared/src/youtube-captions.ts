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

export function cleanYoutubeTitleForLyrics(title: string): string {
  return title
    .replace(/【[^】]*】/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/『[^』]*』/g, ' ')
    .replace(/「[^」]*」/g, ' ')
    .replace(/（[^）]*）/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/#[^\s#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function pickChineseTrack(tracks: CaptionTrack[]): CaptionTrack | undefined {
  for (const code of ZH_LANG_CODES) {
    const exact = tracks.find((track) => track.languageCode === code);
    if (exact) return exact;
  }
  return tracks.find((track) => isChineseLang(track.languageCode));
}

function pickEnglishTrack(tracks: CaptionTrack[]): CaptionTrack | undefined {
  const english = tracks.filter((track) => isEnglishLang(track.languageCode));
  return (
    english.find((track) => track.kind !== 'asr') ??
    english[0] ??
    tracks.find((track) => track.kind !== 'asr') ??
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
};

function scoreLrclibHit(query: string, hit: LrclibHit): number {
  const hay = `${hit.artistName ?? ''} ${hit.trackName ?? ''}`.toLowerCase();
  let score = 0;
  for (const token of query.toLowerCase().split(/[\s\-–—/|]+/).filter((part) => part.length >= 2)) {
    if (hay.includes(token)) score += token.length;
  }
  return score;
}

export async function fetchLrclibCues(title: string): Promise<CaptionCue[] | null> {
  const query = cleanYoutubeTitleForLyrics(title);
  if (query.length < 2) return null;
  try {
    const url = new URL('https://lrclib.net/api/search');
    url.searchParams.set('q', query);
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': YT_PAGE_USER_AGENT },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as LrclibHit[];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const withSync = rows.filter((row) => row.syncedLyrics?.includes('['));
    if (withSync.length === 0) return null;
    withSync.sort((a, b) => scoreLrclibHit(query, b) - scoreLrclibHit(query, a));
    const cues = parseLrcToCues(withSync[0]!.syncedLyrics ?? '');
    return cues.length > 0 ? cues : null;
  } catch {
    return null;
  }
}

async function lyricsFallbackResult(
  videoId: string,
  title: string | null | undefined,
): Promise<YoutubeCaptionsResult | null> {
  if (!title?.trim()) return null;
  const cues = await fetchLrclibCues(title);
  if (!cues?.length) return null;
  return {
    videoId,
    language: cuesContainChinese(cues) ? 'zh' : 'en',
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

async function fetchChineseTranslationCues(
  videoId: string,
  tracks: CaptionTrack[],
  translationLanguages: string[],
): Promise<YoutubeCaptionsResult | null> {
  const viaTranscript = await fetchChineseViaTranscript(videoId);
  if (viaTranscript?.length) {
    const enTrack = pickEnglishTrack(tracks);
    const result = buildChineseResult(
      videoId,
      viaTranscript,
      'zh',
      enTrack?.languageCode ?? null,
      Boolean(enTrack),
    );
    if (result) return result;
  }

  const zhTrack = pickChineseTrack(tracks);
  if (zhTrack) {
    const cues = await fetchCuesFromTrack(zhTrack);
    if (cues?.length) {
      const enTrack = pickEnglishTrack(tracks);
      return buildChineseResult(
        videoId,
        cues,
        zhTrack.languageCode,
        enTrack?.languageCode ?? null,
        Boolean(enTrack),
      );
    }
  }

  const sourceTrack = pickEnglishTrack(tracks);
  if (!sourceTrack) return null;

  const tlangs = pickChineseTranslationLangs(translationLanguages);
  for (const tlang of tlangs) {
    const cues = await fetchCuesFromTrack(sourceTrack, tlang);
    if (cues?.length) {
      const result = buildChineseResult(
        videoId,
        cues,
        tlang,
        sourceTrack.languageCode,
        true,
      );
      if (result) return result;
    }
  }

  const englishCues = await fetchCuesFromTrack(sourceTrack);
  if (englishCues?.length) {
    const machineTranslated = await translateCues(
      englishCues,
      sourceTrack.languageCode,
      'zh-CN',
      cuesContainChinese,
    );
    if (machineTranslated?.length) {
      return buildChineseResult(
        videoId,
        machineTranslated,
        'zh-CN',
        sourceTrack.languageCode,
        true,
      );
    }
  }

  return null;
}

async function fetchEnglishTranslationCues(
  videoId: string,
  tracks: CaptionTrack[],
  translationLanguages: string[],
): Promise<YoutubeCaptionsResult | null> {
  const viaTranscript = await fetchEnglishViaTranscript(videoId);
  if (viaTranscript?.length) {
    const zhTrack = pickChineseTrack(tracks);
    const result = buildEnglishResult(
      videoId,
      viaTranscript,
      'en',
      zhTrack?.languageCode ?? null,
      Boolean(zhTrack),
    );
    if (result) return result;
  }

  const enTrack = pickEnglishTrack(tracks);
  if (enTrack && isEnglishLang(enTrack.languageCode)) {
    const cues = await fetchCuesFromTrack(enTrack);
    if (cues?.length) {
      const zhTrack = pickChineseTrack(tracks);
      return buildEnglishResult(
        videoId,
        cues,
        enTrack.languageCode,
        zhTrack?.languageCode ?? null,
        Boolean(zhTrack),
      );
    }
  }

  const zhTrack = pickChineseTrack(tracks);
  if (zhTrack) {
    const tlangs = pickEnglishTranslationLangs(translationLanguages);
    for (const tlang of tlangs) {
      const cues = await fetchCuesFromTrack(zhTrack, tlang);
      if (cues?.length) {
        const result = buildEnglishResult(
          videoId,
          cues,
          tlang,
          zhTrack.languageCode,
          true,
        );
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
        return buildEnglishResult(
          videoId,
          machineTranslated,
          'en',
          zhTrack.languageCode,
          true,
        );
      }
    }
  }

  // 中文歌常见情况：YouTube 仅提供英文字幕轨（如赞美之泉官方歌词版）
  if (enTrack) {
    const cues = await fetchCuesFromTrack(enTrack);
    if (cues?.length) {
      return buildEnglishResult(videoId, cues, enTrack.languageCode, null, false);
    }
  }

  return null;
}

export async function fetchYoutubeVideoCaptions(
  videoId: string,
  opts: { subtitleLang?: SubtitleLanguage; title?: string } = {},
): Promise<YoutubeCaptionsResult | null> {
  if (!VIDEO_ID_RE.test(videoId)) return null;

  const subtitleLang = opts.subtitleLang === 'en' ? 'en' : 'zh';
  const { tracks, translationLanguages, title } = await fetchCaptionTrackList(videoId);
  const hintTitle = opts.title?.trim() || title;

  if (tracks.length === 0) {
    if (subtitleLang === 'en') {
      const viaTranscript = await fetchEnglishViaTranscript(videoId);
      const english = viaTranscript?.length
        ? buildEnglishResult(videoId, viaTranscript, 'en', null, false)
        : null;
      if (english) return english;
    } else {
      const viaTranscript = await fetchChineseViaTranscript(videoId);
      const chinese = viaTranscript?.length
        ? buildChineseResult(videoId, viaTranscript, 'zh', null, false)
        : null;
      if (chinese) return chinese;
    }
    return lyricsFallbackResult(videoId, hintTitle);
  }

  const fromYoutube =
    subtitleLang === 'en'
      ? await fetchEnglishTranslationCues(videoId, tracks, translationLanguages)
      : await fetchChineseTranslationCues(videoId, tracks, translationLanguages);
  if (fromYoutube?.cues.length) return fromYoutube;
  return lyricsFallbackResult(videoId, hintTitle);
}
