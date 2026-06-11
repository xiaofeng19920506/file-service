export type JobWebhookEvent = 'job.succeeded' | 'job.failed';
export type JobWebhookPayload = {
    event: JobWebhookEvent;
    jobId: string;
    status: 'succeeded' | 'failed';
    progress: number;
    errorCode?: string | null;
    errorDetail?: string | null;
    completedAt?: string | null;
    expiresAt?: string | null;
};
export declare function signWebhookBody(body: string, secret: string): string;
export declare function verifyWebhookSignature(body: string, signature: string | undefined, secret: string): boolean;
/** POST JSON 到 webhook URL；可选 HMAC 签名 */
export declare function dispatchJobWebhook(url: string, payload: JobWebhookPayload, secret?: string): Promise<void>;
//# sourceMappingURL=webhook.d.ts.map