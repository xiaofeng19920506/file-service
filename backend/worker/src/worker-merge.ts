import { loadEnvFile } from '@file-service/shared';
loadEnvFile();

import { startMergeWorker } from './merge-worker.js';

async function main() {
  await startMergeWorker();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
