/* 播放时只完整拉一次 MP3，写入本机 Cache，再按需返回 Range — 省流量 */
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
    // suffix: bytes=-N
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

async function getOrFetchFull(videoId, request) {
  const cache = await caches.open(SW_CACHE);
  const hit = await cache.match(cacheKeyFor(videoId));
  if (hit && hit.ok) return hit;

  const fullReq = new Request(request.url, {
    method: 'GET',
    credentials: request.credentials,
    headers: {
      Accept: request.headers.get('Accept') || '*/*',
    },
  });
  const fullRes = await fetch(fullReq);
  if (!fullRes.ok) return fullRes;

  const contentType = fullRes.headers.get('content-type') || 'audio/mpeg';
  const buf = await fullRes.arrayBuffer();
  if (buf.byteLength < 1024) {
    return new Response(buf, {
      status: fullRes.status,
      headers: { 'Content-Type': contentType },
    });
  }

  const stored = new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buf.byteLength),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=31536000',
    },
  });
  await cache.put(cacheKeyFor(videoId), stored.clone());
  return stored;
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

  event.respondWith(
    (async () => {
      const full = await getOrFetchFull(videoId, request);
      if (!full.ok) return full;

      const rangeHeader = request.headers.get('range');
      if (!rangeHeader) {
        return full.clone();
      }

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
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'CLEAR_HEARD_AUDIO') return;
  event.waitUntil(caches.delete(SW_CACHE));
});
