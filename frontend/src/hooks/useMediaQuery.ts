import { useEffect, useState } from 'react';

export const MOBILE_MEDIA_QUERY = '(max-width: 900px)';

function readMediaQuery(query: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => readMediaQuery(query));

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}

export function isMobileViewport(): boolean {
  return readMediaQuery(MOBILE_MEDIA_QUERY);
}
