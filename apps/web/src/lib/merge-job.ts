import { createJob, getDownloadUrl, getJob } from '../api/client';

function normalizeDownloadUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    if (u.pathname.startsWith('/v1/')) return `${u.pathname}${u.search}`;
  } catch {
    /* keep original */
  }
  return url;
}

export function triggerFileDownload(url: string, filename = 'merged.pptx') {
  const anchor = document.createElement('a');
  anchor.href = normalizeDownloadUrl(url);
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function waitForMergeJob(jobId: string) {
  let job = await getJob(jobId);
  while (job.status === 'queued' || job.status === 'running') {
    await new Promise((resolve) => window.setTimeout(resolve, 800));
    job = await getJob(jobId);
  }
  return job;
}

export async function mergeBlobIdsAndGetDownloadUrl(blobIds: string[]) {
  const { jobId } = await createJob(
    blobIds.map((blobId, order) => ({ blobId, order })),
  );
  const job = await waitForMergeJob(jobId);
  if (job.status === 'failed') {
    throw new Error(job.errorCode ?? 'merge_failed');
  }
  const { url } = await getDownloadUrl(jobId);
  return { jobId, url };
}
