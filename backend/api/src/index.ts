import { loadEnvFile } from '@file-service/shared';
loadEnvFile();

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { Queue } from 'bullmq';
import {
  createDb,
  loadApiEnv,
  runMigrations,
  createObjectStorage,
  YOUTUBE_AUDIO_QUEUE_NAME,
  YOUTUBE_LYRICS_QUEUE_NAME,
  bullmqConnection,
  loadApiKeyConfig,
} from '@file-service/shared';
import { registerStaticAssets } from './static.js';
import { registerRateLimiting } from './rate-limit.js';
import { registerHealthRoutes } from './health.js';
import { registerOpenApi } from './openapi.js';
import { registerAuthRoutes } from './auth.js';
import { ensureBootstrapAdmin } from './bootstrap-admin.js';
import { registerAdminUserRoutes } from './admin-users.js';
import { registerAdminDownloadRoutes } from './admin-downloads.js';
import { registerPlaylistRoutes } from './playlists.js';
import { registerYoutubeCaptionRoutes } from './youtube-captions.js';
import { registerYoutubeAudioRoutes } from './youtube-audio.js';
import { registerYoutubeOAuthRoutes } from './youtube-oauth.js';
import { registerYoutubeSearchRoutes } from './youtube-search.js';
import { registerYoutubeTrendingRoutes } from './youtube-trending.js';

async function buildApp() {
  const env = loadApiEnv();

  if (process.env.RUN_MIGRATIONS !== '0') {
    await runMigrations(env.DATABASE_URL);
  }

  const db = createDb(env.DATABASE_URL);
  await ensureBootstrapAdmin(db, env);
  const storage = createObjectStorage(env);
  await storage.ensureReady();

  const audioQueue = new Queue(YOUTUBE_AUDIO_QUEUE_NAME, {
    connection: bullmqConnection(env.REDIS_URL),
  });
  const lyricsQueue = new Queue(YOUTUBE_LYRICS_QUEUE_NAME, {
    connection: bullmqConnection(env.REDIS_URL),
  });

  const app = Fastify({ logger: true });

  if (process.env.ENABLE_OPENAPI === '1' || process.env.NODE_ENV !== 'production') {
    await registerOpenApi(app);
  }

  const corsOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean) ?? [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];
  await app.register(cors, {
    origin: corsOrigins,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Client'],
  });
  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
    },
    attachFieldsToBody: true,
  });

  await registerRateLimiting(app, env);

  const apiKeyConfig = loadApiKeyConfig(env.API_KEY);
  registerAuthRoutes(app, { db, env, apiKeyConfig });
  registerAdminUserRoutes(app, { db });
  registerAdminDownloadRoutes(app, { db, env, storage, audioQueue });
  registerPlaylistRoutes(app, { db, env, audioQueue });
  registerYoutubeCaptionRoutes(app, { db, lyricsQueue });
  registerYoutubeAudioRoutes(app, { db, env, storage, audioQueue });
  registerYoutubeOAuthRoutes(app, { db, env });
  registerYoutubeSearchRoutes(app, { db, env });
  registerYoutubeTrendingRoutes(app, { db });

  registerHealthRoutes(app, { db, redisUrl: env.REDIS_URL });

  await registerStaticAssets(app);

  return app;
}

async function main() {
  const app = await buildApp();
  const env = loadApiEnv();
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

export default buildApp;

if (!process.env.VERCEL) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
