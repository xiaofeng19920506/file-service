export type ApiKeyConfig = {
    /** 未设置 API_KEY 时不校验 */
    required: boolean;
    key: string | undefined;
};
export declare function loadApiKeyConfig(apiKey: string | undefined): ApiKeyConfig;
export declare function extractApiKeyFromHeaders(headers: {
    authorization?: string;
    'x-api-key'?: string | string[];
}): string | undefined;
export declare function verifyApiKey(provided: string | undefined, config: ApiKeyConfig): boolean;
export declare function matchesApiKey(provided: string | undefined, config: ApiKeyConfig): boolean;
/** 无需登录的路径（健康检查、登录注册、签名下载、游客浏览诗库等） */
export declare function isPublicApiPath(method: string, path: string): boolean;
//# sourceMappingURL=api-key.d.ts.map