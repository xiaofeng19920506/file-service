import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { loadPptxZipCached } from '../../lib/pptx-zip-cache';
import {
  autoFitScale,
  DEFAULT_SLIDE_SIZE,
  parseSlideVisualLayers,
  revokeSlideVisualLayers,
  type SlideSizeEmu,
  type SlideTextParagraph,
  type SlideTextRun,
  type SlideVisualLayer,
} from '../../lib/pptx-slide-layers';
import {
  shapeParagraphsToStyle,
  normalizeShapeTextOverride,
  type ShapeTextOverrideValue,
  type ShapeTextStyle,
} from '../../lib/pptx-shape-text';
import type { EditableSlide } from '../../lib/pptx-preview';

type BulletinCompositeSlideProps = {
  slide: EditableSlide | null;
  pptxBlob: Blob | null;
  loading?: boolean;
  emptyLabel: string;
  slideLabel?: string;
  large?: boolean;
  /** 允许点选文本框编辑 */
  editable?: boolean;
  shapeTextOverrides?: Record<number, ShapeTextOverrideValue>;
  selectedShapeIndex?: number | null;
  onSelectShape?: (shapeIndex: number | null, seed?: ShapeTextStyle) => void;
  onShapeTextChange?: (shapeIndex: number, style: ShapeTextStyle) => void;
  /** Ribbon 改写后的页面 XML；提供时优先于 zip 内容渲染 */
  slideXml?: string | null;
  /** 画布选中/几何编辑（元素级） */
  selectedElementId?: number | null;
  onSelectElement?: (elementId: number | null) => void;
  onMoveElement?: (elementId: number, dxPct: number, dyPct: number) => void;
  onResizeElement?: (
    elementId: number,
    box: { leftPct: number; topPct: number; widthPct: number; heightPct: number },
  ) => void;
  showGrid?: boolean;
  showGuides?: boolean;
};

const SLIDE_WIDTH_PT = 720;

export type PlacedBox = {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
};

type DragHandle = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type DragState = {
  handle: DragHandle;
  elementId: number;
  startX: number;
  startY: number;
  frameW: number;
  frameH: number;
  box: PlacedBox;
  cur: PlacedBox;
};

const RESIZE_HANDLES: { id: Exclude<DragHandle, 'move'>; cursor: string }[] = [
  { id: 'nw', cursor: 'nwse-resize' },
  { id: 'n', cursor: 'ns-resize' },
  { id: 'ne', cursor: 'nesw-resize' },
  { id: 'e', cursor: 'ew-resize' },
  { id: 'se', cursor: 'nwse-resize' },
  { id: 's', cursor: 'ns-resize' },
  { id: 'sw', cursor: 'nesw-resize' },
  { id: 'w', cursor: 'ew-resize' },
];

const MIN_SIZE_PCT = 1.5;

function resizeBox(box: PlacedBox, handle: DragHandle, dx: number, dy: number): PlacedBox {
  let { leftPct, topPct, widthPct, heightPct } = box;
  if (handle.includes('w')) {
    const next = Math.min(leftPct + dx, leftPct + widthPct - MIN_SIZE_PCT);
    widthPct += leftPct - next;
    leftPct = next;
  }
  if (handle.includes('e')) {
    widthPct = Math.max(MIN_SIZE_PCT, widthPct + dx);
  }
  if (handle.includes('n')) {
    const next = Math.min(topPct + dy, topPct + heightPct - MIN_SIZE_PCT);
    heightPct += topPct - next;
    topPct = next;
  }
  if (handle.includes('s')) {
    heightPct = Math.max(MIN_SIZE_PCT, heightPct + dy);
  }
  return { leftPct, topPct, widthPct, heightPct };
}

