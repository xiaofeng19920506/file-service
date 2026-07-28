export type BulletinPreviewPriority = 'high' | 'normal' | 'low';

const PRIORITY_WEIGHT: Record<BulletinPreviewPriority, number> = {
  high: 3,
  normal: 2,
  low: 1,
};

/** 同时进行的预览请求上限（LO 串行，过高只会堆上传） */
const MAX_CONCURRENT = 3;

type Waiter = {
  priority: number;
  resolve: () => void;
};

let active = 0;
const waiters: Waiter[] = [];

function acquire(priority: BulletinPreviewPriority): Promise<void> {
  const weight = PRIORITY_WEIGHT[priority];
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push({ priority: weight, resolve });
    // 高优先级插到前面；同级保持 FIFO
    waiters.sort((a, b) => b.priority - a.priority);
  });
}

function release(): void {
  active--;
  const next = waiters.shift();
  if (next) {
    active++;
    next.resolve();
  }
}

/**
 * 限制周报 PPT 预览并发。
 * high：视口内；normal：即将进入；low：后台预取（可被插队）。
 */
export function runBulletinPreviewTask<T>(
  fn: () => Promise<T>,
  priority: BulletinPreviewPriority = 'normal',
): Promise<T> {
  return acquire(priority)
    .then(fn)
    .finally(release);
}
