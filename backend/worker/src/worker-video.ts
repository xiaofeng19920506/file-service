import { loadEnvFile } from '@file-service/shared';
loadEnvFile();

import { startYoutubeVideoWorker } from './youtube-video-worker.js';

async function main() {
  await startYoutubeVideoWorker();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
