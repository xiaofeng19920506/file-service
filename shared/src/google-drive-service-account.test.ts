import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  GoogleDriveServiceAccountClient,
  createServiceAccountJwt,
  loadGoogleServiceAccountCredentials,
} from './google-drive-service-account.js';

function testCredentials() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    client_email: 'sync@test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey,
  };
}

describe('google-drive-service-account', () => {
  it('parses credentials from JSON string', () => {
    const { client_email, private_key } = testCredentials();
    const loaded = loadGoogleServiceAccountCredentials(
      JSON.stringify({ client_email, private_key }),
    );
    expect(loaded.client_email).toBe(client_email);
    expect(loaded.private_key).toContain('BEGIN PRIVATE KEY');
  });

  it('creates RS256 JWT with three segments', () => {
    const creds = testCredentials();
    const jwt = createServiceAccountJwt(creds, 1_700_000_000);
    expect(jwt.split('.')).toHaveLength(3);
  });

  it('getFileMeta uses access token', async () => {
    const creds = testCredentials();
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('oauth2.googleapis.com/token')) {
        return new Response(
          JSON.stringify({ access_token: 'tok-1', expires_in: 3600, token_type: 'Bearer' }),
          { status: 200 },
        );
      }
      if (u.includes('/drive/v3/files/file-abc')) {
        expect(init?.headers).toMatchObject({ Authorization: 'Bearer tok-1' });
        return new Response(
          JSON.stringify({
            id: 'file-abc',
            name: 'rotation.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            modifiedTime: '2026-08-01T12:00:00.000Z',
            md5Checksum: 'abc',
          }),
          { status: 200 },
        );
      }
      return new Response('unexpected', { status: 500 });
    }) as unknown as typeof fetch;

    const client = new GoogleDriveServiceAccountClient(creds, fetchImpl);
    const meta = await client.getFileMeta('file-abc');
    expect(meta.modifiedTime).toBe('2026-08-01T12:00:00.000Z');
    expect(meta.md5Checksum).toBe('abc');
  });
});
