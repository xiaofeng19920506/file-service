/**
 * jszip 是 CJS（module.exports = JSZip）。Turbopack/Next 下
 * `import JSZip from 'jszip'` 的 default 偶发为 undefined。
 * 统一从这里取运行时构造函数；类型请用 `JSZipInstance`。
 */
import * as JSZipNS from 'jszip';
import type JSZipType from 'jszip';

export type JSZipInstance = JSZipType;
export type JSZipObject = JSZipType.JSZipObject;

type JSZipStatic = typeof import('jszip');

function resolveJSZip(): JSZipStatic {
  const mod = JSZipNS as unknown as Record<string, unknown> & {
    default?: unknown;
    loadAsync?: unknown;
  };

  const candidates: unknown[] = [
    mod.default,
    mod['module.exports'],
    typeof mod.loadAsync === 'function' ? mod : null,
  ];

  for (const c of candidates) {
    if (c && typeof (c as { loadAsync?: unknown }).loadAsync === 'function') {
      return c as JSZipStatic;
    }
    const nested = (c as { default?: unknown } | null)?.default;
    if (nested && typeof (nested as { loadAsync?: unknown }).loadAsync === 'function') {
      return nested as JSZipStatic;
    }
  }

  throw new Error('JSZip failed to initialize');
}

export const JSZip = resolveJSZip();
export default JSZip;
