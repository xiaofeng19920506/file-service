import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportPptxSlidePng, exportPptxToPdf, loadPreviewEnv } from '@file-service/shared';
import Fastify from 'fastify';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const env = loadPreviewEnv();
const app = Fastify({ logger: true, bodyLimit: 64 * 1024 * 1024 });

/** LibreOffice 不支持并发；串行化转换 */
let loChain: Promise<unknown> = Promise.resolve();

function withLibreOfficeLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = loChain.then(fn, fn);
  loChain = run.catch(() => undefined);
  return run;
}

/** 按 PPTX 内容缓存 PDF，避免全 deck 预览时重复转换 */
const pdfCache = new Map<string, Buffer>();
const PDF_CACHE_MAX = 8;
/** 按 PPTX+页码缓存 PNG，同页重复请求直接命中 */
const pngCache = new Map<string, Buffer>();
const PNG_CACHE_MAX = 256;

function pptxCacheKey(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function rememberPdf(key: string, pdf: Buffer): void {
  pdfCache.set(key, pdf);
  if (pdfCache.size > PDF_CACHE_MAX) {
    const oldest = pdfCache.keys().next().value;
    if (oldest) pdfCache.delete(oldest);
  }
}

function rememberPng(key: string, png: Buffer): void {
  if (pngCache.has(key)) pngCache.delete(key);
  pngCache.set(key, png);
  while (pngCache.size > PNG_CACHE_MAX) {
    const oldest = pngCache.keys().next().value;
    if (oldest == null) break;
    pngCache.delete(oldest);
  }
}

for (const mime of [PPTX_MIME, 'application/octet-stream']) {
  app.addContentTypeParser(mime, { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });
}

app.get('/health', async () => ({ ok: true }));

app.post<{ Querystring: { slide?: string } }>('/render-slide.png', async (request, reply) => {
  const slideNumber = Number.parseInt(request.query.slide ?? '1', 10);
  if (!Number.isFinite(slideNumber) || slideNumber < 1) {
    return reply.code(400).send({ error: 'invalid_slide' });
  }

  const pptxBuf = request.body;
  if (!Buffer.isBuffer(pptxBuf) || pptxBuf.length === 0) {
    return reply.code(400).send({ error: 'missing_pptx_body' });
  }

  const workRoot = await mkdtemp(join(tmpdir(), 'fs-lo-preview-'));
  try {
    const pptxPath = join(workRoot, 'input.pptx');
    await writeFile(pptxPath, pptxBuf);
    const cacheKey = pptxCacheKey(pptxBuf);
    const pageCacheKey = `${cacheKey}:${slideNumber}`;
    const cachedPng = pngCache.get(pageCacheKey);
    if (cachedPng) {
      return reply.header('Content-Type', 'image/png').header('X-Preview-Cached', 'png').send(cachedPng);
    }

    const pngPath = await withLibreOfficeLock(async () => {
      // 整份 PPTX 只转一次 PDF，后续页用 pdftoppm（秒开）
      let pdfPath: string;
      const cachedPdf = pdfCache.get(cacheKey);
      if (cachedPdf) {
        pdfPath = join(workRoot, 'cached.pdf');
        await writeFile(pdfPath, cachedPdf);
      } else {
        pdfPath = await exportPptxToPdf({
          sofficePath: env.SOFFICE_PATH,
          inputPath: pptxPath,
          outDir: workRoot,
        });
        rememberPdf(cacheKey, await readFile(pdfPath));
      }

      return exportPptxSlidePng({
        sofficePath: env.SOFFICE_PATH,
        inputPath: pptxPath,
        outDir: workRoot,
        slideNumber,
        pdfPath,
      });
    });

    const pngBuf = await readFile(pngPath);
    rememberPng(pageCacheKey, pngBuf);
    return reply.header('Content-Type', 'image/png').send(pngBuf);
  } catch (err) {
    request.log.warn({ err, slideNumber }, 'libreoffice slide render failed');
    return reply.code(503).send({ error: 'slide_render_failed' });
  } finally {
    await rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
  }
});

await app.listen({ port: env.PORT, host: '0.0.0.0' });
