import { fetchBulletinTemplateMap, type BulletinSlidePreviewParams } from '../api/bulletins';
import {
  createSlideShowSession,
  openSlideShowWindows,
  removeSlideShowSession,
} from '../lib/bulletin-slideshow-session';

const FALLBACK_TOTAL_SLIDES = 38;

export async function startBulletinSlideShow(opts: {
  patch: BulletinSlidePreviewParams;
  initialSlide?: number;
  /** 当前 deck plan 的实际页数（隐藏分区/读经加页后会变化） */
  totalSlides?: number;
}): Promise<{ ok: true } | { ok: false; reason: 'popup_blocked' }> {
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

  const initialSlide = Math.min(
    totalSlides,
    Math.max(1, opts.initialSlide ?? 1),
  );

  const sessionId = createSlideShowSession({
    patch: opts.patch,
    initialSlide,
    totalSlides,
  });

  const { projector, presenter } = openSlideShowWindows(sessionId);
  if (!projector || !presenter) {
    removeSlideShowSession(sessionId);
    projector?.close();
    presenter?.close();
    return { ok: false, reason: 'popup_blocked' };
  }

  return { ok: true };
}
