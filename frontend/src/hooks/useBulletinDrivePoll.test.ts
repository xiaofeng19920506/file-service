import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BULLETIN_DRIVE_POLL_INTERVAL_MS } from './useBulletinDrivePoll';

describe('useBulletinDrivePoll constants', () => {
  it('polls every 30 minutes', () => {
    expect(BULLETIN_DRIVE_POLL_INTERVAL_MS).toBe(30 * 60 * 1000);
  });
});

describe('pullBulletinDriveData', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('triggers sync for managers only when Drive is configured', async () => {
    const status = vi.fn(async () => ({
      configured: true,
      rotation: {},
      birthday: {},
    }));
    const trigger = vi.fn(async () => ({
      rotationUpdated: false,
      birthdayUpdated: false,
      state: { configured: true, rotation: {}, birthday: {} },
    }));
    const fetchSchedule = vi.fn(async () => ({
      schedules: [{ quarter: { year: 2026, startMonth: 7, endMonth: 9 }, weeks: [] }],
      libraryRev: 'x',
    }));
    const setSchedules = vi.fn();

    vi.doMock('../api/bulletins', () => ({
      fetchBulletinDriveSyncStatus: status,
      triggerBulletinDriveSync: trigger,
      fetchServiceRotationSchedule: fetchSchedule,
    }));
    vi.doMock('../lib/bulletin-service-rotation', () => ({
      setServiceRotationSchedules: setSchedules,
    }));

    const { pullBulletinDriveData } = await import('./useBulletinDrivePoll');
    await pullBulletinDriveData({ canManage: true });
    expect(status).toHaveBeenCalledOnce();
    expect(trigger).toHaveBeenCalledOnce();
    expect(fetchSchedule).toHaveBeenCalledOnce();
    expect(setSchedules).toHaveBeenCalledOnce();
  });

  it('skips sync when Drive is not configured', async () => {
    const status = vi.fn(async () => ({
      configured: false,
      rotation: {},
      birthday: {},
    }));
    const trigger = vi.fn();
    const fetchSchedule = vi.fn(async () => ({
      schedules: [],
      libraryRev: 'x',
    }));
    const setSchedules = vi.fn();

    vi.doMock('../api/bulletins', () => ({
      fetchBulletinDriveSyncStatus: status,
      triggerBulletinDriveSync: trigger,
      fetchServiceRotationSchedule: fetchSchedule,
    }));
    vi.doMock('../lib/bulletin-service-rotation', () => ({
      setServiceRotationSchedules: setSchedules,
    }));

    const { pullBulletinDriveData } = await import('./useBulletinDrivePoll');
    await pullBulletinDriveData({ canManage: true });
    expect(status).toHaveBeenCalledOnce();
    expect(trigger).not.toHaveBeenCalled();
    expect(fetchSchedule).toHaveBeenCalledOnce();
  });

  it('skips sync for non-managers', async () => {
    const status = vi.fn();
    const trigger = vi.fn();
    const fetchSchedule = vi.fn(async () => ({
      schedules: [],
      libraryRev: 'x',
    }));
    const setSchedules = vi.fn();

    vi.doMock('../api/bulletins', () => ({
      fetchBulletinDriveSyncStatus: status,
      triggerBulletinDriveSync: trigger,
      fetchServiceRotationSchedule: fetchSchedule,
    }));
    vi.doMock('../lib/bulletin-service-rotation', () => ({
      setServiceRotationSchedules: setSchedules,
    }));

    const { pullBulletinDriveData } = await import('./useBulletinDrivePoll');
    await pullBulletinDriveData({ canManage: false });
    expect(status).not.toHaveBeenCalled();
    expect(trigger).not.toHaveBeenCalled();
    expect(fetchSchedule).toHaveBeenCalledOnce();
  });
});
