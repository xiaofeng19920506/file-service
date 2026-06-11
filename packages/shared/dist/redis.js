/** BullMQ 连接配置（避免直接传入 ioredis 实例时的 duplicate 类型冲突） */
export function bullmqConnection(redisUrl) {
    const u = new URL(redisUrl);
    return {
        host: u.hostname,
        port: u.port ? Number(u.port) : 6379,
        ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
        ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
        maxRetriesPerRequest: null,
    };
}
//# sourceMappingURL=redis.js.map