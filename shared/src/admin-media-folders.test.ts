import { describe, expect, it } from 'vitest';
import { seriesFolderFromTitle } from './admin-media-folders.js';

describe('seriesFolderFromTitle', () => {
  it('uses explicit series name', () => {
    expect(seriesFolderFromTitle('甜宠短剧', '忽略标题 第1集', 'id')).toBe('甜宠短剧');
  });

  it('strips episode markers from youtube title', () => {
    expect(seriesFolderFromTitle(undefined, '山河令 第12集 高清', 'id')).toBe('山河令');
  });

  it('shortens hashtag-heavy short-drama titles to a filesystem-safe folder', () => {
    const title =
      '【完整版】婆婆在婚禮前夕穿上我的白紗，男友當眾護她。我當場退婚，後來他全家身敗名裂，我領養女兒活得比誰都好。#短劇 #大女主 #退婚 #逆襲 #爽劇 #爽文 #推薦 #反转 #shortstory';
    const folder = seriesFolderFromTitle(undefined, title, 'id');
    expect(Buffer.from(folder, 'utf8').length).toBeLessThanOrEqual(72);
    expect(folder.includes('#')).toBe(false);
    expect(folder.startsWith('婆婆')).toBe(true);
  });
});
