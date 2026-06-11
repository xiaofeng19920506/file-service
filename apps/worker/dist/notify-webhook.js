import { dispatchJobWebhook, mergeJobs } from '@file-service/shared';
import { eq } from 'drizzle-orm';
export async function notifyJobWebhook(db, jobId, event, webhookSecret) {
    const [job] = await db.select().from(mergeJobs).where(eq(mergeJobs.id, jobId));
    if (!job?.webhookUrl)
        return;
    await dispatchJobWebhook(job.webhookUrl, {
        event,
        jobId: job.id,
        status: event === 'job.succeeded' ? 'succeeded' : 'failed',
        progress: job.progress ?? 0,
        errorCode: job.errorCode,
        errorDetail: job.errorDetail,
        completedAt: job.completedAt?.toISOString() ?? null,
        expiresAt: job.expiresAt?.toISOString() ?? null,
    }, webhookSecret);
}
//# sourceMappingURL=notify-webhook.js.map