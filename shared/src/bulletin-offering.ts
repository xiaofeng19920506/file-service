/** 解析用户输入的金额（允许 $、逗号、空格） */
export function parseOfferingAmount(raw: string | null | undefined): number {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[$,\s]/g, '').trim();
  if (!cleaned) return 0;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** 存库用：两位小数，无货币符号 */
export function normalizeOfferingAmountInput(raw: string | null | undefined): string {
  const n = parseOfferingAmount(raw);
  if (!String(raw ?? '').replace(/[$,\s]/g, '').trim()) return '';
  return n.toFixed(2);
}

/** 十一 + 其他 → 总数（存库字符串） */
export function computeOfferingTotalAmount(
  titheRaw: string | null | undefined,
  otherRaw: string | null | undefined,
): string {
  const total = parseOfferingAmount(titheRaw) + parseOfferingAmount(otherRaw);
  if (
    !String(titheRaw ?? '').replace(/[$,\s]/g, '').trim() &&
    !String(otherRaw ?? '').replace(/[$,\s]/g, '').trim()
  ) {
    return '';
  }
  return total.toFixed(2);
}

/** PPT 显示：`$3,260.00` */
export function formatOfferingUsdForPpt(raw: string | null | undefined): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  const n = parseOfferingAmount(trimmed);
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
