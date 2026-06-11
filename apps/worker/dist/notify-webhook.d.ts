import type { Db } from '@file-service/shared';
import { type JobWebhookEvent } from '@file-service/shared';
export declare function notifyJobWebhook(db: Db, jobId: string, event: JobWebhookEvent, webhookSecret?: string): Promise<void>;
//# sourceMappingURL=notify-webhook.d.ts.map