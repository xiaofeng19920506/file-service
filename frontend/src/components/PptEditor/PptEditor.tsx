import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { useMergedPptEditor } from '../../hooks/useMergedPptEditor';
import ConfirmModal from '../ConfirmModal';
import ImageCropModal from '../ImageCropModal';
import { PptCanvasSlide, PptSlidesPane } from './SlideViews';
import {
  normalizeShapeTextOverride,
  type ShapeTextStyle,
} from '../../lib/pptx-shape-text';

const FONT_OPTIONS = [
  '微软雅黑',
  '黑体',
  '宋体',
  '楷体',
  'Arial',
  'Calibri',
  'Times New Roman',
  'Georgia',
];

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 72];

type PptEditorProps = {
  mergedUrl: string | null;
  jobId?: string | null;
  onSaveFile?: (file: File) => Promise<void>;
  title: string;
  onSaved?: () => void;
  onDownload?: () => void;
  canDownload?: boolean;
  downloading?: boolean;
  onClose?: () => void;
};

export default function PptEditor({
  mergedUrl,
  jobId = null,
  onSaveFile,
  title,
  onSaved,
  onDownload,
  canDownload = false,
  downloading = false,
  onClose,
}: PptEditorProps) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(100);
  const [selectedShapeIndex, setSelectedShapeIndex] = useState<number | null>(null);
  const [selectedSeed, setSelectedSeed] = useState<ShapeTextStyle | null>(null);
  const [pageJump, setPageJump] = useState('');
  const imageReplaceInputRef = useRef<HTMLInputElement>(null);
  const imageInsertInputRef = useRef<HTMLInputElement>(null);
  const backgroundReplaceInputRef = useRef<HTMLInputElement>(null);
  const editor = useMergedPptEditor({ mergedUrl, jobId, onSaveFile, onSaved });
  const {
    slides,
    loading,
    saving,
    saveError,
    dirty,
    focusIndex,
    setFocusIndex,
    batchMode,
    selectedSlideIds,
    cropTarget,
    setCropTarget,
    skipConfirm,
    setSkipConfirm,
    pptDragIndex,
    setPptDragIndex,
    pptDragOverIndex,
    setPptDragOverIndex,
    canUndo,
    canRedo,
    canSkip,
    canDuplicate,
    canMoveUp,
    canMoveDown,
    canEditCanvas,
    canEditImages,
    canEditBackground,
    firstImageUrl,
    undo,
    redo,
    reorderSlideAt,
    addSlideAfter,
    requestSkipSlide,
    performSkipSlide,
    requestBatchSkip,
    performBatchSkip,
    toggleSlideSelect,
    setSlideImageReplacement,
    setSlideBackgroundImage,
    setSlideBackgroundColor,
    setShapeTextOverride,
    patchShapeTextStyle,
    insertTextBox,
    insertPicture,
    openCrop,
    discardChanges,
    saveChanges,
    currentSlide,
    sourceFile,
  } = editor;

  useEffect(() => {
    setSelectedShapeIndex(null);
    setSelectedSeed(null);
    setPageJump(String(focusIndex + 1));
  }, [focusIndex]);

  const selectedTextStyle: ShapeTextStyle | null = useMemo(() => {
    if (selectedShapeIndex == null || !currentSlide) return null;
    const override = currentSlide.shapeTextOverrides?.[selectedShapeIndex];
    const fromSeed =
      selectedSeed ??
      ({
        text: '',
        fontFamily: '微软雅黑',
        fontSizePt: 18,
        bold: false,
        italic: false,
      } satisfies ShapeTextStyle);
    if (override == null) return fromSeed;
    const n = normalizeShapeTextOverride(override, fromSeed.text);
    return {
      text: n.text,
      fontFamily: n.fontFamily ?? fromSeed.fontFamily,
      fontSizePt: n.fontSizePt ?? fromSeed.fontSizePt,
      bold: n.bold ?? fromSeed.bold,
      italic: n.italic ?? fromSeed.italic,
    };
  }, [currentSlide, selectedSeed, selectedShapeIndex]);

  const fontOptions = useMemo(() => {
    const face = selectedTextStyle?.fontFamily?.trim();
    if (face && !FONT_OPTIONS.includes(face)) return [face, ...FONT_OPTIONS];
    return FONT_OPTIONS;
  }, [selectedTextStyle?.fontFamily]);

  const fontSizeOptions = useMemo(() => {
    const n = selectedTextStyle?.fontSizePt;
    if (n != null && Number.isFinite(n) && !FONT_SIZES.includes(n)) {
      return [...FONT_SIZES, Math.round(n * 10) / 10].sort((a, b) => a - b);
    }
    return FONT_SIZES;
  }, [selectedTextStyle?.fontSizePt]);

  const applySelectedStyle = (patch: Partial<ShapeTextStyle>) => {
    if (selectedShapeIndex == null) return;
    patchShapeTextStyle(
      focusIndex,
      selectedShapeIndex,
      patch,
      selectedTextStyle?.text || selectedSeed?.text || '',
    );
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        setFocusIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        setFocusIndex((i) => Math.min(slides.length - 1, i + 1));
        return;
      }

      if (!batchMode && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        requestSkipSlide(focusIndex);
        return;
      }
      if (batchMode && selectedSlideIds.size > 0 && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        requestBatchSkip();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    batchMode,
    focusIndex,
    redo,
    requestBatchSkip,
    requestSkipSlide,
    selectedSlideIds.size,
    setFocusIndex,
    slides.length,
    undo,
  ]);

  const endDrag = () => {
    setPptDragIndex(null);
    setPptDragOverIndex(null);
  };

  const bgColorValue =
    currentSlide?.backgroundKind === 'solid' && currentSlide.backgroundColor
      ? `#${currentSlide.backgroundColor}`
      : '#ffffff';

  return (
    <>
      <div className="ppt-editor">
        <header className="ppt-editor-header">
          <h2 className="ppt-editor-title">{title}</h2>
          <div className="ppt-editor-header-actions">
            {onDownload && (
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={!canDownload || downloading}
                onClick={() => onDownload()}
              >
                {downloading ? t('library.downloading') : t('slides.download')}
              </button>
            )}
            {onClose && (
              <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
                {t('library.closePreviewTab')}
              </button>
            )}
          </div>
        </header>

        <div className="ppt-ribbon" role="toolbar" aria-label={t('ppt.toolbar')}>
          <div className="ppt-ribbon-group">
            <button type="button" className="ppt-ribbon-btn" disabled={!canUndo} onClick={undo}>
              {t('preview.undo')}
            </button>
            <button type="button" className="ppt-ribbon-btn" disabled={!canRedo} onClick={redo}>
              {t('preview.redo')}
            </button>
          </div>
          <div className="ppt-ribbon-sep" aria-hidden />
          <div className="ppt-ribbon-group ppt-ribbon-group--insert">
            <button
              type="button"
              className="ppt-ribbon-btn ppt-ribbon-btn-accent"
              disabled={!canEditCanvas}
              onClick={() => void insertTextBox()}
            >
              {t('ppt.insertText')}
            </button>
            <button
              type="button"
              className="ppt-ribbon-btn ppt-ribbon-btn-accent"
              disabled={!canEditCanvas}
              onClick={() => imageInsertInputRef.current?.click()}
            >
              {t('ppt.insertImage')}
            </button>
          </div>
          <div className="ppt-ribbon-sep" aria-hidden />
          <div className="ppt-ribbon-group ppt-ribbon-group--format">
            <select
              className="ppt-format-select"
              disabled={selectedShapeIndex == null}
              value={selectedTextStyle?.fontFamily ?? '微软雅黑'}
              onChange={(e) => applySelectedStyle({ fontFamily: e.target.value })}
              aria-label={t('ppt.fontFamily')}
            >
              {fontOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select
              className="ppt-format-select ppt-format-select--size"
              disabled={selectedShapeIndex == null}
              value={String(selectedTextStyle?.fontSizePt ?? 18)}
              onChange={(e) => applySelectedStyle({ fontSizePt: Number(e.target.value) })}
              aria-label={t('ppt.fontSize')}
            >
              {fontSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`ppt-ribbon-btn ppt-format-toggle${selectedTextStyle?.bold ? ' active' : ''}`}
              disabled={selectedShapeIndex == null}
              onClick={() => applySelectedStyle({ bold: !selectedTextStyle?.bold })}
              title={t('ppt.bold')}
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              className={`ppt-ribbon-btn ppt-format-toggle${selectedTextStyle?.italic ? ' active' : ''}`}
              disabled={selectedShapeIndex == null}
              onClick={() => applySelectedStyle({ italic: !selectedTextStyle?.italic })}
              title={t('ppt.italic')}
            >
              <em>I</em>
            </button>
          </div>
          <div className="ppt-ribbon-sep" aria-hidden />
          <div className="ppt-ribbon-group">
            <button
              type="button"
              className="ppt-ribbon-btn"
              disabled={!canEditImages}
              onClick={() => imageReplaceInputRef.current?.click()}
            >
              {t('ppt.replaceImage')}
            </button>
            <button
              type="button"
              className="ppt-ribbon-btn"
              disabled={!firstImageUrl}
              onClick={() => firstImageUrl && openCrop(focusIndex, 0, firstImageUrl)}
            >
              {t('ppt.cropImage')}
            </button>
          </div>
          <div className="ppt-ribbon-sep" aria-hidden />
          <div className="ppt-ribbon-group">
            <button
              type="button"
              className="ppt-ribbon-btn"
              disabled={!canEditBackground}
              onClick={() => backgroundReplaceInputRef.current?.click()}
            >
              {t('ppt.replaceBackground')}
            </button>
            <label
              className={`ppt-ribbon-btn ppt-bg-color-btn${!canEditBackground ? ' is-disabled' : ''}`}
              title={t('ppt.backgroundColor')}
            >
              <span>{t('ppt.backgroundColor')}</span>
              <input
                type="color"
                value={bgColorValue}
                disabled={!canEditBackground}
                onChange={(e) => setSlideBackgroundColor(focusIndex, e.target.value)}
              />
            </label>
          </div>
          <div className="ppt-ribbon-sep" aria-hidden />
          <div className="ppt-ribbon-group ppt-ribbon-group--pages">
            <button
              type="button"
              className="ppt-ribbon-btn ppt-ribbon-btn-accent"
              disabled={!canDuplicate}
              onClick={() => addSlideAfter(focusIndex, true)}
            >
              {t('ppt.addSlide')}
            </button>
            <button
              type="button"
              className="ppt-ribbon-btn"
              disabled={!canDuplicate}
              onClick={() => addSlideAfter(focusIndex, false)}
            >
              {t('ppt.duplicateSlide')}
            </button>
            <button
              type="button"
              className="ppt-ribbon-btn"
              disabled={!canSkip}
              onClick={() => requestSkipSlide(focusIndex)}
            >
              {t('ppt.skipSlide')}
            </button>
            <button
              type="button"
              className="ppt-ribbon-btn"
              disabled={!canMoveUp}
              onClick={() => reorderSlideAt(focusIndex, focusIndex - 1)}
            >
              {t('ppt.moveUp')}
            </button>
            <button
              type="button"
              className="ppt-ribbon-btn"
              disabled={!canMoveDown}
              onClick={() => reorderSlideAt(focusIndex, focusIndex + 1)}
            >
              {t('ppt.moveDown')}
            </button>
            <label className="ppt-page-jump" title={t('ppt.gotoPage')}>
              <span>{t('ppt.pageIndex')}</span>
              <input
                type="number"
                min={1}
                max={Math.max(1, slides.length)}
                value={pageJump}
                onChange={(e) => setPageJump(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const n = Number(pageJump);
                  if (!Number.isFinite(n)) return;
                  const idx = Math.min(slides.length, Math.max(1, Math.round(n))) - 1;
                  setFocusIndex(idx);
                }}
              />
              <button
                type="button"
                className="ppt-ribbon-btn"
                onClick={() => {
                  const n = Number(pageJump);
                  if (!Number.isFinite(n)) return;
                  const idx = Math.min(slides.length, Math.max(1, Math.round(n))) - 1;
                  setFocusIndex(idx);
                }}
              >
                {t('ppt.gotoPage')}
              </button>
            </label>
          </div>
          <div className="ppt-ribbon-spacer" />
          <div className="ppt-ribbon-group">
            <label className="ppt-zoom-control">
              {t('slides.zoom')}
              <input
                type="range"
                min={50}
                max={150}
                step={10}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
              <span>{zoom}%</span>
            </label>
          </div>
          <div className="ppt-ribbon-sep" aria-hidden />
          <div className="ppt-ribbon-group">
            <button
              type="button"
              className="ppt-ribbon-btn"
              disabled={!dirty || saving}
              onClick={discardChanges}
            >
              {t('preview.discard')}
            </button>
            <button
              type="button"
              className={`ppt-ribbon-btn ppt-ribbon-btn-primary${dirty ? ' dirty' : ''}`}
              disabled={!dirty || saving}
              onClick={() => void saveChanges()}
            >
              {t('slides.save')}
            </button>
          </div>
        </div>

        <input
          ref={imageInsertInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            void insertPicture(file);
          }}
        />
        <input
          ref={imageReplaceInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file || !currentSlide?.imageMediaPaths[0]) return;
            void setSlideImageReplacement(focusIndex, 0, file);
          }}
        />
        <input
          ref={backgroundReplaceInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            void setSlideBackgroundImage(focusIndex, file);
          }}
        />

        <div className="ppt-workspace">
          <PptSlidesPane
            slides={slides}
            focusIndex={focusIndex}
            batchMode={batchMode}
            selectedIds={selectedSlideIds}
            dragIndex={pptDragIndex}
            dragOverIndex={pptDragOverIndex}
            onSelect={setFocusIndex}
            onToggleSelect={toggleSlideSelect}
            onDragStart={setPptDragIndex}
            onDragOver={setPptDragOverIndex}
            onDrop={(to) => {
              if (pptDragIndex !== null && pptDragIndex !== to) {
                reorderSlideAt(pptDragIndex, to);
              }
              endDrag();
            }}
            onDragEnd={endDrag}
          />
          <main className="ppt-canvas-area">
            {loading && slides.length === 0 && (
              <div className="preview-empty">
                <div className="preview-spinner" />
                <p>{t('preview.converting')}</p>
              </div>
            )}
            {!loading && slides.length === 0 && (
              <div className="preview-empty">
                <p>{t('preview.emptyFile')}</p>
              </div>
            )}
            {!loading && slides.length > 0 && slides[focusIndex] && (
              <PptCanvasSlide
                slide={slides[focusIndex]}
                zoom={zoom}
                pptxBlob={sourceFile}
                editable
                selectedShapeIndex={selectedShapeIndex}
                onSelectShape={(idx, seed) => {
                  setSelectedShapeIndex(idx);
                  setSelectedSeed(seed ?? null);
                }}
                onShapeTextChange={(shapeIndex, style) =>
                  setShapeTextOverride(focusIndex, shapeIndex, style)
                }
              />
            )}
          </main>
        </div>

        <footer className="ppt-statusbar">
          <span>
            {slides.length > 0
              ? t('preview.slideCounter', { current: focusIndex + 1, total: slides.length })
              : '—'}
          </span>
          <span className="ppt-status-hint">{t('ppt.canvasHintFormat')}</span>
          <span className={dirty ? 'ppt-status-unsaved' : undefined}>
            {dirty ? t('files.unsaved') : t('ppt.saved')}
          </span>
        </footer>

        {saveError && <p className="ppt-save-error">{saveError}</p>}
      </div>

      {skipConfirm && (
        <ConfirmModal
          title={t('preview.confirmSkipTitle')}
          message={
            skipConfirm.kind === 'one'
              ? t('preview.confirmSkipSingle', {
                  n: slides[skipConfirm.index]?.index ?? skipConfirm.index + 1,
                })
              : t('preview.confirmSkipBatch', { count: selectedSlideIds.size })
          }
          onCancel={() => setSkipConfirm(null)}
          onConfirm={() => {
            if (skipConfirm.kind === 'one') {
              performSkipSlide(skipConfirm.index);
            } else {
              performBatchSkip();
            }
            setSkipConfirm(null);
          }}
        />
      )}

      {cropTarget && (
        <ImageCropModal
          imageUrl={cropTarget.url}
          onClose={() => setCropTarget(null)}
          onConfirm={(blob) => {
            if (cropTarget.kind === 'background') {
              setSlideBackgroundImage(cropTarget.arrayIndex, blob);
            } else {
              setSlideImageReplacement(cropTarget.arrayIndex, cropTarget.imageIndex, blob);
            }
            setCropTarget(null);
          }}
        />
      )}
    </>
  );
}
