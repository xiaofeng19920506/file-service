import { useEffect, useState, type CSSProperties } from 'react';
import JSZip from 'jszip';
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
import type { EditableSlide } from '../../lib/pptx-preview';

type BulletinCompositeSlideProps = {
  slide: EditableSlide | null;
  pptxBlob: Blob | null;
  loading?: boolean;
  emptyLabel: string;
  slideLabel?: string;
  large?: boolean;
};

const SLIDE_WIDTH_PT = 720;

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

function layerZIndex(kind: SlideVisualLayer['kind'], role: ShapeRole): number {
  if (kind === 'background') return 0;
  if (kind === 'image') return 14;
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
): React.CSSProperties | undefined {
  if (!padding) return undefined;
  return {
    paddingTop: `${padding.top.toFixed(2)}cqh`,
    paddingRight: `${padding.right.toFixed(2)}cqw`,
    paddingBottom: `${padding.bottom.toFixed(2)}cqh`,
    paddingLeft: `${padding.left.toFixed(2)}cqw`,
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

export default function BulletinCompositeSlide({
  slide,
  pptxBlob,
  loading,
  emptyLabel,
  slideLabel,
  large,
}: BulletinCompositeSlideProps) {
  const [layers, setLayers] = useState<SlideVisualLayer[]>([]);
  const [slideSize, setSlideSize] = useState<SlideSizeEmu>({ ...DEFAULT_SLIDE_SIZE });
  const [layersLoading, setLayersLoading] = useState(false);

  useEffect(() => {
    if (!slide?.slidePath || !pptxBlob) {
      setLayers([]);
      setSlideSize({ ...DEFAULT_SLIDE_SIZE });
      return;
    }

    let cancelled = false;
    let activeLayers: SlideVisualLayer[] = [];

    setLayersLoading(true);
    void (async () => {
      try {
        const zip = await JSZip.loadAsync(pptxBlob);
        const entry = zip.file(slide.slidePath);
        if (!entry) return;
        const xml = await entry.async('string');
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
  }, [slide?.slidePath, pptxBlob]);

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

  return (
    <figure className={rootClass}>
      {slideLabel && <figcaption className="bulletin-slide-preview-caption">{slideLabel}</figcaption>}
      <div
        className="bulletin-slide-preview-frame bulletin-composite-slide"
        style={{ aspectRatio: `${slideSize.cx} / ${slideSize.cy}` }}
      >
        {layers.map((layer, i) => {
          const role = layer.kind === 'shape' ? shapeRole(layer) : 'default';
          const stackStyle = { zIndex: layerZIndex(layer.kind, role) };
          const shiftedTop = layer.kind !== 'background' ? layer.top + yShift : 0;

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
            const imgTop = layer.top >= 85 ? shiftedTop : layer.top;
            return (
              <img
                key={`img-${i}`}
                className="bulletin-composite-image"
                src={layer.url}
                alt=""
                draggable={false}
                style={{
                  ...stackStyle,
                  left: `${layer.left}%`,
                  top: `${imgTop}%`,
                  width: `${layer.width}%`,
                  height: `${layer.height}%`,
                }}
              />
            );
          }

          const useAutoFit = Boolean(layer.autoFit) && role !== 'date';
          const fitScale = autoFitScale(layer, slideSize.cy);
          const shapeTop = role === 'footer' ? 100 - layer.height : shiftedTop;

          return (
            <div
              key={`shape-${i}`}
              className={`bulletin-composite-shape bulletin-composite-shape--${layer.valign ?? 'top'}${
                role === 'footer' ? ' bulletin-composite-shape--footer' : ''
              }${role === 'header' ? ' bulletin-composite-shape--header' : ''}${
                role === 'date' ? ' bulletin-composite-shape--date' : ''
              }${role === 'prayer' ? ' bulletin-composite-shape--prayer' : ''}`}
              style={{
                ...stackStyle,
                left: `${layer.left}%`,
                top: `${shapeTop}%`,
                width: `${layer.width}%`,
                height: `${layer.height}%`,
                backgroundColor: layer.fill,
                ...shapePaddingStyle(layer.paddingPct),
              }}
            >
              {layer.paragraphs.map((para, pi) =>
                renderParagraph(para, role, useAutoFit, fitScale, pi),
              )}
            </div>
          );
        })}
      </div>
    </figure>
  );
}