/** 按幻灯片宽度等比缩放字号（与 PPT pt 一致） */
function runFontSizeCqw(
  fontSizePt: number | undefined,
  useAutoFit: boolean,
  fitScale: number,
): string {
  const pt = (fontSizePt ?? 14) * (useAutoFit ? fitScale : 1);
  return `${((pt * 100) / SLIDE_WIDTH_PT).toFixed(3)}cqw`;
}

function runStyle(
  run: SlideTextRun,
  useAutoFit: boolean,
  fitScale: number,
): CSSProperties {
  return {
    color: run.color,
    fontWeight: run.bold ? 700 : undefined,
    fontStyle: run.italic ? 'italic' : undefined,
    fontFamily: run.fontFamily ? `"${run.fontFamily}", sans-serif` : undefined,
    fontSize: runFontSizeCqw(run.fontSizePt, useAutoFit, fitScale),
  };
}

type ShapeRole = 'header' | 'date' | 'prayer' | 'footer' | 'default';

function shapeRole(layer: Extract<SlideVisualLayer, { kind: 'shape' }>): ShapeRole {
  const fill = layer.fill?.toLowerCase();
  if (layer.top < 20 && fill === '#0b5394') return 'header';
  if (fill === '#bfc7ca' && layer.width > 90) return 'footer';
  if (!fill && layer.top >= 15 && layer.top < 28 && layer.height < 15) return 'date';
  if (!fill && layer.top >= 28 && layer.top < 50 && layer.height > 35) return 'prayer';
  return 'default';
}

function footerShiftDown(layers: SlideVisualLayer[]): number {
  const footer = layers.find(
    (l): l is Extract<SlideVisualLayer, { kind: 'shape' }> =>
      l.kind === 'shape' && l.fill?.toLowerCase() === '#bfc7ca' && l.width > 90,
  );
  if (!footer) return 0;
  const bottom = footer.top + footer.height;
  return bottom >= 99 ? 0 : 100 - bottom;
}

/**
 * 同一层级内按 spTree 文档顺序叠放（PPT 语义：后写的盖前面的）。页脚色块与页脚
 * 图标同属一层，只有加上文档序号才不会把图标压在色块下面。
 */
function layerZIndex(kind: SlideVisualLayer['kind'], role: ShapeRole, docIndex: number): number {
  return layerZIndexBase(kind, role) * 100 + docIndex;
}

function layerZIndexBase(kind: SlideVisualLayer['kind'], role: ShapeRole): number {
  if (kind === 'background') return 0;
  if (kind === 'image') return 16;
  switch (role) {
    case 'header':
      return 10;
    case 'date':
      return 12;
    case 'prayer':
      return 4;
    case 'footer':
      return 16;
    default:
      return 6;
  }
}

function shapePaddingStyle(
  padding: Extract<SlideVisualLayer, { kind: 'shape' }>['paddingPct'],
): CSSProperties | undefined {
  if (!padding) return undefined;
  // 百分比按包含块（幻灯片）宽度解析，四边都用同一基准
  return {
    paddingTop: `${padding.top.toFixed(3)}%`,
    paddingRight: `${padding.right.toFixed(3)}%`,
    paddingBottom: `${padding.bottom.toFixed(3)}%`,
    paddingLeft: `${padding.left.toFixed(3)}%`,
  };
}

/** 封面日期行：左日期、右时间+「主日崇拜」 */
function splitCoverDateRuns(runs: SlideTextRun[]): { left: SlideTextRun[]; right: SlideTextRun[] } {
  const timeIdx = runs.findIndex((r) => /\d{1,2}:\d{2}/.test(r.text));
  if (timeIdx <= 0) {
    return { left: runs.filter((r) => r.text.trim()), right: [] };
  }
  const left = runs
    .slice(0, timeIdx)
    .map((r) => ({ ...r, text: r.text.trimEnd() }))
    .filter((r) => r.text.trim());
  return { left, right: runs.slice(timeIdx) };
}

