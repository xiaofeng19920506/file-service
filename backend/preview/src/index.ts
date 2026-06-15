import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportPptxSlidePng, loadPreviewEnv } from '@file-service/shared';
import Fastify from 'fastify';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const env = loadPreviewEnv();
const app = Fastify({ logger: true, bodyLimit: 64 * 1024 * 1024 });

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
    const pngPath = await exportPptxSlidePng({
      sofficePath: env.SOFFICE_PATH,
      inputPath: pptxPath,
      outDir: workRoot,
      slideNumber,
    });
    const pngBuf = await readFile(pngPath);
    return reply.header('Content-Type', 'image/png').send(pngBuf);
  } catch (err) {
    request.log.warn({ err, slideNumber }, 'libreoffice slide render failed');
    return reply.code(503).send({ error: 'slide_render_failed' });
  } finally {
    await rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
  }
});

await app.listen({ port: env.PORT, host: '0.0.0.0' });
