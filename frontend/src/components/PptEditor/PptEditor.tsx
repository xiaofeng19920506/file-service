import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import type { BulletinSlidePreviewParams } from '../../api/bulletins';
import { useMergedPptEditor } from '../../hooks/useMergedPptEditor';
import { NUDGE_STEP_PCT, useRibbonCommands } from '../../hooks/useRibbonCommands';
import ConfirmModal from '../ConfirmModal';
import ImageCropModal from '../ImageCropModal';
import FindReplacePanel from './FindReplacePanel';
import Ribbon from './Ribbon/Ribbon';
import SelectionPane from './SelectionPane';
import { PptCanvasSlide, PptSlidesPane } from './SlideViews';
import { replaceAllText } from '../../lib/ppt-ops/text';

type PptEditorProps = {
  mergedUrl: string | null;
  jobId?: string | null;
  onSaveFile?: (file: File) => Promise<void>;
  title: string;
  onSaved?: () => void;
  onDownload?: () => void;
  canDownload?: boolean;
  downloading?: boolean;
  /** 丢弃本区已保存覆盖，重新加载模板原版 */
  onResetToTemplate?: () => void;
  /** 用本机 PPTX 整段替换本区 */
  onUploadReplace?: () => void;
  uploadReplacing?: boolean;
  onClose?: () => void;
  /**
   * 锁定幻灯片结构：禁用新建/复制/删除/拖拽重排幻灯片。
   * 周报分区编辑器用它，因为增删/重排页当前不会进入预览与导出。
   */
  lockSlideStructure?: boolean;
  /**
   * 与右侧预览对齐的 LibreOffice PNG：本地 slideIndex → 演示页码。
   * 有值时未改脏的画布用同一套 PNG 保真显示。
   */
  fidelityPresentationSlides?: number[] | null;
  fidelityPatch?: BulletinSlidePreviewParams | null;
  fidelitySectionId?: string;
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
  onResetToTemplate,
  onUploadReplace,
  uploadReplacing = false,
  onClose,
  lockSlideStructure = false,
  fidelityPresentationSlides = null,
  fidelityPatch = null,
  fidelitySectionId,
}: PptEditorProps) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(100);
  const [selectedShapeIndex, setSelectedShapeIndex] = useState<number | null>(null);
  const [textCharRange, setTextCharRange] = useState<{
    elementId: number;
    start: number;
    end: number;
  } | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [showRuler, setShowRuler] = useState(false);
  const [findMode, setFindMode] = useState<'find' | 'replace' | null>(null);
  const [selectionPaneOpen, setSelectionPaneOpen] = useState(false);
  const imageReplaceInputRef = useRef<HTMLInputElement>(null);
  const imageInsertInputRef = useRef<HTMLInputElement>(null);

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
    canEditImages,
    firstImageUrl,
    undo,
    redo,
    reorderSlideAt,
    requestSkipSlide,
    performSkipSlide,
    requestBatchSkip,
    performBatchSkip,
    toggleSlideSelect,
    setSlideImageReplacement,
    setSlideBackgroundImage,
    setShapeTextOverride,
    insertPicture,
    openCrop,
    currentSlide,
    currentSlideXml,
    selectedElementId,
    setSelectedElementId,
    mutateSlideXml,
    sourceFile,
  } = editor;

  const ribbon = useRibbonCommands(editor, {
    zoom,
    setZoom,
    fitToWindow: () => setZoom(100),
    showGrid,
    toggleGrid: () => setShowGrid((v) => !v),
    showGuides,
    toggleGuides: () => setShowGuides((v) => !v),
    showRuler,
    toggleRuler: () => setShowRuler((v) => !v),
    pickImage: () => imageInsertInputRef.current?.click(),
    openFind: () => setFindMode('find'),
    openReplace: () => setFindMode('replace'),
    toggleSelectionPane: () => setSelectionPaneOpen((v) => !v),
    textCharRange,
    lockSlideStructure,
  });

  useEffect(() => {
    setSelectedShapeIndex(null);
    setTextCharRange(null);
  }, [focusIndex]);

  const replaceOnSlide = useCallback(
    (search: string, replacement: string, matchCase: boolean) => {
      if (!currentSlideXml) return 0;
      const { count } = replaceAllText(currentSlideXml, search, replacement, matchCase);
      if (count > 0) {
        mutateSlideXml(focusIndex, (xml) => replaceAllText(xml, search, replacement, matchCase).xml);
      }
      return count;
    },
    [currentSlideXml, focusIndex, mutateSlideXml],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      // 文本框内：Ctrl/Cmd+B/I/U 仍作用于当前高亮选区
      if (typing && mod) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            ribbon.cmd.toggleBold?.();
            return;
          case 'i':
            e.preventDefault();
            ribbon.cmd.toggleItalic?.();
            return;
          case 'u':
            e.preventDefault();
            ribbon.cmd.toggleUnderline?.();
            return;
          default:
            return;
        }
      }
      if (typing) return;

      if (mod) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            ribbon.cmd.toggleBold?.();
            return;
          case 'i':
            e.preventDefault();
            ribbon.cmd.toggleItalic?.();
            return;
          case 'u':
            e.preventDefault();
            ribbon.cmd.toggleUnderline?.();
            return;
          case 'c':
            if (ribbon.hasSelection) {
              e.preventDefault();
              ribbon.cmd.copy?.();
            }
            return;
          case 'x':
            if (ribbon.hasSelection) {
              e.preventDefault();
              ribbon.cmd.cut?.();
            }
            return;
          case 'v':
            if (ribbon.cmd.paste) {
              e.preventDefault();
              ribbon.cmd.paste();
            }
            return;
          case 'd':
            if (ribbon.hasSelection) {
              e.preventDefault();
              ribbon.cmd.duplicateSelection?.();
            }
            return;
          case 'f':
            e.preventDefault();
            setFindMode('find');
            return;
          case 'h':
            e.preventDefault();
            setFindMode('replace');
            return;
          case 's':
            e.preventDefault();
            ribbon.cmd.save?.();
            return;
          default:
            return;
        }
      }

      if (e.key === 'Escape' && selectedElementId != null) {
        setSelectedElementId(null);
        return;
      }

      // 有选中元素时方向键微调，否则翻页
      if (selectedElementId != null) {
        const step = e.shiftKey ? NUDGE_STEP_PCT * 4 : NUDGE_STEP_PCT;
        const nudges: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        const delta = nudges[e.key];
        if (delta) {
          e.preventDefault();
          ribbon.nudgeSelection(delta[0], delta[1]);
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          ribbon.cmd.deleteSelection?.();
          return;
        }
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

      if (!lockSlideStructure && !batchMode && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        requestSkipSlide(focusIndex);
        return;
      }
      if (
        !lockSlideStructure &&
        batchMode &&
        selectedSlideIds.size > 0 &&
        (e.key === 'Delete' || e.key === 'Backspace')
      ) {
        e.preventDefault();
        requestBatchSkip();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    batchMode,
    focusIndex,
    lockSlideStructure,
    redo,
    requestBatchSkip,
    requestSkipSlide,
    ribbon,
    selectedElementId,
    selectedSlideIds.size,
    setFocusIndex,
    setSelectedElementId,
    slides.length,
    undo,
  ]);

  const endDrag = () => {
    setPptDragIndex(null);
    setPptDragOverIndex(null);
  };

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
            {onResetToTemplate && (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => onResetToTemplate()}
                title={t('bulletin.editSlidesResetHint')}
              >
                {t('bulletin.editSlidesReset')}
              </button>
            )}
            {onClose && (
              <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
                {t('common.close')}
              </button>
            )}
          </div>
        </header>

        <Ribbon
          ctx={ribbon}
          onUploadReplace={onUploadReplace}
          uploadReplacing={uploadReplacing}
        />

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

        <div className="ppt-workspace">
          <PptSlidesPane
            slides={slides}
            focusIndex={focusIndex}
            batchMode={batchMode}
            selectedIds={selectedSlideIds}
            dragIndex={pptDragIndex}
            dragOverIndex={pptDragOverIndex}
            pptxBlob={sourceFile}
            onSelect={setFocusIndex}
            onToggleSelect={toggleSlideSelect}
            onDragStart={setPptDragIndex}
            onDragOver={setPptDragOverIndex}
            onDrop={(to) => {
              if (!lockSlideStructure && pptDragIndex !== null && pptDragIndex !== to) {
                reorderSlideAt(pptDragIndex, to);
              }
              endDrag();
            }}
            onDragEnd={endDrag}
          />
          <main className={`ppt-canvas-area${showRuler ? ' ppt-canvas-area--ruler' : ''}`}>
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
                slideXml={currentSlideXml}
                selectedShapeIndex={selectedShapeIndex}
                onSelectShape={(idx) => setSelectedShapeIndex(idx)}
                onShapeTextChange={(shapeIndex, style) =>
                  setShapeTextOverride(focusIndex, shapeIndex, style)
                }
                onTextCharRangeChange={setTextCharRange}
                selectedElementId={selectedElementId}
                onSelectElement={(id) => {
                  setSelectedElementId(id);
                  if (id == null) setTextCharRange(null);
                }}
                onMoveElement={ribbon.moveElementByPct}
                onResizeElement={ribbon.resizeElementByPct}
                showGrid={showGrid}
                showGuides={showGuides}
                fidelitySlideNumber={fidelityPresentationSlides?.[focusIndex] ?? null}
                fidelityPatch={fidelityPatch}
                fidelitySectionId={fidelitySectionId}
                fidelityDisabled={Boolean(
                  slides[focusIndex]?.slideXmlOverride ||
                    (slides[focusIndex]?.shapeTextOverrides &&
                      Object.keys(slides[focusIndex].shapeTextOverrides!).length > 0),
                )}
              />
            )}

            {findMode && (
              <FindReplacePanel
                mode={findMode}
                slideXml={currentSlideXml}
                onReplaceAll={replaceOnSlide}
                onClose={() => setFindMode(null)}
              />
            )}
          </main>

          {selectionPaneOpen && (
            <SelectionPane
              slideXml={currentSlideXml}
              selectedElementId={selectedElementId}
              onSelect={setSelectedElementId}
              onOrder={(action) => ribbon.cmd.orderShape?.(action)}
              onClose={() => setSelectionPaneOpen(false)}
            />
          )}
        </div>

        <footer className="ppt-statusbar">
          <span>
            {slides.length > 0
              ? t('preview.slideCounter', { current: focusIndex + 1, total: slides.length })
              : '—'}
          </span>
          <span className="ppt-status-hint">{t('ppt.canvasHintFormat')}</span>
          <span className="ppt-statusbar-right">
            {canEditImages && (
              <>
                <button
                  type="button"
                  className="ppt-status-link"
                  onClick={() => imageReplaceInputRef.current?.click()}
                >
                  {t('ppt.replaceImage')}
                </button>
                <button
                  type="button"
                  className="ppt-status-link"
                  disabled={!firstImageUrl}
                  onClick={() => firstImageUrl && openCrop(focusIndex, 0, firstImageUrl)}
                >
                  {t('ppt.cropImage')}
                </button>
              </>
            )}
            <span className={dirty ? 'ppt-status-unsaved' : undefined}>
              {saving ? t('preview.saving') : dirty ? t('files.unsaved') : t('ppt.saved')}
            </span>
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
