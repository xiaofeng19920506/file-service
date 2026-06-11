export function blobStorageKey(contentSha256Hex) {
    const prefix = contentSha256Hex.slice(0, 2);
    return `blobs/${prefix}/${contentSha256Hex}`;
}
export function exportStorageKey(jobId) {
    return `exports/${jobId}.pptx`;
}
//# sourceMappingURL=keys.js.map