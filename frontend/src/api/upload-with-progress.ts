import { apiHeaders, parseJson } from './http';

export type UploadProgress = {
  loaded: number;
  total: number;
  percent: number;
};

const base = process.env.NEXT_PUBLIC_API_URL ?? '';

function resolveUrl(path: string): string {
  return path.startsWith('http') ? path : `${base}${path}`;
}

/** 带上传进度的 FormData POST（用于小文件直传） */
export function postFormWithProgress(
  path: string,
  form: FormData,
  onProgress?: (p: UploadProgress) => void,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', resolveUrl(path));

    const headers = apiHeaders();
    headers.forEach((value, key) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.upload.addEventListener('progress', (e) => {
      if (!e.lengthComputable || !onProgress) return;
      onProgress({
        loaded: e.loaded,
        total: e.total,
        percent: Math.min(100, Math.round((e.loaded / e.total) * 100)),
      });
    });

    xhr.addEventListener('load', () => {
      resolve(
        new Response(xhr.responseText, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: { 'Content-Type': xhr.getResponseHeader('Content-Type') ?? 'application/json' },
        }),
      );
    });

    xhr.addEventListener('error', () => reject(new Error('network_error')));
    xhr.addEventListener('abort', () => reject(new Error('upload_aborted')));
    xhr.send(form);
  });
}

export { parseJson };
