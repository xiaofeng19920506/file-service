/** 与 shared/bulletin-offering 同逻辑；前端避免从 @file-service/shared 整包引入（会拖进 pg）。 */

export function parseOfferingAmount(raw: string | null | undefined): number {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[$,\s]/g, '').trim();
  if (!cleaned) return 0;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

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
