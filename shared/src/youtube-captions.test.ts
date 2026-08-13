import { describe, expect, it } from 'vitest';
import {
  captionXmlToCues,
  cleanYoutubeTitleForLyrics,
  cuesLookLikeLineLyrics,
  cuesMatchSongTitle,
  extractLyricsSearchQueries,
  isBlockedCaptionPayload,
  parseLrcToCues,
  pickBestLrclibHit,
  plainLyricsToCues,
  transcriptLinesToCues,
} from './youtube-captions.js';

describe('captionXmlToCues', () => {
  it('parses srv3 cues when t/d are not adjacent', () => {
    const xml = `
      <timedtext>
        <body>
          <p id="1" t="1000" w="1" d="2000"><s>你好</s></p>
          <p d="1500" t="3500">世界</p>
        </body>
      </timedtext>
    `;
    expect(captionXmlToCues(xml)).toEqual([
      { start: 1, end: 3, text: '你好' },
      { start: 3.5, end: 5, text: '世界' },
    ]);
  });

  it('ends zero-duration lines at the next cue', () => {
    const cues = transcriptLinesToCues([
      { text: 'one', offset: 0, duration: 0 },
      { text: 'two', offset: 800, duration: 0 },
      { text: 'three', offset: 1600, duration: 1200 },
    ]);
    expect(cues).toEqual([
      { start: 0, end: 0.8, text: 'one' },
      { start: 0.8, end: 1.6, text: 'two' },
      { start: 1.6, end: 2.8, text: 'three' },
    ]);
  });

  it('parses classic <text> tags with extra attributes', () => {
    const xml = `<transcript><text start="1.5" dur="2" w="1">你好</text></transcript>`;
    expect(captionXmlToCues(xml)).toEqual([{ start: 1.5, end: 3.5, text: '你好' }]);
  });

  it('parses LRC synced lyrics', () => {
    expect(
      parseLrcToCues('[00:25.94] 这一路上走走停停\n[00:29.39] 顺着少年漂流的痕迹\n'),
    ).toEqual([
      { start: 25.94, end: 29.39, text: '这一路上走走停停' },
      { start: 29.39, end: 33.39, text: '顺着少年漂流的痕迹' },
    ]);
  });

  it('merges word-level LRC into slower lines', () => {
    const cues = parseLrcToCues(
      '[00:12.00]我\n[00:12.40]不愿\n[00:12.90]让你\n[00:13.50]一个人\n',
    );
    expect(cues).toHaveLength(1);
    expect(cues[0]?.text).toBe('我不愿让你一个人');
  });

  it('strips karaoke decorations from YouTube titles', () => {
    expect(
      cleanYoutubeTitleForLyrics('買辣椒也用券 - 起風了 (新版)【動態歌詞Lyrics】'),
    ).toBe('買辣椒也用券 - 起風了');
  });

  it('keeps Chinese song titles inside square brackets', () => {
    const title = 'Mayday五月天 [我不願讓你一個人]';
    expect(cleanYoutubeTitleForLyrics(title)).toContain('我不願讓你一個人');

    const queries = extractLyricsSearchQueries(title);
    expect(queries[0]).toBe('我不願讓你一個人');
    expect(queries.some((query) => query.includes('五月天') && query.includes('我不願讓你一個人'))).toBe(true);
    expect(queries.some((query) => /mayday/i.test(query) && query.includes('我不願讓你一個人'))).toBe(true);
  });

  it('parses unbracketed artist plus song title', () => {
    const queries = extractLyricsSearchQueries('周杰伦 蘭亭序');
    expect(queries[0]).toBe('蘭亭序');
    expect(queries.some((query) => query.includes('周杰伦') && query.includes('蘭亭序'))).toBe(true);
  });

  it('rejects YouTube captions that are a translation of the song', () => {
    expect(
      cuesMatchSongTitle(
        [
          { start: 0, end: 1, text: '我不想让你感到孤独' },
          { start: 1, end: 2, text: '即使我知道你不在那里，我依然会问' },
          { start: 2, end: 3, text: '空气不会替你回答' },
        ],
        'Mayday五月天 [我不願讓你一個人]',
      ),
    ).toBe(false);

    expect(
      cuesMatchSongTitle(
        [
          { start: 0, end: 1, text: '你說呢 明知你不在 還是會問' },
          { start: 1, end: 2, text: '我不願讓你一個人' },
        ],
        'Mayday五月天 [我不願讓你一個人]',
      ),
    ).toBe(true);
  });

  it('extracts the bracket title even when the video title has extra prefixes', () => {
    const queries = extractLyricsSearchQueries(
      'idea - 未目前 Mayday五月天 [我不願讓你一個人]',
    );
    expect(queries).toContain('我不願讓你一個人');
    expect(cleanYoutubeTitleForLyrics('idea - 未目前 Mayday五月天 [我不願讓你一個人]')).toContain(
      '我不願讓你一個人',
    );
  });

  it('picks the lrclib hit whose track name contains the CJK title', () => {
    const queries = extractLyricsSearchQueries('Mayday五月天 [我不願讓你一個人]');
    const hit = pickBestLrclibHit(queries, [
      { trackName: '倔強', artistName: '五月天', syncedLyrics: '[00:01.00] 當' },
      {
        trackName: '我不願讓你一個人',
        artistName: '五月天',
        syncedLyrics: '[00:12.00] 我不願讓你一個人',
      },
    ]);
    expect(hit?.trackName).toBe('我不願讓你一個人');
  });

  it('rejects lrclib hits that only share the artist', () => {
    const queries = extractLyricsSearchQueries('Mayday五月天 [我不願讓你一個人]');
    expect(
      pickBestLrclibHit(queries, [
        { trackName: '倔強', artistName: '五月天', syncedLyrics: '[00:01.00] 當' },
        {
          trackName: "I Don't Want You To Be Lonely",
          artistName: 'Someone',
          syncedLyrics: "[00:01.00] I don't want you to feel lonely",
        },
      ]),
    ).toBeNull();
  });

  it('turns unsynced plain lyrics into cues when there is no LRC', () => {
    expect(
      plainLyricsToCues('我不願讓你一個人\n你做得到嗎\n即使我知道\n'),
    ).toEqual([
      { start: 0, end: 4, text: '我不願讓你一個人' },
      { start: 4, end: 8, text: '你做得到嗎' },
      { start: 8, end: 12, text: '即使我知道' },
    ]);
  });

  it('treats short timed lines as lyrics and rejects long spoken captions', () => {
    expect(
      cuesLookLikeLineLyrics([
        { start: 0, end: 2, text: '我不願讓你一個人' },
        { start: 2, end: 4, text: '你走了以後' },
        { start: 4, end: 6, text: '愛怎麼能完整' },
        { start: 6, end: 8, text: '我的天空' },
        { start: 8, end: 10, text: '像下雨的風景' },
      ]),
    ).toBe(true);

    expect(
      cuesLookLikeLineLyrics([
        { start: 0, end: 8, text: '大家好今天我们来看一下这个视频里面发生了什么事情然后我再跟大家解释一下' },
        { start: 8, end: 16, text: '其实你知道吗这个部分其实非常复杂所以我必须慢慢说给你听这样你才能明白' },
        { start: 16, end: 24, text: '接下来我会继续讲很多口语内容因为它本来就不是一句一句的歌词' },
        { start: 24, end: 32, text: '所以这些自动转写会变成很长的句子而不是短歌词' },
        { start: 32, end: 40, text: '最后再补充一些说明让整段看起来更像旁白而不是歌曲' },
      ]),
    ).toBe(false);
  });

  it('detects blocked caption pages', () => {
    expect(isBlockedCaptionPayload('<html>Sorry... class="g-recaptcha"</html>')).toBe(true);
    expect(isBlockedCaptionPayload('<timedtext><body></body></timedtext>')).toBe(false);
    expect(() => captionXmlToCues('<html>Sorry...</html>')).toThrow('caption_blocked');
  });
});
