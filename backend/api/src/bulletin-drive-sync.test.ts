import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '@file-service/shared';
import { runBulletinDriveSync } from './bulletin-drive-sync.js';

function saJson() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return JSON.stringify({
    client_email: 'sync@test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  });
}

function baseEnv(over: Partial<ApiEnv> = {}): ApiEnv {
  return {
    STORAGE_BACKEND: 'fs',
    LOCAL_STORAGE_DIR: '/tmp/fs-test',
    DATABASE_URL: 'postgres://x',
    REDIS_URL: 'redis://x',
    EXPORT_RETENTION_DAYS: 7,
    DOWNLOAD_HMAC_SECRET: '0123456789abcdef',
    DOWNLOAD_URL_TTL_SECONDS: 3600,
    PORT: 3000,
    MAX_UPLOAD_MB: 200,
    RATE_LIMIT_MAX: 120,
    RATE_LIMIT_WINDOW_MS: 60_000,
    RATE_LIMIT_UPLOAD_MAX: 30,
    SOFFICE_PATH: 'soffice',
    AUTH_REQUIRED: true,
    USER_SESSION_TTL_SECONDS: 1000,
    SHARE_LINK_TTL_SECONDS: 604_800,
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    YT_DLP_PATH: 'yt-dlp',
    BULLETIN_DRIVE_SYNC_INTERVAL_MS: 21_600_000,
    GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: saJson(),
    BULLETIN_DRIVE_ROTATION_FILE_ID: 'rot-id',
    ...over,
  } as ApiEnv;
}

describe('bulletin-drive-sync', () => {
  it('skips download when modifiedTime matches state', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'drive-sync-'));
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, 'sync-state.json'),
      JSON.stringify({
        configured: true,
        rotation: {
          modifiedTime: '2026-08-01T12:00:00.000Z',
          md5Checksum: 'same',
          lastSyncedAt: '2026-08-01T12:01:00.000Z',
        },
        birthday: {},
      }),
    );

    let downloaded = false;
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('oauth2.googleapis.com/token')) {
        return new Response(
          JSON.stringify({ access_token: 't', expires_in: 3600, token_type: 'Bearer' }),
          { status: 200 },
        );
      }
      if (u.includes('alt=media')) {
        downloaded = true;
        return new Response(Buffer.from('xlsx'), { status: 200 });
      }
      if (u.includes('/drive/v3/files/rot-id')) {
        return new Response(
          JSON.stringify({
            id: 'rot-id',
            name: 'rotation.xlsx',
            mimeType: 'application/vnd.ms-excel',
            modifiedTime: '2026-08-01T12:00:00.000Z',
            md5Checksum: 'same',
          }),
          { status: 200 },
        );
      }
      return new Response('no', { status: 404 });
    }) as unknown as typeof fetch;

    try {
      const result = await runBulletinDriveSync({
        env: baseEnv({ BULLETIN_DRIVE_BIRTHDAY_PPTX_FILE_ID: undefined }),
        dataDir,
        fetchImpl,
        force: false,
      });
      expect(downloaded).toBe(false);
      expect(result.rotationUpdated).toBe(false);
      expect(result.skipped).toBe(false);
      const state = JSON.parse(readFileSync(join(dataDir, 'sync-state.json'), 'utf8'));
      expect(state.rotation.modifiedTime).toBe('2026-08-01T12:00:00.000Z');
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('returns not_configured when env missing', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'drive-sync-'));
    try {
      const result = await runBulletinDriveSync({
        env: baseEnv({
          GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: undefined,
          BULLETIN_DRIVE_ROTATION_FILE_ID: undefined,
        }),
        dataDir,
      });
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('not_configured');
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