function renderRuns(
  runs: SlideTextRun[],
  useAutoFit: boolean,
  fitScale: number,
  keyPrefix: string,
) {
  return runs.map((run, ri) => (
    <span key={`${keyPrefix}-${ri}`} style={runStyle(run, useAutoFit, fitScale)}>
      {run.text}
    </span>
  ));
}

function renderParagraph(
  para: SlideTextParagraph,
  role: ShapeRole,
  useAutoFit: boolean,
  fitScale: number,
  pi: number,
) {
  if (para.spacer) {
    return (
      <p
        key={pi}
        className="bulletin-composite-spacer"
        style={{ height: runFontSizeCqw(para.spacerHeightPt, false, 1) }}
        aria-hidden
      />
    );
  }

  if (role === 'date' && para.runs.length > 1) {
    const { left, right } = splitCoverDateRuns(para.runs);
    return (
      <div key={pi} className="bulletin-composite-date-row">
        <span className="bulletin-composite-date-left">
          {renderRuns(left, false, fitScale, `dl-${pi}`)}
        </span>
        <span className="bulletin-composite-date-right">
          {renderRuns(right, false, fitScale, `dr-${pi}`)}
        </span>
      </div>
    );
  }

  return (
    <p
      key={pi}
      className="bulletin-composite-paragraph"
      style={{
        textAlign: para.align,
        lineHeight: para.lineSpacing || 1,
      }}
    >
      {renderRuns(para.runs, useAutoFit, fitScale, `p-${pi}`)}
    </p>
  );
}

function paragraphsFromOverride(
  override: ShapeTextOverrideValue,
  template: SlideTextParagraph[],
): SlideTextParagraph[] {
  const style = normalizeShapeTextOverride(override);
  const sample =
    template.find((p) => !p.spacer && p.runs.length)?.runs[0] ??
    ({ text: '', color: '#1e2d31', fontSizePt: 14 } satisfies SlideTextRun);
  const align = template.find((p) => !p.spacer)?.align ?? 'left';
  const lineSpacing = template.find((p) => !p.spacer)?.lineSpacing ?? 1;
  return style.text.split('\n').map((line) => ({
    runs: [
      {
        ...sample,
        text: line,
        bold: style.bold ?? sample.bold,
        italic: style.italic ?? sample.italic,
        fontSizePt: style.fontSizePt ?? sample.fontSizePt,
        fontFamily: style.fontFamily ?? sample.fontFamily,
      },
    ],
    align,
    lineSpacing,
  }));
}

