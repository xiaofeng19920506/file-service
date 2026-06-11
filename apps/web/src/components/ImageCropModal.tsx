import { useCallback, useEffect, useRef, useState } from 'react';

type CropRect = { x: number; y: number; width: number; height: number };

type Props = {
  imageUrl: string;
  onConfirm: (blob: Blob) => void;
  onClose: () => void;
};

export default function ImageCropModal({ imageUrl, onConfirm, onClose }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setCrop(null);
  }, [imageUrl]);

  const onImageLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNatural({ w, h });
    const margin = 0.05;
    setCrop({
      x: w * margin,
      y: h * margin,
      width: w * (1 - margin * 2),
      height: h * (1 - margin * 2),
    });
  };

  const toNatural = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const img = imgRef.current;
      if (!img || !natural.w) return null;
      const rect = img.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * natural.w;
      const y = ((clientY - rect.top) / rect.height) * natural.h;
      return { x: Math.max(0, Math.min(natural.w, x)), y: Math.max(0, Math.min(natural.h, y)) };
    },
    [natural.w, natural.h],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toNatural(e.clientX, e.clientY);
    if (!p) return;
    dragStart.current = p;
    setDragging(true);
    setCrop({ x: p.x, y: p.y, width: 0, height: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !dragStart.current) return;
    const p = toNatural(e.clientX, e.clientY);
    if (!p) return;
    const x0 = dragStart.current.x;
    const y0 = dragStart.current.y;
    setCrop({
      x: Math.min(x0, p.x),
      y: Math.min(y0, p.y),
      width: Math.abs(p.x - x0),
      height: Math.abs(p.y - y0),
    });
  };

  const onPointerUp = () => {
    setDragging(false);
    dragStart.current = null;
  };

  const handleConfirm = async () => {
    if (!crop || crop.width < 4 || crop.height < 4) return;
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    const { cropImageBlob } = await import('../lib/pptx-preview');
    const cropped = await cropImageBlob(blob, crop);
    onConfirm(cropped);
  };

  const cropStyle =
    crop && natural.w && imgRef.current
      ? (() => {
          const rect = imgRef.current!.getBoundingClientRect();
          const sx = rect.width / natural.w;
          const sy = rect.height / natural.h;
          return {
            left: crop.x * sx,
            top: crop.y * sy,
            width: crop.width * sx,
            height: crop.height * sy,
          };
        })()
      : null;

  return (
    <div className="image-crop-overlay" role="dialog" aria-modal aria-label="裁剪图片">
      <div className="image-crop-modal">
        <h3>裁剪图片</h3>
        <p className="image-crop-hint">拖拽框选区域</p>
        <div
          className="image-crop-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <img ref={imgRef} src={imageUrl} alt="" onLoad={onImageLoad} draggable={false} />
          {cropStyle && <div className="image-crop-box" style={cropStyle} />}
        </div>
        <div className="image-crop-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn-primary btn-primary-sm" onClick={() => void handleConfirm()}>
            确认裁剪
          </button>
        </div>
      </div>
    </div>
  );
}
