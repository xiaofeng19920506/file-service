import { loadEnvFile } from '@file-service/shared';
loadEnvFile();

import { startYoutubeAudioWorker } from './youtube-audio-worker.js';

async function main() {
  await startYoutubeAudioWorker();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
