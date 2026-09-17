/* 已缓存的完整 MP3：拦截 Range 从本机切片；未命中：透传网络，不阻塞首播/切歌 */
const SW_CACHE = 'heard-audio-sw-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function cacheKeyFor(videoId) {
  return new Request(`https://heard-audio.local/${encodeURIComponent(videoId)}`);
}

function parseRange(rangeHeader, size) {
  const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader || '');
  if (!m) return null;
  let start = m[1] === '' ? NaN : Number(m[1]);
  let end = m[2] === '' ? NaN : Number(m[2]);
  if (Number.isNaN(start)) {
    if (Number.isNaN(end)) return null;
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (Number.isNaN(end)) {
    end = size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= size || start > end) {
    return null;
  }
  return { start, end };
}

async function respondFromCachedFull(full, rangeHeader) {
  if (!rangeHeader) return full.clone();
  const buf = await full.clone().arrayBuffer();
  const size = buf.byteLength;
  const range = parseRange(rangeHeader, size);
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` },
    });
  }
  const slice = buf.slice(range.start, range.end + 1);
  const contentType = full.headers.get('content-type') || 'audio/mpeg';
  return new Response(slice, {
    status: 206,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(slice.byteLength),
      'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=31536000',
    },
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  const match = url.pathname.match(/\/v1\/youtube\/videos\/([^/]+)\/audio\/stream\/?$/);
  if (!match) return;

  const videoId = decodeURIComponent(match[1]);
  const rangeHeader = request.headers.get('range');

  event.respondWith(
    (async () => {
      try {
        const cache = await caches.open(SW_CACHE);
        const hit = await cache.match(cacheKeyFor(videoId));
        if (hit && hit.ok) {
          return respondFromCachedFull(hit, rangeHeader);
        }
      } catch {
        /* fall through to network */
      }

      // 未命中：直接透传（含 Range），避免等整首下完才开始播/切歌
      return fetch(request);
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'CLEAR_HEARD_AUDIO') return;
  event.waitUntil(caches.delete(SW_CACHE));
});
