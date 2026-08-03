import { describe, expect, it } from 'vitest';
import { parseWorshipInviteRest } from './worship-invite-path.js';

const longToken =
  'pe.NDU4ZmNiMjEtNmViNS00YjFkLWI3YWYtMTZhMjJiYTY0NWVm.NDVmNTQzODgtMGMyYy00YWEzLWEwOTAtNGRiNmE5MTgyY2Mx.1786225112.E6vyM3wFNpUQi_N-EP_Ij2di0REZx9-JrSLiGLly89M';

describe('parseWorshipInviteRest', () => {
  it('parses detail and nested actions for long dotted tokens', () => {
    expect(parseWorshipInviteRest(longToken)).toEqual({ kind: 'detail', token: longToken });
    expect(parseWorshipInviteRest(`${longToken}/items`)).toEqual({
      kind: 'items',
      token: longToken,
    });
    expect(parseWorshipInviteRest(`${longToken}/items/order`)).toEqual({
      kind: 'order',
      token: longToken,
    });
    expect(parseWorshipInviteRest(`${longToken}/items/item-1`)).toEqual({
      kind: 'item',
      token: longToken,
      itemId: 'item-1',
    });
    expect(parseWorshipInviteRest(`${longToken}/youtube/search`)).toEqual({
      kind: 'youtubeSearch',
      token: longToken,
    });
    expect(parseWorshipInviteRest(`${longToken}/youtube/search/suggest`)).toEqual({
      kind: 'youtubeSuggest',
      token: longToken,
    });
  });

  it('rejects unknown tails', () => {
    expect(parseWorshipInviteRest(`${longToken}/nope`)).toEqual({
      kind: 'unknown',
      rest: `${longToken}/nope`,
    });
  });
});
