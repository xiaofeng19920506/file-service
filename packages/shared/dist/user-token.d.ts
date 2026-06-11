import type { UserRole } from './permissions.js';
export type UserSessionClaims = {
    userId: string;
    email: string;
    role: UserRole;
    expiresAtUnix: number;
};
export declare function signUserToken(opts: {
    secret: string;
    userId: string;
    email: string;
    role: UserRole;
    expiresAtUnix: number;
}): string;
export declare function verifyUserToken(opts: {
    secret: string;
    token: string;
    nowUnix?: number;
}): UserSessionClaims | null;
//# sourceMappingURL=user-token.d.ts.map