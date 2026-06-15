import { useEffect, useState } from 'react';
import JSZip from 'jszip';
import {
  autoFitScale,
  parseSlideVisualLayers,
  revokeSlideVisualLayers,
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

/** 按 PPT pt 与幻灯片宽度比例换算字号（10" 宽 = 720pt） */
function runFontSizePx(
  fontSizePt: number | undefined,
  autoFit: boolean | undefined,
  fitScale: number,
): string {
  const pt = (fontSizePt ?? 14) * (autoFit ? fitScale : 1);
  const cqw = ((pt * 100) / 720).toFixed(2);
  return `clamp(10px, ${cqw}cqw, ${pt}px)`;
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
  const [layersLoading, setLayersLoading] = useState(false);

  useEffect(() => {
    if (!slide?.slidePath || !pptxBlob) {
      setLayers([]);
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
          activeLayers = parsed;
          setLayers(parsed);
        } else {
          revokeSlideVisualLayers(parsed);
        }
      } catch {
        if (!cancelled) setLayers([]);
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

  return (
    <figure className={rootClass}>
      {slideLabel && <figcaption className="bulletin-slide-preview-caption">{slideLabel}</figcaption>}
      <div className="bulletin-slide-preview-frame bulletin-composite-slide">
        {layers.map((layer, i) => {
          const stackStyle = { zIndex: i + 1 };

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
                className="bulletin-composite-image"
                src={layer.url}
                alt=""
                draggable={false}
                style={{
                  ...stackStyle,
                  left: `${layer.left}%`,
                  top: `${layer.top}%`,
                  width: `${layer.width}%`,
                  height: `${layer.height}%`,
                }}
              />
            );
          }

          const fitScale = autoFitScale(layer);
          const isFooterBand = layer.top >= 60 && layer.height <= 10;
          const isHeaderBand = layer.top < 15 && (layer.fill?.toLowerCase() === '#0b5394' || layer.height <= 14);

          return (
            <div
              key={`shape-${i}`}
              className={`bulletin-composite-shape bulletin-composite-shape--${layer.valign ?? 'top'}${
                isFooterBand ? ' bulletin-composite-shape--footer' : ''
              }${isHeaderBand ? ' bulletin-composite-shape--header' : ''}`}
              style={{
                ...stackStyle,
                left: `${layer.left}%`,
                top: `${layer.top}%`,
                width: `${layer.width}%`,
                height: `${layer.height}%`,
                backgroundColor: layer.fill,
              }}
            >
              {layer.paragraphs.map((para, pi) => (
                <p
                  key={pi}
                  className="bulletin-composite-paragraph"
                  style={{
                    textAlign: para.align,
                    lineHeight: para.lineSpacing || 1,
                  }}
                >
                  {para.runs.map((run, ri) => (
                    <span
                      key={ri}
                      style={{
                        color: run.color,
                        fontWeight: run.bold ? 700 : undefined,
                        fontFamily: run.fontFamily ? `"${run.fontFamily}", sans-serif` : undefined,
                        fontSize: runFontSizePx(run.fontSizePt, layer.autoFit, fitScale),
                      }}
                    >
                      {run.text}
                    </span>
                  ))}
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </figure>
  );
}
