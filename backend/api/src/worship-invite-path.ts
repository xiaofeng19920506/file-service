/** Fastify/find-my-way 对过长 :param（约 >100 字符）会匹配失败；邀请令牌含多段 base64，须走 /* 通配再解析。 */

export type WorshipInvitePath =
  | { kind: 'detail'; token: string }
  | { kind: 'items'; token: string }
  | { kind: 'order'; token: string }
  | { kind: 'item'; token: string; itemId: string }
  | { kind: 'youtubeSearch'; token: string }
  | { kind: 'youtubeSuggest'; token: string }
  | { kind: 'unknown'; rest: string };

export function parseWorshipInviteRest(rest: string): WorshipInvitePath {
  const raw = rest.replace(/^\/+/, '');
  if (!raw) return { kind: 'unknown', rest: '' };

  const slash = raw.indexOf('/');
  const token = slash === -1 ? raw : raw.slice(0, slash);
  const tail = slash === -1 ? '' : raw.slice(slash);

  if (!token) return { kind: 'unknown', rest: raw };

  if (tail === '') return { kind: 'detail', token };
  if (tail === '/items') return { kind: 'items', token };
  if (tail === '/items/order') return { kind: 'order', token };
  if (tail === '/youtube/search') return { kind: 'youtubeSearch', token };
  if (tail === '/youtube/search/suggest') return { kind: 'youtubeSuggest', token };

  const itemPrefix = '/items/';
  if (tail.startsWith(itemPrefix)) {
    const itemId = tail.slice(itemPrefix.length);
    if (itemId && !itemId.includes('/')) {
      return { kind: 'item', token, itemId };
    }
  }

  return { kind: 'unknown', rest: raw };
}
