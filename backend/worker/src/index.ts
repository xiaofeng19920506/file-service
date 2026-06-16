import { loadEnvFile } from '@file-service/shared';
loadEnvFile();

import { startMergeWorker } from './merge-worker.js';
import { startYoutubeAudioWorker } from './youtube-audio-worker.js';
import { startYoutubeVideoWorker } from './youtube-video-worker.js';

async function main() {
  await startMergeWorker();
  await startYoutubeAudioWorker();
  await startYoutubeVideoWorker();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
