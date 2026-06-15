import type { EditableSlide } from '../../lib/pptx-preview';

type BulletinSlidePreviewProps = {
  slide: EditableSlide | null;
  loading?: boolean;
  emptyLabel: string;
  slideLabel?: string;
  /** 本步写入 PPT 的文字（仅展示，不叠加在背景图上） */
  editedTextLabel?: string;
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
  editedTextLabel,
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
  const editedLines = slide.textLines.filter((line) => line.trim());

  return (
    <figure className={rootClass}>
      {slideLabel && <figcaption className="bulletin-slide-preview-caption">{slideLabel}</figcaption>}
      <div className="bulletin-slide-preview-frame">
        {thumb ? (
          <img className="bulletin-slide-preview-img" src={thumb} alt="" />
        ) : (
          <div className="bulletin-slide-preview-fallback">
            {editedLines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
            {!editedLines.length && slide.title && <p>{slide.title}</p>}
          </div>
        )}
      </div>
      {thumb && editedLines.length > 0 && (
        <div className="bulletin-slide-preview-edits">
          {editedTextLabel && <p className="bulletin-slide-preview-edits-label">{editedTextLabel}</p>}
          <ul className="bulletin-slide-preview-edits-list">
            {editedLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
