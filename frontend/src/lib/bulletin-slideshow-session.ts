import type { BulletinSlidePreviewParams } from '../api/bulletins';

const STORAGE_PREFIX = 'bulletin-slideshow:';
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

export type BulletinSlideShowSession = {
  patch: BulletinSlidePreviewParams;
  initialSlide: number;
  totalSlides: number;
  createdAt: number;
};

function storageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`;
}

/**
 * 必须用 localStorage（同源各窗口共享）。
 * sessionStorage 不跨 noopener/独立浏览上下文；且历史上 open(features 含 noopener)
 * 会返回 null，启动器误删会话后投影页就会「已过期」。
 */
function slideshowStorage(): Storage {
  return localStorage;
}

export function createSlideShowSession(input: {
  patch: BulletinSlidePreviewParams;
  initialSlide: number;
  totalSlides: number;
}): string {
  const sessionId = crypto.randomUUID();
  const session: BulletinSlideShowSession = {
    patch: input.patch,
    initialSlide: input.initialSlide,
    totalSlides: input.totalSlides,
    createdAt: Date.now(),
  };
  slideshowStorage().setItem(storageKey(sessionId), JSON.stringify(session));
  return sessionId;
}

export function readSlideShowSession(sessionId: string): BulletinSlideShowSession | null {
  const raw = slideshowStorage().getItem(storageKey(sessionId));
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as BulletinSlideShowSession;
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      removeSlideShowSession(sessionId);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function removeSlideShowSession(sessionId: string): void {
  slideshowStorage().removeItem(storageKey(sessionId));
}

export function slideShowProjectorUrl(sessionId: string): string {
  return `${window.location.origin}${window.location.pathname}#/bulletin/slideshow/projector?session=${encodeURIComponent(sessionId)}`;
}

export function slideShowPresenterUrl(sessionId: string): string {
  return `${window.location.origin}${window.location.pathname}#/bulletin/slideshow/presenter?session=${encodeURIComponent(sessionId)}`;
}

export function openSlideShowWindows(sessionId: string): {
  projector: Window | null;
  presenter: Window | null;
} {
  const screenInfo = window.screen as Screen & { availLeft?: number; availTop?: number };
  const availLeft = screenInfo.availLeft ?? 0;
  const availTop = screenInfo.availTop ?? 0;

  // 一键投影：只开投影全屏窗。
  // 不要把 noopener/noreferrer 放进 features：浏览器会因此让 open() 恒返回 null，
  // 启动器会误判弹窗被拦并删掉 localStorage 会话，投影页就显示「已过期」。
  const projectorFeatures = [
    'popup=yes',
    `width=${window.screen.availWidth}`,
    `height=${window.screen.availHeight}`,
    `left=${availLeft}`,
    `top=${availTop}`,
  ].join(',');

  const projector = window.open(
    slideShowProjectorUrl(sessionId),
    'bulletin-slideshow-projector',
    projectorFeatures,
  );
  if (projector) {
    try {
      projector.opener = null;
    } catch {
      // ignore
    }
  }
  return { projector, presenter: null };
}

/** 需要演讲者视图时再开（可选） */
export function openSlideShowPresenterWindow(sessionId: string): Window | null {
  const screenInfo = window.screen as Screen & { availLeft?: number; availTop?: number };
  const availLeft = screenInfo.availLeft ?? 0;
  const availTop = screenInfo.availTop ?? 0;
  const features = [
    'popup=yes',
    'width=980',
    'height=760',
    `left=${Math.max(0, availLeft + 40)}`,
    `top=${Math.max(0, availTop + 40)}`,
  ].join(',');
  const win = window.open(slideShowPresenterUrl(sessionId), 'bulletin-slideshow-presenter', features);
  if (win) {
    try {
      win.opener = null;
    } catch {
      // ignore
    }
  }
  return win;
}
