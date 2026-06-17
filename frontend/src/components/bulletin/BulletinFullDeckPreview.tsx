import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { fetchBulletinTemplateMap, type WeeklyBulletin } from '../../api/bulletins';
import type { PlaylistItem } from '../../api/playlists';
import { useI18n } from '../../i18n';
import { nextSundayIso } from '../../lib/bulletin-date';
import { BULLETIN_WORSHIP_SLIDES } from '../../lib/bulletin-template-steps';
import BulletinPptSlidePreview from './BulletinPptSlidePreview';
import BulletinWorshipEmbeddedPlayer, {
  hasBulletinWorshipPlayItems,
} from './BulletinWorshipEmbeddedPlayer';

const FALLBACK_TOTAL_SLIDES = 38;
const EAGER_SLIDE_COUNT = 3;

export type BulletinPreviewScrollRequest = {
  slide: number;
  id: number;
};

type LazySlideItemProps = {
  slideNumber: number;
  patch: {
    serviceDate: string;
    serviceTime: string;
    scriptureBook?: string;
    scriptureReference?: string;
  };
  highlight: boolean;
  label: string;
  emptyLabel: string;
  scrollRoot: RefObject<HTMLElement | null>;
  eager?: boolean;
  bulletinId: string;
  worshipPlaylistId: string | null;
  worshipPlaylistTitle: string;
  worshipItems: PlaylistItem[];
};

function LazySlideItem({
  slideNumber,
  patch,
  highlight,
  label,
  emptyLabel,
  scrollRoot,
  eager,
  bulletinId,
  worshipPlaylistId,
  worshipPlaylistTitle,
  worshipItems,
}: LazySlideItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(Boolean(eager));

  useEffect(() => {
    if (eager) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const root = scrollRoot.current;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { root, rootMargin: '240px 0px', threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eager, scrollRoot]);

  const showWorshipPlayer =
    slideNumber === BULLETIN_WORSHIP_SLIDES[0] &&
    worshipPlaylistId &&
    hasBulletinWorshipPlayItems(worshipItems);

  return (
    <div
      ref={ref}
      className={`bulletin-deck-slide${highlight ? ' bulletin-deck-slide--highlight' : ''}${showWorshipPlayer ? ' bulletin-deck-slide--worship' : ''}`}
      data-slide={slideNumber}
    >
      {visible ? (
        showWorshipPlayer ? (
          <BulletinWorshipEmbeddedPlayer
            bulletinId={bulletinId}
            playlistId={worshipPlaylistId!}
            playlistTitle={worshipPlaylistTitle}
            items={worshipItems}
            slideNumber={slideNumber}
            patch={patch}
            slideLabel={label}
            emptyLabel={emptyLabel}
          />
        ) : (
          <BulletinPptSlidePreview
            slideNumber={slideNumber}
            patch={patch}
            requireDate={false}
            emptyLabel={emptyLabel}
            slideLabel={label}
          />
        )
      ) : (
        <figure className="bulletin-slide-preview">
          <figcaption className="bulletin-slide-preview-caption">{label}</figcaption>
          <div className="bulletin-slide-preview bulletin-slide-preview--loading">
            <div className="preview-spinner" />
          </div>
        </figure>
      )}
    </div>
  );
}

function scrollSlideIntoDeck(
  root: HTMLElement,
  slideNumber: number,
  behavior: ScrollBehavior = 'smooth',
): void {
  const el = root.querySelector<HTMLElement>(`[data-slide="${slideNumber}"]`);
  if (!el) return;
  const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
  root.scrollTo({ top: Math.max(0, top - 6), behavior });
}

type BulletinFullDeckPreviewProps = {
  bulletin: WeeklyBulletin;
  highlightSlides?: number[];
  scrollRequest?: BulletinPreviewScrollRequest | null;
  worshipItems?: PlaylistItem[];
  worshipPlaylistTitle?: string;
};

export default function BulletinFullDeckPreview({
  bulletin,
  highlightSlides = [],
  scrollRequest = null,
  worshipItems = [],
  worshipPlaylistTitle = '',
}: BulletinFullDeckPreviewProps) {
  const { t } = useI18n();
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const [totalSlides, setTotalSlides] = useState(FALLBACK_TOTAL_SLIDES);
  const [forcedVisibleSlides, setForcedVisibleSlides] = useState<Set<number>>(() => new Set());
  const highlightSet = useMemo(() => new Set(highlightSlides), [highlightSlides]);

  const patch = useMemo(
    () => ({
      serviceDate: bulletin.serviceDate || nextSundayIso(),
      serviceTime: bulletin.serviceTime || '11:00',
      scriptureBook: bulletin.scriptureBook,
      scriptureReference: bulletin.scriptureReference,
    }),
    [
      bulletin.serviceDate,
      bulletin.serviceTime,
      bulletin.scriptureBook,
      bulletin.scriptureReference,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchBulletinTemplateMap()
      .then((map) => {
        if (!cancelled && map.totalSlides > 0) setTotalSlides(map.totalSlides);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!scrollRequest) return;
    const slide = scrollRequest.slide;
    if (slide < 1) return;

    setForcedVisibleSlides((prev) => {
      if (prev.has(slide)) return prev;
      const next = new Set(prev);
      next.add(slide);
      return next;
    });

    const root = scrollRootRef.current;
    if (!root) return;

    const runScroll = () => scrollSlideIntoDeck(root, slide);
    const raf = window.requestAnimationFrame(() => {
      runScroll();
      window.requestAnimationFrame(runScroll);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [scrollRequest?.id, scrollRequest?.slide]);

  const slides = useMemo(
    () => Array.from({ length: totalSlides }, (_, i) => i + 1),
    [totalSlides],
  );

  return (
    <div ref={scrollRootRef} className="bulletin-deck-preview">
      <p className="bulletin-deck-preview-meta">
        {t('bulletin.previewDeckMeta', { count: totalSlides })}
        {highlightSlides.length > 0 ? ` · ${t('bulletin.previewDeckHighlightNote')}` : ''}
      </p>
      {slides.map((page) => (
        <LazySlideItem
          key={page}
          slideNumber={page}
          patch={patch}
          highlight={highlightSet.has(page)}
          label={t('bulletin.previewSlideSingle', { page })}
          emptyLabel={t('bulletin.coverPreviewEmpty')}
          scrollRoot={scrollRootRef}
          eager={
            page <= EAGER_SLIDE_COUNT || highlightSet.has(page) || forcedVisibleSlides.has(page)
          }
          bulletinId={bulletin.id}
          worshipPlaylistId={bulletin.servicePlaylistId}
          worshipPlaylistTitle={worshipPlaylistTitle}
          worshipItems={worshipItems}
        />
      ))}
    </div>
  );
}