export default function BulletinCompositeSlide({
  slide,
  pptxBlob,
  loading,
  emptyLabel,
  slideLabel,
  large,
  editable = false,
  shapeTextOverrides,
  selectedShapeIndex = null,
  onSelectShape,
  onShapeTextChange,
  slideXml = null,
  selectedElementId = null,
  onSelectElement,
  onMoveElement,
  onResizeElement,
  showGrid = false,
  showGuides = false,
}: BulletinCompositeSlideProps) {
  const [layers, setLayers] = useState<SlideVisualLayer[]>([]);
  const [slideSize, setSlideSize] = useState<SlideSizeEmu>({ ...DEFAULT_SLIDE_SIZE });
  const [layersLoading, setLayersLoading] = useState(false);
  const [editingShape, setEditingShape] = useState<number | null>(null);
  const [draftText, setDraftText] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  /**
   * 与 drag 同步的 ref。松手时要通知父组件写回 XML（父组件 setState），
   * 这类副作用不能放进 setDrag 的 updater：updater 必须纯，React 可能在
   * 渲染其它组件时执行它，会报 setState-in-render。
   */
  const dragRef = useRef<DragState | null>(null);
  const dragging = drag !== null;

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      const dx = ((e.clientX - cur.startX) / cur.frameW) * 100;
      const dy = ((e.clientY - cur.startY) / cur.frameH) * 100;
      const next: DragState = {
        ...cur,
        cur:
          cur.handle === 'move'
            ? {
                ...cur.box,
                leftPct: cur.box.leftPct + dx,
                topPct: cur.box.topPct + dy,
              }
            : resizeBox(cur.box, cur.handle, dx, dy),
      };
      dragRef.current = next;
      setDrag(next);
    };
    const onUp = () => {
      const cur = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!cur) return;
      const moved =
        Math.abs(cur.cur.leftPct - cur.box.leftPct) > 0.05 ||
        Math.abs(cur.cur.topPct - cur.box.topPct) > 0.05 ||
        Math.abs(cur.cur.widthPct - cur.box.widthPct) > 0.05 ||
        Math.abs(cur.cur.heightPct - cur.box.heightPct) > 0.05;
      if (!moved) return;
      if (cur.handle === 'move') {
        onMoveElement?.(
          cur.elementId,
          cur.cur.leftPct - cur.box.leftPct,
          cur.cur.topPct - cur.box.topPct,
        );
      } else {
        onResizeElement?.(cur.elementId, cur.cur);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, onMoveElement, onResizeElement]);

  useEffect(() => {
    if (!slide?.slidePath || !pptxBlob) {
      setLayers([]);
      setSlideSize({ ...DEFAULT_SLIDE_SIZE });
      return;
    }

    let cancelled = false;
    let activeLayers: SlideVisualLayer[] = [];

    setLayersLoading(true);
    setEditingShape(null);
    void (async () => {
      try {
        const zip = await loadPptxZipCached(pptxBlob);
        let xml = slideXml;
        if (!xml) {
          const entry = zip.file(slide.slidePath);
          if (!entry) return;
          xml = await entry.async('string');
        }
        const parsed = await parseSlideVisualLayers(zip, slide.slidePath, xml);
        if (!cancelled) {
          activeLayers = parsed.layers;
          setLayers(parsed.layers);
          setSlideSize(parsed.slideSize);
        } else {
          revokeSlideVisualLayers(parsed.layers);
        }
      } catch {
        if (!cancelled) {
          setLayers([]);
          setSlideSize({ ...DEFAULT_SLIDE_SIZE });
        }
      } finally {
        if (!cancelled) setLayersLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      revokeSlideVisualLayers(activeLayers);
    };
  }, [slide?.slidePath, pptxBlob, slideXml]);

  useEffect(() => {
    if (editingShape == null) return;
    editorRef.current?.focus();
    editorRef.current?.select();
  }, [editingShape]);

  const commitEdit = () => {
    if (editingShape == null || !onShapeTextChange) {
      setEditingShape(null);
      return;
    }
    const existing = normalizeShapeTextOverride(shapeTextOverrides?.[editingShape]);
    const layer = layers.find((l) => l.kind === 'shape' && l.shapeIndex === editingShape);
    const fromLayer =
      layer && layer.kind === 'shape' ? shapeParagraphsToStyle(layer.paragraphs) : null;
    // 提交时把画布上当前可见样式一并写入 XML。只传「有值」的字段，
    // 避免 bold:false 把 Ribbon/模板里已有的加粗清掉。
    const next: ShapeTextStyle = { text: draftText };
    const fontFamily = existing.fontFamily ?? fromLayer?.fontFamily;
    const fontSizePt = existing.fontSizePt ?? fromLayer?.fontSizePt;
    const bold = existing.bold ?? fromLayer?.bold;
    const italic = existing.italic ?? fromLayer?.italic;
    if (fontFamily) next.fontFamily = fontFamily;
    if (fontSizePt != null) next.fontSizePt = fontSizePt;
    if (bold) next.bold = true;
    if (italic) next.italic = true;
    onShapeTextChange(editingShape, next);
    setEditingShape(null);
  };

  const beginEdit = (shapeIndex: number, paragraphs: SlideTextParagraph[]) => {
    if (!editable || !onShapeTextChange) return;
    const seed = shapeParagraphsToStyle(paragraphs);
    onSelectShape?.(shapeIndex, seed);
    const override = shapeTextOverrides?.[shapeIndex];
    const initial =
      override !== undefined
        ? normalizeShapeTextOverride(override).text
        : seed.text;
    setDraftText(initial);
    setEditingShape(shapeIndex);
  };

  const selectShape = (shapeIndex: number, paragraphs: SlideTextParagraph[]) => {
    if (!editable) return;
    onSelectShape?.(shapeIndex, shapeParagraphsToStyle(paragraphs));
  };

  const selectElement = (elementId: number | undefined) => {
    if (!editable || !onSelectElement) return;
    onSelectElement(elementId ?? null);
  };

  const startDrag = (
    e: React.PointerEvent,
    elementId: number | undefined,
    handle: DragHandle,
    box: PlacedBox,
  ) => {
    if (!editable || elementId == null) return;
    if (handle === 'move' ? !onMoveElement : !onResizeElement) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.stopPropagation();
    e.preventDefault();
    onSelectElement?.(elementId);
    const state: DragState = {
      handle,
      elementId,
      startX: e.clientX,
      startY: e.clientY,
      frameW: rect.width,
      frameH: rect.height,
      box,
      cur: box,
    };
    dragRef.current = state;
    setDrag(state);
  };

  const rootClass = `bulletin-slide-preview${large ? ' bulletin-slide-preview--large' : ''}`;

  if (loading || layersLoading) {
    return (
      <div className={`${rootClass} bulletin-slide-preview--loading`}>
        <div className="preview-spinner" />
      </div>
    );
  }

  if (!slide || layers.length === 0) {
    return (
      <div className={`${rootClass} bulletin-slide-preview--empty`}>
        <p>{emptyLabel}</p>
      </div>
    );
  }

  const yShift = footerShiftDown(layers);
  const placed: (PlacedBox | null)[] = layers.map((layer) => {
    if (layer.kind === 'background') return null;
    const shifted = layer.top + yShift;
    let topPct = shifted;
    if (layer.kind === 'image') topPct = layer.top >= 85 ? shifted : layer.top;
    else if (layer.kind === 'shape' && shapeRole(layer) === 'footer') topPct = 100 - layer.height;
    return {
      leftPct: layer.left,
      topPct,
      widthPct: layer.width,
      heightPct: layer.height,
    };
  });
  const boxFor = (i: number): PlacedBox => {
    const base = placed[i] ?? { leftPct: 0, topPct: 0, widthPct: 0, heightPct: 0 };
    const layer = layers[i];
    const id = layer.kind === 'background' ? undefined : layer.elementId;
    if (drag && id != null && drag.elementId === id) return drag.cur;
    return base;
  };
  const selectedIndex =
    selectedElementId == null
      ? -1
      : layers.findIndex((l) => l.kind !== 'background' && l.elementId === selectedElementId);
  const canPickElements = editable && !!onSelectElement;

  return (
    <figure className={rootClass}>
      {slideLabel && <figcaption className="bulletin-slide-preview-caption">{slideLabel}</figcaption>}
      <div
        ref={frameRef}
        className={`bulletin-slide-preview-frame bulletin-composite-slide${
          editable ? ' bulletin-composite-slide--editable' : ''
        }${showGrid ? ' bulletin-composite-slide--grid' : ''}${
          showGuides ? ' bulletin-composite-slide--guides' : ''
        }`}
        style={{ aspectRatio: `${slideSize.cx} / ${slideSize.cy}` }}
        onMouseDown={(e) => {
          if (!editable) return;
          if ((e.target as HTMLElement).closest('.bulletin-composite-shape--editable')) return;
          if ((e.target as HTMLElement).closest('.ppt-el-frame')) return;
          if (editingShape != null) commitEdit();
          onSelectShape?.(null);
          onSelectElement?.(null);
        }}
      >
        {layers.map((layer, i) => {
          const role = layer.kind === 'shape' ? shapeRole(layer) : 'default';
          const stackStyle = { zIndex: layerZIndex(layer.kind, role, i) };
          const box = boxFor(i);

          if (layer.kind === 'background') {
            return (
              <img
                key={`bg-${i}`}
                className="bulletin-composite-bg"
                src={layer.url}
                alt=""
                draggable={false}
                style={stackStyle}
              />
            );
          }

          if (layer.kind === 'image') {
            return (
              <img
                key={`img-${i}`}
                className={`bulletin-composite-image${canPickElements ? ' is-pickable' : ''}`}
                src={layer.url}
                alt=""
                draggable={false}
                style={{
                  ...stackStyle,
                  left: `${box.leftPct}%`,
                  top: `${box.topPct}%`,
                  width: `${box.widthPct}%`,
                  height: `${box.heightPct}%`,
                }}
                onPointerDown={
                  canPickElements
                    ? (e) => {
                        selectElement(layer.elementId);
                        startDrag(e, layer.elementId, 'move', box);
                      }
                    : undefined
                }
              />
            );
          }

          if (layer.kind === 'table') {
            return (
              <div
                key={`tbl-${i}`}
                className={`bulletin-composite-table${canPickElements ? ' is-pickable' : ''}`}
                style={{
                  ...stackStyle,
                  left: `${box.leftPct}%`,
                  top: `${box.topPct}%`,
                  width: `${box.widthPct}%`,
                  height: `${box.heightPct}%`,
                }}
                onPointerDown={
                  canPickElements
                    ? (e) => {
                        selectElement(layer.elementId);
                        startDrag(e, layer.elementId, 'move', box);
                      }
                    : undefined
                }
              >
                <table>
                  <tbody>
                    {layer.rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.cells.map((cell, ci) => (
                          <td key={ci} style={{ fontWeight: cell.bold ? 700 : undefined }}>
                            {cell.text}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          const useAutoFit = Boolean(layer.autoFit) && role !== 'date';
          const fitScale = autoFitScale(layer, slideSize.cy);
          const shapeIndex = layer.shapeIndex;
          const canEditShape = editable && shapeIndex != null && !!onShapeTextChange;
          const isEditing = canEditShape && editingShape === shapeIndex;
          const isSelected = canEditShape && selectedShapeIndex === shapeIndex;
          const overrideValue =
            shapeIndex != null ? shapeTextOverrides?.[shapeIndex] : undefined;
          const overrideStyle =
            overrideValue !== undefined ? normalizeShapeTextOverride(overrideValue) : undefined;
          const displayParagraphs =
            overrideValue !== undefined
              ? paragraphsFromOverride(overrideValue, layer.paragraphs)
              : layer.paragraphs;
          const sampleRun = displayParagraphs.find((p) => !p.spacer)?.runs[0]
            ?? layer.paragraphs.find((p) => !p.spacer)?.runs[0];

          return (
            <div
              key={`shape-${i}`}
              className={`bulletin-composite-shape bulletin-composite-shape--${layer.valign ?? 'top'}${
                role === 'footer' ? ' bulletin-composite-shape--footer' : ''
              }${role === 'header' ? ' bulletin-composite-shape--header' : ''}${
                role === 'date' ? ' bulletin-composite-shape--date' : ''
              }${role === 'prayer' ? ' bulletin-composite-shape--prayer' : ''}${
                canEditShape ? ' bulletin-composite-shape--editable' : ''
              }${isEditing ? ' bulletin-composite-shape--editing' : ''}${
                isSelected && !isEditing ? ' bulletin-composite-shape--selected' : ''
              }${overrideValue !== undefined ? ' bulletin-composite-shape--overridden' : ''}`}
              style={{
                ...stackStyle,
                left: `${box.leftPct}%`,
                top: `${box.topPct}%`,
                width: `${box.widthPct}%`,
                height: `${box.heightPct}%`,
                backgroundColor: layer.fill,
                border: layer.line ? `1px solid ${layer.line}` : undefined,
                ...shapePaddingStyle(layer.paddingPct),
                zIndex: isEditing || isSelected ? 4000 : stackStyle.zIndex,
              }}
              onPointerDown={
                canPickElements && !isEditing
                  ? (e) => {
                      selectElement(layer.elementId);
                      if (!canEditShape) startDrag(e, layer.elementId, 'move', box);
                    }
                  : undefined
              }
              onClick={
                canEditShape && !isEditing
                  ? (e) => {
                      e.stopPropagation();
                      selectShape(shapeIndex, layer.paragraphs);
                    }
                  : undefined
              }
              onDoubleClick={
                canEditShape && !isEditing
                  ? (e) => {
                      e.stopPropagation();
                      beginEdit(shapeIndex, layer.paragraphs);
                    }
                  : undefined
              }
              role={canEditShape ? 'button' : undefined}
              tabIndex={canEditShape && !isEditing ? 0 : undefined}
              onKeyDown={
                canEditShape && !isEditing
                  ? (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        beginEdit(shapeIndex, layer.paragraphs);
                      }
                    }
                  : undefined
              }
            >
              {isEditing ? (
                <textarea
                  ref={editorRef}
                  className="bulletin-composite-shape-editor"
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  onBlur={commitEdit}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingShape(null);
                    }
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      commitEdit();
                    }
                  }}
                  style={{
                    color: sampleRun?.color,
                    fontWeight: (overrideStyle?.bold ?? sampleRun?.bold) ? 700 : undefined,
                    fontStyle: (overrideStyle?.italic ?? sampleRun?.italic) ? 'italic' : undefined,
                    fontFamily: (overrideStyle?.fontFamily ?? sampleRun?.fontFamily)
                      ? `"${overrideStyle?.fontFamily ?? sampleRun?.fontFamily}", sans-serif`
                      : undefined,
                    fontSize: runFontSizeCqw(
                      overrideStyle?.fontSizePt ?? sampleRun?.fontSizePt,
                      useAutoFit,
                      fitScale,
                    ),
                    textAlign: layer.paragraphs.find((p) => !p.spacer)?.align ?? 'left',
                    lineHeight: layer.paragraphs.find((p) => !p.spacer)?.lineSpacing || 1.15,
                  }}
                  aria-label={`文本框 ${shapeIndex! + 1}`}
                />
              ) : (
                displayParagraphs.map((para, pi) =>
                  renderParagraph(para, role, useAutoFit, fitScale, pi),
                )
              )}
            </div>
          );
        })}

        {canPickElements && selectedIndex >= 0 && editingShape == null
          ? (() => {
              const layer = layers[selectedIndex];
              if (layer.kind === 'background') return null;
              const box = boxFor(selectedIndex);
              const id = layer.elementId;
              return (
                <div
                  className="ppt-el-frame"
                  style={{
                    left: `${box.leftPct}%`,
                    top: `${box.topPct}%`,
                    width: `${box.widthPct}%`,
                    height: `${box.heightPct}%`,
                  }}
                >
                  {(['top', 'right', 'bottom', 'left'] as const).map((edge) => (
                    <span
                      key={edge}
                      className={`ppt-el-edge ppt-el-edge--${edge}`}
                      onPointerDown={(e) => startDrag(e, id, 'move', box)}
                    />
                  ))}
                  {RESIZE_HANDLES.map((h) => (
                    <span
                      key={h.id}
                      className={`ppt-el-handle ppt-el-handle--${h.id}`}
                      style={{ cursor: h.cursor }}
                      onPointerDown={(e) => startDrag(e, id, h.id, box)}
                    />
                  ))}
                </div>
              );
            })()
          : null}
      </div>
    </figure>
  );
}
