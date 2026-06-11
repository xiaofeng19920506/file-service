export declare function signAdminToken(opts: {
    secret: string;
    expiresAtUnix: number;
}): string;
export declare function verifyAdminToken(opts: {
    secret: string;
    token: string;
    nowUnix?: number;
}): {
    expiresAtUnix: number;
} | null;
//# sourceMappingURL=admin-token.d.ts.map