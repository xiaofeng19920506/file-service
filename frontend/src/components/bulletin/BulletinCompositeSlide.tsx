import { useEffect, useState } from 'react';
import JSZip from 'jszip';
import {
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
          if (layer.kind === 'background') {
            return (
              <img
                key={`bg-${i}`}
                className="bulletin-composite-bg"
                src={layer.url}
                alt=""
                draggable={false}
              />
            );
          }
          if (layer.kind === 'fill') {
            return (
              <div
                key={`fill-${i}`}
                className="bulletin-composite-fill"
                style={{
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
                  left: `${layer.left}%`,
                  top: `${layer.top}%`,
                  width: `${layer.width}%`,
                  height: `${layer.height}%`,
                }}
              />
            );
          }
          return (
            <div
              key={`text-${i}`}
              className="bulletin-composite-text"
              style={{
                left: `${layer.left}%`,
                top: `${layer.top}%`,
                width: `${layer.width}%`,
                height: `${layer.height}%`,
                textAlign: layer.align,
                color: layer.color,
                fontWeight: layer.bold ? 700 : undefined,
                fontSize: layer.fontSizePt
                  ? `clamp(0.55rem, ${(layer.fontSizePt / 13).toFixed(2)}vw, ${layer.fontSizePt}px)`
                  : undefined,
              }}
            >
              {layer.lines.map((line, li) => (
                <p key={li}>{line}</p>
              ))}
            </div>
          );
        })}
      </div>
    </figure>
  );
}
