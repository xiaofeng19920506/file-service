import type { CSSProperties } from 'react';
import { useI18n } from '../../i18n';
import {
  slideDisplayImageUrl,
  slideIdentity,
  type EditableSlide,
} from '../../lib/pptx-preview';
import BulletinCompositeSlide from '../bulletin/BulletinCompositeSlide';

export function SlideContent({
  slide,
  canEditText,
  onUpdate,
}: {
  slide: EditableSlide;
  canEditText: boolean;
  onUpdate: (patch: Partial<Pick<EditableSlide, 'title' | 'snippet'>>) => void;
}) {
  const { t } = useI18n();
  const bodyLines =
    slide.textLines.length > 1
      ? slide.textLines.slice(1)
      : slide.snippet
        ? slide.snippet.split('\n').filter(Boolean)
        : [];

  if (canEditText && (slide.editable || slide.isNew)) {
    return (
      <div className="preview-slide-text">
        <input
          className="preview-input preview-input-title"
          value={slide.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder={t('slides.titlePlaceholder')}
        />
        <textarea
          className="preview-input preview-input-body"
          value={slide.snippet}
          onChange={(e) => onUpdate({ snippet: e.target.value })}
          placeholder={t('slides.bodyPlaceholder')}
          rows={Math.min(6, Math.max(2, bodyLines.length || 2))}
        />
      </div>
    );
  }

  if (slide.textLines.length === 0 && !slide.snippet) return null;

  return (
    <div className="preview-slide-text preview-slide-text-readonly">
      {slide.textLines.length > 0 ? (
        slide.textLines.map((line, i) => (
          <p key={i} className={i === 0 ? 'preview-line-title' : 'preview-line-body'}>
            {line}
          </p>
        ))
      ) : (
        <>
          {slide.title && <p className="preview-line-title">{slide.title}</p>}
          {bodyLines.map((line, i) => (
            <p key={i} className="preview-line-body">
              {line}
            </p>
          ))}
        </>
      )}
    </div>
  );
}

export function SlideDragHandle() {
  return (
    <svg className="preview-slide-handle-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="5" cy="4" r="1.25" />
      <circle cx="11" cy="4" r="1.25" />
      <circle cx="5" cy="8" r="1.25" />
      <circle cx="11" cy="8" r="1.25" />
      <circle cx="5" cy="12" r="1.25" />
      <circle cx="11" cy="12" r="1.25" />
    </svg>
  );
}

export function SlideImages({
  slide,
  canEditImages,
  onReplace,
  onCrop,
  overlayTools = false,
}: {
  slide: EditableSlide;
  canEditImages: boolean;
  onReplace: (imageIndex: number, file: File) => void;
  onCrop: (imageIndex: number, url: string) => void;
  overlayTools?: boolean;
}) {
  const { t } = useI18n();
  if (!slide.imageMediaPaths.length) return null;

  return (
    <div className={`preview-slide-images${slide.imageMediaPaths.length > 1 ? ' multi' : ''}`}>
      {slide.imageMediaPaths.map((mediaPath, imgIdx) => {
        const url = slideDisplayImageUrl(slide, imgIdx);
        if (!url) return null;
        return (
          <div key={mediaPath} className="preview-slide-image-wrap">
            <img className="preview-slide-img" src={url} alt={`${slide.title} - ${imgIdx + 1}`} />
            {canEditImages && (
              <div className={`slide-image-tools${overlayTools ? ' slide-image-tools-overlay' : ''}`}>
                <label className="slide-tool-btn">
                  {t('preview.replace')}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onReplace(imgIdx, f);
                      e.target.value = '';
                    }}
                  />
                </label>
                <button type="button" className="slide-tool-btn" onClick={() => onCrop(imgIdx, url)}>
                  {t('preview.crop')}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PptSlidesPane({
  slides,
  focusIndex,
  batchMode,
  selectedIds,
  dragIndex,
  dragOverIndex,
  onSelect,
  onToggleSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  slides: EditableSlide[];
  focusIndex: number;
  batchMode: boolean;
  selectedIds: Set<string>;
  dragIndex: number | null;
  dragOverIndex: number | null;
  onSelect: (index: number) => void;
  onToggleSelect: (index: number) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
}) {
  const { t } = useI18n();
  return (
    <aside className="ppt-slides-pane" aria-label={t('ppt.slidesPane')}>
      {slides.map((slide, i) => {
        const thumb = slide.imageMediaPaths.length > 0 ? slideDisplayImageUrl(slide, 0) : null;
        const id = slideIdentity(slide);
        const batchSelected = selectedIds.has(id);
        const isDragging = dragIndex === i;
        const isDragOver = dragOverIndex === i && dragIndex !== i;

        return (
          <div
            key={id}
            className={`ppt-slide-thumb${focusIndex === i && !batchMode ? ' active' : ''}${batchSelected ? ' batch-selected' : ''}${isDragging ? ' dragging' : ''}${isDragOver ? ' drag-over' : ''}`}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              onDragOver(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(i);
            }}
          >
            {batchMode ? (
              <label className="ppt-slide-batch-check">
                <input
                  type="checkbox"
                  checked={batchSelected}
                  onChange={() => onToggleSelect(i)}
                />
              </label>
            ) : (
              <span
                className="ppt-slide-drag-handle"
                title={t('ppt.dragToReorder')}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  onDragStart(i);
                }}
                onDragEnd={onDragEnd}
              >
                <SlideDragHandle />
              </span>
            )}
            <button
              type="button"
              className="ppt-slide-thumb-body"
              onClick={() => (batchMode ? onToggleSelect(i) : onSelect(i))}
              title={t('preview.slideNumber', { n: slide.index })}
            >
              {thumb ? (
                <img className="ppt-slide-thumb-img" src={thumb} alt="" draggable={false} />
              ) : (
                <span className="ppt-slide-thumb-placeholder">{slide.index}</span>
              )}
              <span className="ppt-slide-thumb-num">{slide.index}</span>
            </button>
          </div>
        );
      })}
      {dragIndex !== null && (
        <p className="ppt-drag-hint" aria-live="polite">
          {t('ppt.dropToReorder')}
        </p>
      )}
    </aside>
  );
}

/** Google Slides / PPT style canvas: prefer faithful layer render from PPTX. */
export function PptCanvasSlide({
  slide,
  zoom = 100,
  pptxBlob = null,
  editable = false,
  onShapeTextChange,
}: {
  slide: EditableSlide;
  zoom?: number;
  pptxBlob?: Blob | null;
  editable?: boolean;
  onShapeTextChange?: (shapeIndex: number, text: string) => void;
}) {
  const { t } = useI18n();
  const scale = Math.max(0.5, Math.min(1.5, zoom / 100));
  const hasImages = slide.imageMediaPaths.length > 0;
  const bodyLines =
    slide.textLines.length > 1
      ? slide.textLines.slice(1)
      : slide.snippet
        ? slide.snippet.split('\n').filter(Boolean)
        : [];
  const useComposite = Boolean(pptxBlob && slide.slidePath && !slide.isNew && !slide.pending);
  const bgOverrideStyle: CSSProperties | undefined =
    slide.backgroundKind === 'solid' && slide.backgroundColor
      ? { backgroundColor: `#${slide.backgroundColor}` }
      : slide.backgroundReplacement && slide.backgroundPreviewUrl
        ? {
            backgroundImage: `url(${slide.backgroundPreviewUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }
        : undefined;
  const bgStyle: CSSProperties | undefined = !useComposite
    ? slide.backgroundKind === 'solid' && slide.backgroundColor
      ? { backgroundColor: `#${slide.backgroundColor}` }
      : slide.backgroundPreviewUrl
        ? {
            backgroundImage: `url(${slide.backgroundPreviewUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }
        : undefined
    : undefined;

  if (useComposite) {
    return (
      <div className="ppt-canvas-slide">
        <div
          className={`ppt-slide-frame ppt-slide-frame--composite${slide.pending ? ' pending' : ''}${slide.isNew ? ' is-new' : ''}`}
          style={{ transform: `scale(${scale})` }}
          aria-label={t('preview.slideNumber', { n: slide.index })}
        >
          <BulletinCompositeSlide
            slide={slide}
            pptxBlob={pptxBlob}
            emptyLabel={t('preview.slideNumber', { n: slide.slideInFile })}
            large
            editable={editable}
            shapeTextOverrides={slide.shapeTextOverrides}
            onShapeTextChange={onShapeTextChange}
          />
          {bgOverrideStyle ? (
            <div className="ppt-slide-bg-override" style={bgOverrideStyle} aria-hidden />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="ppt-canvas-slide">
      <div
        className={`ppt-slide-frame${slide.pending ? ' pending' : ''}${slide.isNew ? ' is-new' : ''}`}
        style={{ transform: `scale(${scale})`, ...(bgStyle || {}) }}
        aria-label={t('preview.slideNumber', { n: slide.index })}
      >
        {hasImages ? (
          <div
            className={`ppt-slide-frame-images${slide.imageMediaPaths.length > 1 ? ' multi' : ''}`}
          >
            {slide.imageMediaPaths.map((mediaPath, imgIdx) => {
              const url = slideDisplayImageUrl(slide, imgIdx);
              if (!url) return null;
              return (
                <img
                  key={mediaPath}
                  className="ppt-slide-frame-img"
                  src={url}
                  alt=""
                  draggable={false}
                />
              );
            })}
          </div>
        ) : null}
        {slide.textLines.length > 0 || slide.snippet ? (
          <div className={`ppt-slide-frame-text${hasImages ? ' ppt-slide-frame-text--overlay' : ''}`}>
            {slide.textLines.length > 0 ? (
              slide.textLines.map((line, i) => (
                <p key={i} className={i === 0 ? 'preview-line-title' : 'preview-line-body'}>
                  {line}
                </p>
              ))
            ) : (
              <>
                {slide.title && <p className="preview-line-title">{slide.title}</p>}
                {bodyLines.map((line, i) => (
                  <p key={i} className="preview-line-body">
                    {line}
                  </p>
                ))}
              </>
            )}
          </div>
        ) : !hasImages ? (
          <p className="ppt-slide-frame-empty">
            {slide.pending
              ? t('preview.converting')
              : t('preview.slideNumber', { n: slide.slideInFile })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
