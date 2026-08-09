/** Fastify 对过长 :param 会匹配失败；邀请令牌含多段 base64，须走 /* 通配再解析。 */

export type BulletinSectionInvitePath =
  | { kind: 'detail'; token: string }
  | { kind: 'pptx'; token: string }
  | { kind: 'verse'; token: string }
  | { kind: 'previewSlide'; token: string; slide: number }
  | { kind: 'unknown'; rest: string };

export function parseBulletinSectionInviteRest(rest: string): BulletinSectionInvitePath {
  const raw = rest.replace(/^\/+/, '');
  if (!raw) return { kind: 'unknown', rest: '' };

  const slash = raw.indexOf('/');
  const token = slash === -1 ? raw : raw.slice(0, slash);
  const tail = slash === -1 ? '' : raw.slice(slash);

  if (!token) return { kind: 'unknown', rest: raw };
  if (tail === '') return { kind: 'detail', token };
  if (tail === '/pptx') return { kind: 'pptx', token };
  if (tail === '/verse') return { kind: 'verse', token };

  const preview = tail.match(/^\/preview\/(\d+)\.png$/);
  if (preview) {
    const slide = Number.parseInt(preview[1]!, 10);
    if (Number.isFinite(slide) && slide >= 1) {
      return { kind: 'previewSlide', token, slide };
    }
  }

  return { kind: 'unknown', rest: raw };
}
