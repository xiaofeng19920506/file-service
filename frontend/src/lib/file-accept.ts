export const ACCEPT =
  '.pptx,.ppt,.pps,.pot,.odp,.ppsx,.potx,.fodp,.otp,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,application/vnd.oasis.opendocument.presentation';

export const ACCEPT_EXT = /\.(pptx|ppt|pps|pot|odp|ppsx|potx|fodp|otp)$/i;

export const ACCEPT_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.oasis.opendocument.presentation',
]);

export function isAcceptedFile(file: File): boolean {
  if (ACCEPT_EXT.test(file.name)) return true;
  return !!file.type && ACCEPT_MIMES.has(file.type);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
