import { fetchBulletinTemplateMap, type BulletinSlidePreviewParams } from '../api/bulletins';
import {
  createSlideShowSession,
  openSlideShowWindows,
  removeSlideShowSession,
} from '../lib/bulletin-slideshow-session';

const FALLBACK_TOTAL_SLIDES = 38;

export async function startBulletinSlideShow(opts: {
  patch: BulletinSlidePreviewParams;
  /** 起始演示页（1-based）；缺省从封面开始 */
  initialSlide?: number;
  /** 当前 deck 的实际总页数（隐藏分区/读经加页后会变化）；必须是整份周报，不是单分区 */
  totalSlides?: number;
  /** 投影时跳过的演示页（隐藏分区） */
  skipSlides?: number[];
}): Promise<
  { ok: true; sessionId: string } | { ok: false; reason: 'popup_blocked' }
> {
  let totalSlides = FALLBACK_TOTAL_SLIDES;
  if (opts.totalSlides && opts.totalSlides > 0) {
    // 优先使用真实 deck 页数，避免放映窗口按模板固定 38 页导航
    totalSlides = opts.totalSlides;
  } else {
    try {
      const map = await fetchBulletinTemplateMap();
      if (map.totalSlides > 0) totalSlides = map.totalSlides;
    } catch {
      // keep fallback
    }
  }

  // 整份周报放映：默认从第 1 页起，可翻到 totalSlides；隐藏页在导航层跳过
  const initialSlide = Math.min(
    totalSlides,
    Math.max(1, opts.initialSlide ?? 1),
  );

  const sessionId = createSlideShowSession({
    patch: opts.patch,
    initialSlide,
    totalSlides,
    skipSlides: opts.skipSlides,
  });

  const { projector } = openSlideShowWindows(sessionId);
  if (!projector) {
    removeSlideShowSession(sessionId);
    return { ok: false, reason: 'popup_blocked' };
  }

  return { ok: true, sessionId };
}
