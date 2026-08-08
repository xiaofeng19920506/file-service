/**
 * Google Drive 服务账号只读客户端（JWT → access token，无官方 SDK）。
 */
import { createSign, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type GoogleServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export type DriveFileMeta = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  md5Checksum?: string;
};

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/** 从文件路径或整段 JSON 字符串解析服务账号凭据 */
export function loadGoogleServiceAccountCredentials(
  jsonOrPath: string,
): GoogleServiceAccountCredentials {
  const raw = jsonOrPath.trim();
  let text = raw;
  if (!raw.startsWith('{')) {
    text = readFileSync(raw, 'utf8');
  }
  const parsed = JSON.parse(text) as Partial<GoogleServiceAccountCredentials>;
  const clientEmail = parsed.client_email?.trim();
  const privateKey = parsed.private_key?.replace(/\\n/g, '\n')?.trim();
  if (!clientEmail || !privateKey) {
    throw new Error('invalid_service_account_json');
  }
  return {
    client_email: clientEmail,
    private_key: privateKey,
    token_uri: parsed.token_uri,
  };
}

export function createServiceAccountJwt(
  credentials: GoogleServiceAccountCredentials,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  const header = b64urlJson({ alg: 'RS256', typ: 'JWT' });
  const claim = b64urlJson({
    iss: credentials.client_email,
    scope: DRIVE_SCOPE,
    aud: credentials.token_uri?.trim() || TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  });
  const unsigned = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(credentials.private_key, 'base64url');
  return `${unsigned}.${signature}`;
}

export async function fetchServiceAccountAccessToken(
  credentials: GoogleServiceAccountCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresIn: number }> {
  const assertion = createServiceAccountJwt(credentials);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const res = await fetchImpl(credentials.token_uri?.trim() || TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`drive_token_failed:${res.status}:${text.slice(0, 200)}`);
  }
  const data = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('drive_token_missing');
  return {
    accessToken: data.access_token,
    expiresIn: Number(data.expires_in) || 3600,
  };
}

export class GoogleDriveServiceAccountClient {
  private tokenCache: CachedToken | null = null;

  constructor(
    private readonly credentials: GoogleServiceAccountCredentials,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  static fromJsonOrPath(
    jsonOrPath: string,
    fetchImpl: typeof fetch = fetch,
  ): GoogleDriveServiceAccountClient {
    return new GoogleDriveServiceAccountClient(
      loadGoogleServiceAccountCredentials(jsonOrPath),
      fetchImpl,
    );
  }

  private async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAtMs > now + 60_000) {
      return this.tokenCache.accessToken;
    }
    const { accessToken, expiresIn } = await fetchServiceAccountAccessToken(
      this.credentials,
      this.fetchImpl,
    );
    this.tokenCache = {
      accessToken,
      expiresAtMs: now + expiresIn * 1000,
    };
    return accessToken;
  }

  async getFileMeta(fileId: string): Promise<DriveFileMeta> {
    const token = await this.accessToken();
    const fields = 'id,name,mimeType,modifiedTime,md5Checksum';
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`;
    const res = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`drive_meta_failed:${res.status}:${text.slice(0, 200)}`);
    }
    const data = JSON.parse(text) as Partial<DriveFileMeta>;
    if (!data.id || !data.modifiedTime) {
      throw new Error('drive_meta_invalid');
    }
    return {
      id: data.id,
      name: data.name ?? '',
      mimeType: data.mimeType ?? '',
      modifiedTime: data.modifiedTime,
      md5Checksum: data.md5Checksum,
    };
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const token = await this.accessToken();
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
    const res = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`drive_download_failed:${res.status}:${text.slice(0, 200)}`);
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }
}

/** 便于测试：内容指纹 */
export function md5Hex(buf: Buffer | string): string {
  return createHash('md5').update(buf).digest('hex');
}
