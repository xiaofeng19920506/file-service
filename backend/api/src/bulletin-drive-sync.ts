/**
 * Google Drive → 本地服事轮值 JSON / 生日月库 PPTX 定时同步。
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ApiEnv } from '@file-service/shared';
import {
  GoogleDriveServiceAccountClient,
  parseServiceRotationXlsx,
  writeServiceRotationScheduleFiles,
  importBirthdayMonthsFromJanDecPptx,
  resolveBirthdayMonthLibraryDir,
  resolveServiceRotationTemplateDir,
  md5Hex,
} from '@file-service/shared';

export type DriveFileSyncState = {
  modifiedTime?: string;
  md5Checksum?: string;
  name?: string;
  lastSyncedAt?: string;
  lastError?: string | null;
};

export type BulletinDriveSyncState = {
  rotation: DriveFileSyncState;
  birthday: DriveFileSyncState;
  lastRunAt?: string;
  lastError?: string | null;
  configured: boolean;
};

export type BulletinDriveSyncResult = {
  skipped: boolean;
  reason?: string;
  rotationUpdated: boolean;
  birthdayUpdated: boolean;
  state: BulletinDriveSyncState;
};

type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

function resolveDriveDataDir(): string {
  const candidates = [
    join(process.cwd(), 'data/bulletin-drive'),
    join(process.cwd(), '../data/bulletin-drive'),
  ];
  return candidates[0]!;
}

function emptyState(configured: boolean): BulletinDriveSyncState {
  return {
    rotation: {},
    birthday: {},
    configured,
    lastError: null,
  };
}

export function isBulletinDriveSyncConfigured(env: ApiEnv): boolean {
  return Boolean(
    env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim()
      && (env.BULLETIN_DRIVE_ROTATION_FILE_ID?.trim()
        || env.BULLETIN_DRIVE_BIRTHDAY_PPTX_FILE_ID?.trim()),
  );
}

export function readBulletinDriveSyncState(dataDir?: string): BulletinDriveSyncState {
  const dir = dataDir ?? resolveDriveDataDir();
  const path = join(dir, 'sync-state.json');
  if (!existsSync(path)) return emptyState(false);
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as BulletinDriveSyncState;
    return {
      ...emptyState(Boolean(parsed.configured)),
      ...parsed,
      rotation: parsed.rotation ?? {},
      birthday: parsed.birthday ?? {},
    };
  } catch {
    return emptyState(false);
  }
}

function writeBulletinDriveSyncState(state: BulletinDriveSyncState, dataDir?: string) {
  const dir = dataDir ?? resolveDriveDataDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'sync-state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function fileUnchanged(
  meta: { modifiedTime: string; md5Checksum?: string },
  prev: DriveFileSyncState,
): boolean {
  if (prev.md5Checksum && meta.md5Checksum && prev.md5Checksum === meta.md5Checksum) {
    return true;
  }
  return Boolean(prev.modifiedTime && prev.modifiedTime === meta.modifiedTime);
}

export async function runBulletinDriveSync(opts: {
  env: ApiEnv;
  log?: Logger;
  force?: boolean;
  dataDir?: string;
  fetchImpl?: typeof fetch;
}): Promise<BulletinDriveSyncResult> {
  const { env, log, force = false, fetchImpl = fetch } = opts;
  const dataDir = opts.dataDir ?? resolveDriveDataDir();
  const configured = isBulletinDriveSyncConfigured(env);

  if (!configured) {
    const state = { ...readBulletinDriveSyncState(dataDir), configured: false };
    writeBulletinDriveSyncState(state, dataDir);
    return {
      skipped: true,
      reason: 'not_configured',
      rotationUpdated: false,
      birthdayUpdated: false,
      state,
    };
  }

  const saJson = env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON!.trim();
  const client = GoogleDriveServiceAccountClient.fromJsonOrPath(saJson, fetchImpl);
  let state = readBulletinDriveSyncState(dataDir);
  state = { ...state, configured: true, lastRunAt: new Date().toISOString(), lastError: null };

  let rotationUpdated = false;
  let birthdayUpdated = false;

  try {
    mkdirSync(dataDir, { recursive: true });

    const rotationId = env.BULLETIN_DRIVE_ROTATION_FILE_ID?.trim();
    if (rotationId) {
      try {
        const meta = await client.getFileMeta(rotationId);
        if (!force && fileUnchanged(meta, state.rotation)) {
          log?.info({ fileId: rotationId, modifiedTime: meta.modifiedTime }, 'drive rotation unchanged');
        } else {
          const buf = await client.downloadFile(rotationId);
          const cachePath = join(dataDir, 'rotation-source.xlsx');
          writeFileSync(cachePath, buf);
          const schedule = await parseServiceRotationXlsx(buf, meta.name || 'rotation.xlsx');
          const outDir = resolveServiceRotationTemplateDir();
          const { id } = await writeServiceRotationScheduleFiles(schedule, outDir);
          state.rotation = {
            modifiedTime: meta.modifiedTime,
            md5Checksum: meta.md5Checksum ?? md5Hex(buf),
            name: meta.name,
            lastSyncedAt: new Date().toISOString(),
            lastError: null,
          };
          rotationUpdated = true;
          log?.info(
            { fileId: rotationId, scheduleId: id, weeks: schedule.weeks.length },
            'drive rotation synced',
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        state.rotation = { ...state.rotation, lastError: msg };
        state.lastError = msg;
        log?.error({ err: e }, 'drive rotation sync failed');
      }
    }

    const birthdayId = env.BULLETIN_DRIVE_BIRTHDAY_PPTX_FILE_ID?.trim();
    if (birthdayId) {
      try {
        const meta = await client.getFileMeta(birthdayId);
        if (!force && fileUnchanged(meta, state.birthday)) {
          log?.info({ fileId: birthdayId, modifiedTime: meta.modifiedTime }, 'drive birthday unchanged');
        } else {
          const buf = await client.downloadFile(birthdayId);
          writeFileSync(join(dataDir, 'birthday-source.pptx'), buf);
          const libraryDir = resolveBirthdayMonthLibraryDir();
          const results = await importBirthdayMonthsFromJanDecPptx(buf, libraryDir);
          state.birthday = {
            modifiedTime: meta.modifiedTime,
            md5Checksum: meta.md5Checksum ?? md5Hex(buf),
            name: meta.name,
            lastSyncedAt: new Date().toISOString(),
            lastError: null,
          };
          birthdayUpdated = true;
          log?.info(
            { fileId: birthdayId, months: results.length },
            'drive birthday synced',
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        state.birthday = { ...state.birthday, lastError: msg };
        state.lastError = msg;
        log?.error({ err: e }, 'drive birthday sync failed');
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    state.lastError = msg;
    log?.error({ err: e }, 'drive sync failed');
  }

  writeBulletinDriveSyncState(state, dataDir);
  return {
    skipped: false,
    rotationUpdated,
    birthdayUpdated,
    state,
  };
}

export function startBulletinDriveSyncScheduler(opts: {
  env: ApiEnv;
  log: Logger;
}): { stop: () => void; runNow: (force?: boolean) => Promise<BulletinDriveSyncResult> } {
  const intervalMs = opts.env.BULLETIN_DRIVE_SYNC_INTERVAL_MS;
  let timer: ReturnType<typeof setInterval> | null = null;

  const runNow = (force = false) =>
    runBulletinDriveSync({ env: opts.env, log: opts.log, force });

  if (isBulletinDriveSyncConfigured(opts.env)) {
    void runNow(false).catch((err) => opts.log.error({ err }, 'drive sync startup failed'));
    timer = setInterval(() => {
      void runNow(false).catch((err) => opts.log.error({ err }, 'drive sync tick failed'));
    }, intervalMs);
    opts.log.info({ intervalMs }, 'bulletin drive sync scheduler started');
  }
  // Drive 未配置时静默跳过（可选能力，不刷日志）

  return {
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
    runNow,
  };
}
