/** Ribbon 命令契约：未实现的命令保持 undefined，按钮自动灰显 */

export type RibbonTabId =
  | 'home'
  | 'insert'
  | 'design'
  | 'transitions'
  | 'animations'
  | 'slideShow'
  | 'review'
  | 'view';

export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type TextValign = 'top' | 'middle' | 'bottom';
export type BulletKind = 'none' | 'char' | 'number';
export type TextDirection = 'horz' | 'vert' | 'vert270';

export type TextFormatState = {
  fontFamily?: string;
  fontSizePt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  shadow?: boolean;
  /** #RRGGBB */
  color?: string;
  align?: TextAlign;
  lineSpacing?: number;
  bullet?: BulletKind;
  valign?: TextValign;
  direction?: TextDirection;
  indentLevel?: number;
};

export type ShapeFormatState = {
  /** #RRGGBB，无填充为 null */
  fill?: string | null;
  line?: string | null;
  lineWidthPt?: number;
};

export type SlideLayoutOption = {
  /** layout 在 zip 中的路径 */
  path: string;
  name: string;
};

export type ShapePresetId =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'star5'
  | 'rightArrow'
  | 'leftArrow'
  | 'upArrow'
  | 'downArrow'
  | 'line'
  | 'straightConnector'
  | 'callout';

export type AlignAction =
  | 'left'
  | 'centerH'
  | 'right'
  | 'top'
  | 'middleV'
  | 'bottom'
  | 'distributeH'
  | 'distributeV';

export type OrderAction = 'front' | 'back' | 'forward' | 'backward';

export type CaseAction = 'upper' | 'lower' | 'sentence' | 'capitalize' | 'toggle';

/** 所有 Ribbon 命令。undefined 表示本期未实现，按钮灰显。 */
export type RibbonCommands = {
  // 剪贴板
  cut?: () => void;
  copy?: () => void;
  paste?: () => void;
  formatPainterActive?: boolean;
  toggleFormatPainter?: () => void;

  // 幻灯片
  newSlide?: (layoutPath?: string) => void;
  duplicateSlide?: () => void;
  deleteSlide?: () => void;
  applyLayout?: (layoutPath: string) => void;
  resetSlide?: () => void;
  addSection?: () => void;

  // 字体
  setFontFamily?: (family: string) => void;
  setFontSize?: (pt: number) => void;
  growFont?: () => void;
  shrinkFont?: () => void;
  toggleBold?: () => void;
  toggleItalic?: () => void;
  toggleUnderline?: () => void;
  toggleStrike?: () => void;
  toggleShadow?: () => void;
  setFontColor?: (hex: string) => void;
  clearFormatting?: () => void;
  changeCase?: (action: CaseAction) => void;

  // 段落
  setAlign?: (align: TextAlign) => void;
  setLineSpacing?: (value: number) => void;
  setBullet?: (kind: BulletKind) => void;
  indentMore?: () => void;
  indentLess?: () => void;
  setTextDirection?: (dir: TextDirection) => void;
  setTextValign?: (valign: TextValign) => void;

  // 绘图 / 排列
  insertShape?: (preset: ShapePresetId) => void;
  setShapeFill?: (hex: string | null) => void;
  setShapeLine?: (hex: string | null) => void;
  setShapeLineWidth?: (pt: number) => void;
  orderShape?: (action: OrderAction) => void;
  alignShape?: (action: AlignAction) => void;
  deleteSelection?: () => void;
  duplicateSelection?: () => void;
  selectAllShapes?: () => void;

  // 编辑
  openFind?: () => void;
  openReplace?: () => void;
  toggleSelectionPane?: () => void;

  // 插入
  insertTextBox?: () => void;
  insertPicture?: () => void;
  insertTable?: (rows: number, cols: number) => void;
  insertWordArt?: () => void;
  insertSlideNumber?: () => void;
  insertDateTime?: () => void;
  insertHeaderFooter?: () => void;
  insertSymbol?: (char: string) => void;
  insertLink?: (url: string) => void;

  // 视图
  zoom?: number;
  setZoom?: (zoom: number) => void;
  fitToWindow?: () => void;
  showGrid?: boolean;
  toggleGrid?: () => void;
  showGuides?: boolean;
  toggleGuides?: () => void;
  showRuler?: boolean;
  toggleRuler?: () => void;

  // 通用
  undo?: () => void;
  redo?: () => void;
  save?: () => void;
  discard?: () => void;
};

export type RibbonContextValue = {
  hasSelection: boolean;
  hasTextSelection: boolean;
  selectionCount: number;
  textFormat: TextFormatState | null;
  shapeFormat: ShapeFormatState | null;
  slideCount: number;
  slideIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  saving: boolean;
  canEditSlide: boolean;
  layouts: SlideLayoutOption[];
  cmd: RibbonCommands;
};

export const FONT_FAMILIES = [
  '微软雅黑',
  '黑体',
  '宋体',
  '楷体',
  '仿宋',
  '思源黑体',
  'Arial',
  'Calibri',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Verdana',
  'Tahoma',
  'Courier New',
];

export const FONT_SIZES = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96,
];

export const LINE_SPACINGS = [1, 1.15, 1.5, 2, 2.5, 3];

/** Office 主题色 + 标准色 */
export const THEME_COLORS = [
  '#FFFFFF',
  '#000000',
  '#E7E6E6',
  '#44546A',
  '#4472C4',
  '#ED7D31',
  '#A5A5A5',
  '#FFC000',
  '#5B9BD5',
  '#70AD47',
];

export const STANDARD_COLORS = [
  '#C00000',
  '#FF0000',
  '#FFC000',
  '#FFFF00',
  '#92D050',
  '#00B050',
  '#00B0F0',
  '#0070C0',
  '#002060',
  '#7030A0',
];

export const SYMBOLS = [
  '·', '•', '◦', '▪', '–', '—', '…', '«', '»', '“', '”', '‘', '’',
  '©', '®', '™', '°', '±', '×', '÷', '≠', '≈', '≤', '≥', '∞',
  '←', '→', '↑', '↓', '↔', '✓', '✗', '★', '☆', '♥', '♦', '♣', '♠',
  '§', '¶', '†', '‡', '№', '€', '£', '¥', '¢', 'α', 'β', 'γ', 'π', 'Ω',
];
