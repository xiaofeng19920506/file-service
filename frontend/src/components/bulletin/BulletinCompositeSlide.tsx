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

function runFontSizeCqh(
  fontSizePt: number | undefined,
  layerHeight: number,
  lineCount: number,
  autoFit: boolean | undefined,
  fitScale: number,
): string {
  const basePt = (fontSizePt ?? 14) * (autoFit ? fitScale : 1);
  const slotCqh = (layerHeight / Math.max(lineCount, 1)) * (autoFit ? 0.92 : 0.78);
  const cqhFromPt = (basePt / 540) * layerHeight * 1.05;
  const cqh = Math.min(slotCqh, cqhFromPt);
  return `min(${basePt.toFixed(1)}px, ${cqh.toFixed(2)}cqh)`;
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
          if (layer.kind === 'fill') {
            return (
              <div
                key={`fill-${i}`}
                className="bulletin-composite-fill"
                style={{
                  ...stackStyle,
                  left: `${layer.left}%`,
                  top: `${layer.top}%`,
                  width: `${layer.width}%`,
                  height: `${layer.height}%`,
                  backgroundColor: layer.color,
                }}
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
          const lineCount = layer.paragraphs.length;
          const isFooterBand = layer.top >= 60 && layer.height <= 10;

          return (
            <div
              key={`text-${i}`}
              className={`bulletin-composite-text bulletin-composite-text--${layer.valign ?? 'top'}${
                isFooterBand ? ' bulletin-composite-text--band' : ''
              }`}
              style={{
                ...stackStyle,
                left: `${layer.left}%`,
                top: `${layer.top}%`,
                width: `${layer.width}%`,
                height: `${layer.height}%`,
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
                        fontSize: runFontSizeCqh(
                          run.fontSizePt,
                          layer.height,
                          lineCount,
                          layer.autoFit,
                          fitScale,
                        ),
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
