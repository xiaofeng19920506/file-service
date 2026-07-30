/** 浏览器全屏 API（含 Safari webkit 前缀） */

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function isDocumentFullscreen(): boolean {
  const doc = document as FullscreenDocument;
  return Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
}

export async function requestElementFullscreen(el: HTMLElement | null | undefined): Promise<boolean> {
  if (!el) return false;
  if (isDocumentFullscreen()) return true;
  const node = el as FullscreenElement;
  const request = node.requestFullscreen?.bind(node) ?? node.webkitRequestFullscreen?.bind(node);
  if (!request) return false;
  try {
    await Promise.resolve(request());
    return isDocumentFullscreen();
  } catch {
    return false;
  }
}

export async function exitDocumentFullscreen(): Promise<void> {
  if (!isDocumentFullscreen()) return;
  const doc = document as FullscreenDocument;
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else await Promise.resolve(doc.webkitExitFullscreen?.());
  } catch {
    // ignore
  }
}

/** 尽量把弹窗铺满当前显示器（含系统菜单栏可用区域） */
export function maximizePopupWindow(win: Window): void {
  try {
    const screenInfo = win.screen as Screen & { availLeft?: number; availTop?: number };
    const left = screenInfo.availLeft ?? 0;
    const top = screenInfo.availTop ?? 0;
    const width = screenInfo.availWidth || screenInfo.width;
    const height = screenInfo.availHeight || screenInfo.height;
    win.moveTo(left, top);
    win.resizeTo(width, height);
  } catch {
    // 跨域/部分浏览器会拒绝
  }
}
