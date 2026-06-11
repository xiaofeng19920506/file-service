import type { FastifyRequest } from 'fastify';
export declare function readMultipartTextField(request: FastifyRequest, fieldName: string): string | null;
export declare function readUploadMetadata(request: FastifyRequest): {
    title: string | null;
    titleEn: string | null;
    titleZhCn: string | null;
    titleZhTw: string | null;
    composer: string | null;
    author: string | null;
    notes: string | null;
};
/** Read an uploaded file field; supports attachFieldsToBody and classic request.file(). */
export declare function readMultipartFileBuffer(request: FastifyRequest, fieldName: string): Promise<{
    buffer: Buffer;
    filename: string;
    mimetype: string;
} | null>;
//# sourceMappingURL=multipart-read.d.ts.map