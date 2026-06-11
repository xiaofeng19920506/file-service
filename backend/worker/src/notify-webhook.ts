import type { Db } from '@file-service/shared';
import { dispatchJobWebhook, mergeJobs, type JobWebhookEvent } from '@file-service/shared';
import { eq } from 'drizzle-orm';

export async function notifyJobWebhook(
  db: Db,
  jobId: string,
  event: JobWebhookEvent,
  webhookSecret?: string,
): Promise<void> {
  const [job] = await db.select().from(mergeJobs).where(eq(mergeJobs.id, jobId));
  if (!job?.webhookUrl) return;

  await dispatchJobWebhook(
    job.webhookUrl,
    {
      event,
      jobId: job.id,
      status: event === 'job.succeeded' ? 'succeeded' : 'failed',
      progress: job.progress ?? 0,
      errorCode: job.errorCode,
      errorDetail: job.errorDetail,
      completedAt: job.completedAt?.toISOString() ?? null,
      expiresAt: job.expiresAt?.toISOString() ?? null,
    },
    webhookSecret,
  );
}
