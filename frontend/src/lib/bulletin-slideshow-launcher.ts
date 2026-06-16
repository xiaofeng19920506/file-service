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
}): Promise<{ ok: true } | { ok: false; reason: 'popup_blocked' }> {
  let totalSlides = FALLBACK_TOTAL_SLIDES;
  try {
    const map = await fetchBulletinTemplateMap();
    if (map.totalSlides > 0) totalSlides = map.totalSlides;
  } catch {
    // keep fallback
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
