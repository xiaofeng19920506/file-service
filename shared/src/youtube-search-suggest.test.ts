import { describe, expect, it } from 'vitest';
import { parseYoutubeSearchSuggestBody } from './youtube-search-suggest.js';

describe('parseYoutubeSearchSuggestBody', () => {
  it('parses standard suggest JSON prefix', () => {
    const body = `)]}'\n["逆爱",["逆爱","逆爱 电视剧","逆爱 mv"],[],{"k":1}]`;
    expect(parseYoutubeSearchSuggestBody(body)).toEqual(['逆爱', '逆爱 电视剧', '逆爱 mv']);
  });

  it('returns empty for invalid payload', () => {
    expect(parseYoutubeSearchSuggestBody('')).toEqual([]);
    expect(parseYoutubeSearchSuggestBody('not json')).toEqual([]);
  });
});
