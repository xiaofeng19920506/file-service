type OrientationWithLock = ScreenOrientation & {
  lock?: (orientation: 'landscape' | 'portrait' | 'natural') => Promise<void>;
};

export async function lockLandscapeOrientation(): Promise<() => void> {
  const orientation = screen.orientation as OrientationWithLock | undefined;
  if (!orientation?.lock) {
    return () => {};
  }

  try {
    await orientation.lock('landscape');
  } catch {
    return () => {};
  }

  return () => {
    try {
      orientation.unlock();
    } catch {
      /* ignore */
    }
  };
}
