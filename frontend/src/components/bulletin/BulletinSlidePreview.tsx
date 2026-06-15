import type { EditableSlide } from '../../lib/pptx-preview';

type BulletinSlidePreviewProps = {
  slide: EditableSlide | null;
  loading?: boolean;
  emptyLabel: string;
  slideLabel?: string;
  /** 封面页：在幻灯片图上叠加动态日期/时间 */
  coverOverlay?: { date: string; time: string };
  /** 右侧大预览区 */
  large?: boolean;
};

function slideImageUrl(slide: EditableSlide): string | null {
  if (slide.imageUrls.length > 0) return slide.imageUrls[0] ?? null;
  const path = slide.imageMediaPaths[0];
  if (path && slide.imagePreviewUrls?.[path]) return slide.imagePreviewUrls[path]!;
  return null;
}

export default function BulletinSlidePreview({
  slide,
  loading,
  emptyLabel,
  slideLabel,
  coverOverlay,
  large,
}: BulletinSlidePreviewProps) {
  const rootClass = `bulletin-slide-preview${large ? ' bulletin-slide-preview--large' : ''}`;

  if (loading) {
    return (
      <div className={`${rootClass} bulletin-slide-preview--loading`}>
        <div className="preview-spinner" />
      </div>
    );
  }

  if (!slide) {
    return (
      <div className={`${rootClass} bulletin-slide-preview--empty`}>
        <p>{emptyLabel}</p>
      </div>
    );
  }

  const thumb = slideImageUrl(slide);
  const textPreview =
    slide.title || slide.snippet?.split('\n')[0] || slide.textLines[0] || '';

  return (
    <figure className={rootClass}>
      {slideLabel && <figcaption className="bulletin-slide-preview-caption">{slideLabel}</figcaption>}
      <div className="bulletin-slide-preview-frame">
        {thumb ? (
          <>
            <img className="bulletin-slide-preview-img" src={thumb} alt="" />
            {coverOverlay && (
              <div className="bulletin-cover-overlay" aria-hidden>
                <p className="bulletin-cover-overlay-date">{coverOverlay.date}</p>
                <p className="bulletin-cover-overlay-time">{coverOverlay.time}</p>
              </div>
            )}
          </>
        ) : (
          <div className="bulletin-slide-preview-fallback">
            {slide.title && <p className="bulletin-slide-preview-title">{slide.title}</p>}
            {slide.textLines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
            {!slide.title && !slide.textLines.length && textPreview && <p>{textPreview}</p>}
          </div>
        )}
      </div>
    </figure>
  );
}
