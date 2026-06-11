import { useEffect, useMemo, useState } from 'react';
import { fetchBlobPreviewPptx } from '../api/client';
import PreviewConversionGuide from '../components/PreviewConversionGuide';
import { friendlyError } from '../lib/error-messages';
import { parsePptxSlidesDetailed, type EditableSlide } from '../lib/pptx-preview';
import { useI18n } from '../i18n';

type BlobPreviewPageProps = {
  blobId: string;
};

function slideDisplayImageUrl(slide: EditableSlide, imageIndex: number): string | null {
  const mediaPath = slide.imageMediaPaths[imageIndex];
  if (!mediaPath) return null;
  return slide.imagePreviewUrls?.[mediaPath] ?? slide.imageUrls[imageIndex] ?? null;
}

export default function BlobPreviewPage({ blobId }: BlobPreviewPageProps) {
  const { t } = useI18n();
  const title = useMemo(() => {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    const params = qIndex === -1 ? new URLSearchParams() : new URLSearchParams(hash.slice(qIndex + 1));
    return params.get('title')?.trim() || blobId;
  }, [blobId]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [slides, setSlides] = useState<EditableSlide[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);

  useEffect(() => {
    document.title = `${title} — ${t('library.preview')}`;
  }, [title, t]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreviewFailed(false);
    setSlides([]);
    setFocusIndex(0);

    void (async () => {
      try {
        const pptx = await fetchBlobPreviewPptx(blobId);
        if (cancelled) return;
        const parsed = await parsePptxSlidesDetailed(pptx, { sourceFile: title });
        if (cancelled) return;
        setSlides(parsed);
      } catch (e) {
        if (cancelled) return;
        const code = e instanceof Error ? e.message : 'fetch_preview_failed';
        if (code === 'preview_conversion_failed') {
          setPreviewFailed(true);
        } else {
          setError(friendlyError(code, t));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blobId, title, t]);

  const focusSlide = slides[focusIndex];

  return (
    <div className="blob-preview-page">
      <header className="blob-preview-header">
        <div className="blob-preview-header-main">
          <h1>{title}</h1>
          <p className="blob-preview-subtitle">{t('library.previewPageSubtitle')}</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => window.close()}>
          {t('library.closePreviewTab')}
        </button>
      </header>

      <main className="blob-preview-body">
        {loading && (
          <div className="preview-empty">
            <div className="preview-spinner" />
            <p>{t('preview.converting')}</p>
          </div>
        )}

        {!loading && error && <p className="error-msg">{error}</p>}

        {!loading && previewFailed && <PreviewConversionGuide fileName={title} />}

        {!loading && !error && !previewFailed && slides.length === 0 && (
          <div className="preview-empty">
            <p>{t('preview.emptyFile')}</p>
          </div>
        )}

        {!loading && !error && !previewFailed && slides.length > 0 && (
          <div className="blob-preview-layout">
            <div className="slide-grid">
              {slides.map((slide, i) => {
                const thumb =
                  slide.imageMediaPaths.length > 0 ? slideDisplayImageUrl(slide, 0) : null;
                const previewText =
                  slide.title || slide.snippet?.split('\n')[0] || slide.textLines[0] || '';

                return (
                  <button
                    key={`${slide.slidePath}-${i}`}
                    type="button"
                    className={`slide-grid-item${focusIndex === i ? ' active' : ''}`}
                    onClick={() => setFocusIndex(i)}
                    title={previewText || t('preview.slideNumber', { n: slide.index })}
                  >
                    {thumb ? (
                      <img className="slide-grid-thumb" src={thumb} alt="" />
                    ) : (
                      <div className="slide-grid-text-preview">
                        <span className="slide-grid-text-line">
                          {previewText || `#${slide.index}`}
                        </span>
                      </div>
                    )}
                    <span className="slide-grid-num">{slide.index}</span>
                  </button>
                );
              })}
            </div>

            {focusSlide && (
              <section className="blob-preview-single">
                <div className="single-slide-nav">
                  <button
                    type="button"
                    className="single-slide-nav-btn"
                    disabled={focusIndex <= 0}
                    onClick={() => setFocusIndex((i) => Math.max(0, i - 1))}
                    aria-label={t('preview.prevSlide')}
                  >
                    ‹
                  </button>
                  <span className="single-slide-counter">
                    {t('preview.slideCounter', {
                      current: focusIndex + 1,
                      total: slides.length,
                    })}
                  </span>
                  <button
                    type="button"
                    className="single-slide-nav-btn"
                    disabled={focusIndex >= slides.length - 1}
                    onClick={() => setFocusIndex((i) => Math.min(slides.length - 1, i + 1))}
                    aria-label={t('preview.nextSlide')}
                  >
                    ›
                  </button>
                </div>

                <div className="preview-slide-card single-slide-card">
                  {focusSlide.imageUrls.length > 0 ? (
                    <div className="preview-slide-images">
                      {focusSlide.imageUrls.map((url, ii) => (
                        <img key={ii} className="preview-slide-img" src={url} alt="" />
                      ))}
                    </div>
                  ) : (
                    <p className="preview-slide-fallback">
                      {t('preview.slideNumber', { n: focusSlide.index })}
                    </p>
                  )}
                  {(focusSlide.title || focusSlide.textLines.length > 0) && (
                    <div className="preview-slide-text preview-slide-text-readonly">
                      {focusSlide.title && <p className="preview-line-title">{focusSlide.title}</p>}
                      {focusSlide.textLines.map((line, li) => (
                        <p key={li} className="preview-line-body">
                          {line}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
