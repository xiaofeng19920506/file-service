import type { ShapePresetId } from './types';

/** 形状库定义：id 对应 OOXML prstGeom，preview 用于图库缩略 */
export const SHAPE_PRESETS: {
  id: ShapePresetId;
  labelKey: string;
  preview: React.ReactNode;
}[] = [
  {
    id: 'rect',
    labelKey: 'ppt.ribbon.shapeRect',
    preview: <rect x={3} y={6} width={18} height={12} />,
  },
  {
    id: 'roundRect',
    labelKey: 'ppt.ribbon.shapeRoundRect',
    preview: <rect x={3} y={6} width={18} height={12} rx={3.5} />,
  },
  {
    id: 'ellipse',
    labelKey: 'ppt.ribbon.shapeEllipse',
    preview: <ellipse cx={12} cy={12} rx={9} ry={6.5} />,
  },
  {
    id: 'triangle',
    labelKey: 'ppt.ribbon.shapeTriangle',
    preview: <path d="M12 4 21 19H3z" />,
  },
  {
    id: 'diamond',
    labelKey: 'ppt.ribbon.shapeDiamond',
    preview: <path d="M12 4 20 12l-8 8-8-8z" />,
  },
  {
    id: 'pentagon',
    labelKey: 'ppt.ribbon.shapePentagon',
    preview: <path d="M12 4 20.5 10.2 17.2 20H6.8L3.5 10.2z" />,
  },
  {
    id: 'hexagon',
    labelKey: 'ppt.ribbon.shapeHexagon',
    preview: <path d="M7.5 5h9L21 12l-4.5 7h-9L3 12z" />,
  },
  {
    id: 'star5',
    labelKey: 'ppt.ribbon.shapeStar',
    preview: <path d="M12 3.5 14.6 9.6 21 10.2l-4.8 4.3L17.6 21 12 17.6 6.4 21l1.4-6.5L3 10.2l6.4-.6z" />,
  },
  {
    id: 'rightArrow',
    labelKey: 'ppt.ribbon.shapeArrowRight',
    preview: <path d="M3 9.5h11V6l7 6-7 6v-3.5H3z" />,
  },
  {
    id: 'leftArrow',
    labelKey: 'ppt.ribbon.shapeArrowLeft',
    preview: <path d="M21 9.5H10V6l-7 6 7 6v-3.5h11z" />,
  },
  {
    id: 'upArrow',
    labelKey: 'ppt.ribbon.shapeArrowUp',
    preview: <path d="M9.5 21V10H6l6-7 6 7h-3.5v11z" />,
  },
  {
    id: 'downArrow',
    labelKey: 'ppt.ribbon.shapeArrowDown',
    preview: <path d="M9.5 3v11H6l6 7 6-7h-3.5V3z" />,
  },
  {
    id: 'line',
    labelKey: 'ppt.ribbon.shapeLine',
    preview: <path d="M4 19 20 5" fill="none" stroke="currentColor" strokeWidth={2} />,
  },
  {
    id: 'straightConnector',
    labelKey: 'ppt.ribbon.shapeConnector',
    preview: (
      <>
        <path d="M4 12h16" fill="none" stroke="currentColor" strokeWidth={2} />
        <path d="M16 8l4 4-4 4" fill="none" stroke="currentColor" strokeWidth={2} />
      </>
    ),
  },
  {
    id: 'callout',
    labelKey: 'ppt.ribbon.shapeCallout',
    preview: <path d="M3 5h18v10h-9l-5 5v-5H3z" />,
  },
];

/** prstGeom 名称映射 */
export const PRESET_GEOM: Record<ShapePresetId, string> = {
  rect: 'rect',
  roundRect: 'roundRect',
  ellipse: 'ellipse',
  triangle: 'triangle',
  diamond: 'diamond',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
  star5: 'star5',
  rightArrow: 'rightArrow',
  leftArrow: 'leftArrow',
  upArrow: 'upArrow',
  downArrow: 'downArrow',
  line: 'line',
  straightConnector: 'straightConnector1',
  callout: 'wedgeRectCallout',
};

/** 是否为线条类（无填充、只描边） */
export function isLinePreset(id: ShapePresetId): boolean {
  return id === 'line' || id === 'straightConnector';
}

export function ShapePreview({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="currentColor" aria-hidden>
      {children}
    </svg>
  );
}
