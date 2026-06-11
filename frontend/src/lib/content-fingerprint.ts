/** Short display form of a SHA-256 content hash (content-based identity, not filename). */
export function formatContentFingerprint(sha256: string): string {
  return sha256.slice(0, 12).toUpperCase();
}
