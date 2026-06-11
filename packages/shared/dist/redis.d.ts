/** BullMQ 连接配置（避免直接传入 ioredis 实例时的 duplicate 类型冲突） */
export declare function bullmqConnection(redisUrl: string): {
    maxRetriesPerRequest: null;
    password?: string | undefined;
    username?: string | undefined;
    host: string;
    port: number;
};
//# sourceMappingURL=redis.d.ts.map