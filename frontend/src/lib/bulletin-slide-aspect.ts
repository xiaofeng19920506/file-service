/**
 * 周报模板 `06_14_2026.pptx` 的 p:sldSz（EMU）= 10"×5.625"（标准 16:9）。
 * 预览占位 / 合成层须与此一致。
 */
export const BULLETIN_TEMPLATE_SLIDE_SIZE = {
  cx: 9_144_000,
  cy: 5_143_500,
} as const;

/**
 * CSS aspect-ratio。模板 EMU 恰为 16:9，用简化写法避免超大整数在部分环境下表现异常。
 */
export const BULLETIN_TEMPLATE_SLIDE_ASPECT = '16 / 9';

export function slideAspectRatioStyle(size: { cx: number; cy: number } = BULLETIN_TEMPLATE_SLIDE_SIZE): {
  aspectRatio: string;
} {
  const cx = size.cx > 0 ? size.cx : BULLETIN_TEMPLATE_SLIDE_SIZE.cx;
  const cy = size.cy > 0 ? size.cy : BULLETIN_TEMPLATE_SLIDE_SIZE.cy;
  // 与模板默认尺寸相同则用 16/9；否则按实际 EMU 比例
  if (cx === BULLETIN_TEMPLATE_SLIDE_SIZE.cx && cy === BULLETIN_TEMPLATE_SLIDE_SIZE.cy) {
    return { aspectRatio: BULLETIN_TEMPLATE_SLIDE_ASPECT };
  }
  // 约分到较小整数，降低 CSS 解析风险
  const g = gcd(Math.round(cx), Math.round(cy));
  return { aspectRatio: `${Math.round(cx) / g} / ${Math.round(cy) / g}` };
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}
