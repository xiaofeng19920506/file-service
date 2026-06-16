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
  sessionStorage.setItem(storageKey(sessionId), JSON.stringify(session));
  return sessionId;
}

export function readSlideShowSession(sessionId: string): BulletinSlideShowSession | null {
  const raw = sessionStorage.getItem(storageKey(sessionId));
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
  sessionStorage.removeItem(storageKey(sessionId));
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

  const projectorFeatures = [
    'popup=yes',
    'noopener',
    'noreferrer',
    `width=${window.screen.availWidth}`,
    `height=${window.screen.availHeight}`,
    `left=${availLeft}`,
    `top=${availTop}`,
  ].join(',');

  const presenterFeatures = [
    'popup=yes',
    'noopener',
    'noreferrer',
    'width=980',
    'height=760',
    `left=${Math.max(0, availLeft + 40)}`,
    `top=${Math.max(0, availTop + 40)}`,
  ].join(',');

  const projector = window.open(slideShowProjectorUrl(sessionId), 'bulletin-slideshow-projector', projectorFeatures);
  const presenter = window.open(slideShowPresenterUrl(sessionId), 'bulletin-slideshow-presenter', presenterFeatures);
  return { projector, presenter };
}
