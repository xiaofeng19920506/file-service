/**
 * 已登录且可看周报时：每 30 分钟拉取服事轮值。
 * Drive 同步为可选：未配置时不触发 sync、不打扰；配置后管理员才强制同步。
 * 仅在标签页可见时执行，避免后台空刷。
 */
import { useEffect, useRef } from 'react';
import {
  fetchBulletinDriveSyncStatus,
  fetchServiceRotationSchedule,
  triggerBulletinDriveSync,
} from '../api/bulletins';
import { setServiceRotationSchedules } from '../lib/bulletin-service-rotation';

export const BULLETIN_DRIVE_DATA_REFRESHED = 'bulletin-drive-data-refreshed';

export const BULLETIN_DRIVE_POLL_INTERVAL_MS = 30 * 60 * 1000;

export function dispatchBulletinDriveDataRefreshed(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BULLETIN_DRIVE_DATA_REFRESHED));
}

export async function pullBulletinDriveData(opts: {
  canManage: boolean;
}): Promise<void> {
  if (opts.canManage) {
    try {
      const status = await fetchBulletinDriveSyncStatus();
      if (status.configured) {
        await triggerBulletinDriveSync();
      }
    } catch {
      // 未配置 / 权限不足 / 网络失败时仍继续拉 schedule
    }
  }
  const { schedules } = await fetchServiceRotationSchedule();
  setServiceRotationSchedules(schedules);
  dispatchBulletinDriveDataRefreshed();
}

export function useBulletinDrivePoll(opts: {
  enabled: boolean;
  canManage: boolean;
}): void {
  const canManageRef = useRef(opts.canManage);
  canManageRef.current = opts.canManage;

  useEffect(() => {
    if (!opts.enabled) return;

    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      void pullBulletinDriveData({ canManage: canManageRef.current }).catch(() => {
        // 静默失败，下个周期再试
      });
    };

    const timer = window.setInterval(tick, BULLETIN_DRIVE_POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [opts.enabled]);
}
