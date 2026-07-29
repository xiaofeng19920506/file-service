/**
 * 周报模板 `06_14_2026.pptx` 的 p:sldSz（EMU）。
 * 预览框 / 占位须与此一致，避免硬编码 16/9 与文件比例漂移。
 */
export const BULLETIN_TEMPLATE_SLIDE_SIZE = {
  cx: 9_144_000,
  cy: 5_143_500,
} as const;

/** CSS aspect-ratio 值，如 `9144000 / 5143500` */
export const BULLETIN_TEMPLATE_SLIDE_ASPECT = `${BULLETIN_TEMPLATE_SLIDE_SIZE.cx} / ${BULLETIN_TEMPLATE_SLIDE_SIZE.cy}`;

export function slideAspectRatioStyle(size: { cx: number; cy: number } = BULLETIN_TEMPLATE_SLIDE_SIZE): {
  aspectRatio: string;
} {
  const cx = size.cx > 0 ? size.cx : BULLETIN_TEMPLATE_SLIDE_SIZE.cx;
  const cy = size.cy > 0 ? size.cy : BULLETIN_TEMPLATE_SLIDE_SIZE.cy;
  return { aspectRatio: `${cx} / ${cy}` };
}
