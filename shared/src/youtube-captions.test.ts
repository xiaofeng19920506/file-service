import { describe, expect, it } from 'vitest';
import {
  captionXmlToCues,
  cleanYoutubeTitleForLyrics,
  isBlockedCaptionPayload,
  parseLrcToCues,
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

  it('strips karaoke decorations from YouTube titles', () => {
    expect(
      cleanYoutubeTitleForLyrics('買辣椒也用券 - 起風了 (新版)【動態歌詞Lyrics】'),
    ).toBe('買辣椒也用券 - 起風了');
  });

  it('detects blocked caption pages', () => {
    expect(isBlockedCaptionPayload('<html>Sorry... class="g-recaptcha"</html>')).toBe(true);
    expect(isBlockedCaptionPayload('<timedtext><body></body></timedtext>')).toBe(false);
    expect(() => captionXmlToCues('<html>Sorry...</html>')).toThrow('caption_blocked');
  });
});
