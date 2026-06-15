const MAX_CONCURRENT = 2;
let active = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      active++;
      resolve();
    });
  });
}

function release(): void {
  active--;
  const next = waiters.shift();
  if (next) next();
}

/** 限制周报 PPT 预览并发，避免 LibreOffice 服务过载 */
export function runBulletinPreviewTask<T>(fn: () => Promise<T>): Promise<T> {
  return acquire()
    .then(fn)
    .finally(release);
}
