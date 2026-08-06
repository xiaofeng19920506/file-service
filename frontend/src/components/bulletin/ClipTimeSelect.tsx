import { useMemo } from 'react';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function splitHms(total: number): { h: number; m: number; s: number } {
  const whole = Math.max(0, Math.floor(total));
  return {
    h: Math.floor(whole / 3600),
    m: Math.floor((whole % 3600) / 60),
    s: whole % 60,
  };
}

function toSeconds(h: number, m: number, s: number): number {
  return h * 3600 + m * 60 + s;
}

function rangeInclusive(from: number, to: number): number[] {
  if (to < from) return [from];
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

/** 在 [minSec, maxSec] 内，给定已选 h/m，算出可选分/秒范围 */
function minuteBounds(minSec: number, maxSec: number, h: number): { min: number; max: number } {
  const minH = Math.floor(minSec / 3600);
  const maxH = Math.floor(maxSec / 3600);
  let min = 0;
  let max = 59;
  if (h === minH) min = Math.floor((minSec % 3600) / 60);
  if (h === maxH) max = Math.floor((maxSec % 3600) / 60);
  if (max < min) max = min;
  return { min, max };
}

function secondBounds(
  minSec: number,
  maxSec: number,
  h: number,
  m: number,
): { min: number; max: number } {
  const minParts = splitHms(minSec);
  const maxParts = splitHms(maxSec);
  let min = 0;
  let max = 59;
  if (h === minParts.h && m === minParts.m) min = minParts.s;
  if (h === maxParts.h && m === maxParts.m) max = maxParts.s;
  if (max < min) max = min;
  return { min, max };
}

function clampToRange(sec: number, minSec: number, maxSec: number): number {
  return Math.min(maxSec, Math.max(minSec, Math.floor(sec)));
}

type ClipTimeSelectProps = {
  valueSec: number;
  /** 可选闭区间下界（秒） */
  minSec: number;
  /** 可选闭区间上界（秒） */
  maxSec: number;
  disabled?: boolean;
  'aria-label'?: string;
  onChange: (nextSec: number) => void;
  onCommit?: () => void;
};

/**
 * 时 / 分 / 秒三个下拉：只列出 [minSec, maxSec] 内合法选项。
 * 例：视频 20 分钟 → 小时仅 0，分钟仅 0–20，秒在分钟=20 时仅 0。
 */
export default function ClipTimeSelect({
  valueSec,
  minSec,
  maxSec,
  disabled = false,
  'aria-label': ariaLabel,
  onChange,
  onCommit,
}: ClipTimeSelectProps) {
  const safeMin = Math.max(0, Math.floor(minSec));
  const safeMax = Math.max(safeMin, Math.floor(maxSec));
  const current = clampToRange(valueSec, safeMin, safeMax);
  const { h, m, s } = splitHms(current);

  const hourOptions = useMemo(() => {
    const from = Math.floor(safeMin / 3600);
    const to = Math.floor(safeMax / 3600);
    return rangeInclusive(from, to);
  }, [safeMin, safeMax]);

  const minuteOptions = useMemo(() => {
    const { min, max } = minuteBounds(safeMin, safeMax, h);
    return rangeInclusive(min, max);
  }, [safeMin, safeMax, h]);

  const secondOptions = useMemo(() => {
    const { min, max } = secondBounds(safeMin, safeMax, h, m);
    return rangeInclusive(min, max);
  }, [safeMin, safeMax, h, m]);

  const emit = (nextH: number, nextM: number, nextS: number) => {
    let nh = nextH;
    let nm = nextM;
    let ns = nextS;
    const mBound = minuteBounds(safeMin, safeMax, nh);
    nm = clampToRange(nm, mBound.min, mBound.max);
    const sBound = secondBounds(safeMin, safeMax, nh, nm);
    ns = clampToRange(ns, sBound.min, sBound.max);
    onChange(clampToRange(toSeconds(nh, nm, ns), safeMin, safeMax));
  };

  return (
    <div className="bulletin-worship-clip-time-select" aria-label={ariaLabel}>
      <select
        className="bulletin-worship-clip-time-part"
        disabled={disabled}
        value={h}
        aria-label="hours"
        onChange={(e) => emit(Number(e.target.value), m, s)}
        onBlur={onCommit}
      >
        {hourOptions.map((opt) => (
          <option key={opt} value={opt}>
            {pad2(opt)}
          </option>
        ))}
      </select>
      <span className="bulletin-worship-clip-time-sep" aria-hidden>
        :
      </span>
      <select
        className="bulletin-worship-clip-time-part"
        disabled={disabled}
        value={m}
        aria-label="minutes"
        onChange={(e) => emit(h, Number(e.target.value), s)}
        onBlur={onCommit}
      >
        {minuteOptions.map((opt) => (
          <option key={opt} value={opt}>
            {pad2(opt)}
          </option>
        ))}
      </select>
      <span className="bulletin-worship-clip-time-sep" aria-hidden>
        :
      </span>
      <select
        className="bulletin-worship-clip-time-part"
        disabled={disabled}
        value={s}
        aria-label="seconds"
        onChange={(e) => emit(h, m, Number(e.target.value))}
        onBlur={onCommit}
      >
        {secondOptions.map((opt) => (
          <option key={opt} value={opt}>
            {pad2(opt)}
          </option>
        ))}
      </select>
    </div>
  );
}
