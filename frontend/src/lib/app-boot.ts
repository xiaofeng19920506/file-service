/** 首屏静态占位（layout 内 #app-boot），React 就绪后移除 */
export function dismissAppBoot(): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('app-boot');
  if (!el) return;
  el.setAttribute('hidden', '');
  el.setAttribute('aria-busy', 'false');
}
