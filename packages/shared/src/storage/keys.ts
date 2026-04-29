export function blobStorageKey(contentSha256Hex: string): string {
  const prefix = contentSha256Hex.slice(0, 2);
  return `blobs/${prefix}/${contentSha256Hex}`;
}

export function exportStorageKey(jobId: string): string {
  return `exports/${jobId}.pptx`;
}
