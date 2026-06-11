export declare function signDownloadToken(opts: {
    secret: string;
    jobId: string;
    expiresAtUnix: number;
}): string;
export declare function verifyDownloadToken(opts: {
    secret: string;
    token: string;
    nowUnix?: number;
}): {
    jobId: string;
    expiresAtUnix: number;
} | null;
//# sourceMappingURL=download-token.d.ts.map