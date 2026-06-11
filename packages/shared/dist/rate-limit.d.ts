/** 是否跳过全局限流（健康检查、静态资源） */
export declare function shouldSkipRateLimit(method: string, path: string): boolean;
/** 上传相关路径使用更严格的限流 */
export declare function isUploadRateLimitPath(method: string, path: string): boolean;
//# sourceMappingURL=rate-limit.d.ts.map