import { loadEnvFile } from '@file-service/shared';
loadEnvFile();

import { startYoutubeAudioWorker } from './youtube-audio-worker.js';
import { startYoutubeLyricsWorker } from './youtube-lyrics-worker.js';

async function main() {
  await Promise.all([startYoutubeAudioWorker(), startYoutubeLyricsWorker()]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
