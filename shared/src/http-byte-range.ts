export type ByteRange = { start: number; end: number };

/** 解析 `Range: bytes=` 请求头；无效时返回 null（应回完整 200）。 */
export function parseByteRangeHeader(
  rangeHeader: string | undefined,
  totalSize: number,
): ByteRange | null {
  if (!rangeHeader || totalSize <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return null;

  let start = match[1] ? Number.parseInt(match[1], 10) : NaN;
  let end = match[2] ? Number.parseInt(match[2], 10) : NaN;

  if (match[1] === '' && match[2] !== '') {
    const suffix = Number.parseInt(match[2], 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else {
    if (!Number.isFinite(start) || start < 0) return null;
    if (!Number.isFinite(end) || end >= totalSize) end = totalSize - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= totalSize) {
    return null;
  }

  return { start, end };
}
