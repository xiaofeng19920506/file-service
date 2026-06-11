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
};

type TranscriptLine = {
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

function parseTranscriptXml(xml: string): TranscriptLine[] {
  if (xml.includes('Sorry...') || xml.includes('class="g-recaptcha"')) return [];

  const results: TranscriptLine[] = [];

  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match: RegExpExecArray | null;
  while ((match = pRegex.exec(xml))) {
    const startMs = parseInt(match[1]!, 10);
    const durMs = parseInt(match[2]!, 10);
    const inner = match[3] ?? '';
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

  const classicRegex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
  while ((match = classicRegex.exec(xml))) {
    const start = parseFloat(match[1] ?? '0');
    const dur = parseFloat(match[2] ?? '0');
    const text = decodeEntities(match[3] ?? '').trim();
    if (text) {
      results.push({ text, duration: dur * 1000, offset: start * 1000 });
    }
  }
  return results;
}

function linesToCues(lines: TranscriptLine[]): CaptionCue[] {
  return lines
    .map((line) => {
      const start = line.offset / 1000;
      const duration = line.duration / 1000;
      const end = duration > 0 ? start + duration : start + 2;
      return { start, end, text: line.text };
    })
    .filter((cue) => cue.text.length > 0);
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

function parseCaptionTrackList(data: {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
      translationLanguages?: Array<{ languageCode?: string }>;
    };
  };
}): CaptionTrackList {
  const renderer = data.captions?.playerCaptionsTracklistRenderer;
  const tracks = renderer?.captionTracks ?? [];
  const translationLanguages = (renderer?.translationLanguages ?? [])
    .map((entry) => entry.languageCode)
    .filter((code): code is string => Boolean(code));
  return { tracks, translationLanguages };
}

async function fetchCaptionTrackList(videoId: string): Promise<CaptionTrackList> {
  try {
    const resp = await fetch(INNERTUBE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': INNERTUBE_USER_AGENT,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: INNERTUBE_CLIENT_VERSION,
            hl: 'zh-CN',
          },
        },
        videoId,
      }),
    });
    if (resp.ok) {
      const list = parseCaptionTrackList((await resp.json()) as Parameters<typeof parseCaptionTrackList>[0]);
      if (list.tracks.length > 0) return list;
    }
  } catch {
    // fall through to watch page
  }

  const page = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
    headers: {
      'User-Agent': YT_PAGE_USER_AGENT,
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });
  const html = await page.text();
  const player = parseInlineJson(html, 'ytInitialPlayerResponse') as Parameters<
    typeof parseCaptionTrackList
  >[0] | null;
  return parseCaptionTrackList(player ?? {});
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
    const cues = linesToCues(parseTranscriptXml(xml));
    return cues.length > 0 ? cues : null;
  } catch {
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
  return null;
}

async function fetchEnglishViaTranscript(videoId: string): Promise<CaptionCue[] | null> {
  for (const lang of EN_LANG_CODES) {
    const lines = await fetchTranscriptCues(videoId, lang);
    if (lines?.length) return linesToCues(lines);
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
    return buildChineseResult(
      videoId,
      viaTranscript,
      'zh',
      enTrack?.languageCode ?? null,
      Boolean(enTrack),
    );
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
    return buildEnglishResult(
      videoId,
      viaTranscript,
      'en',
      zhTrack?.languageCode ?? null,
      Boolean(zhTrack),
    );
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
  opts: { subtitleLang?: SubtitleLanguage } = {},
): Promise<YoutubeCaptionsResult | null> {
  if (!VIDEO_ID_RE.test(videoId)) return null;

  const subtitleLang = opts.subtitleLang === 'en' ? 'en' : 'zh';
  const { tracks, translationLanguages } = await fetchCaptionTrackList(videoId);
  if (tracks.length === 0) return null;

  if (subtitleLang === 'en') {
    return fetchEnglishTranslationCues(videoId, tracks, translationLanguages);
  }

  return fetchChineseTranslationCues(videoId, tracks, translationLanguages);
}
