/** 默认分片大小 5MB */
export const DEFAULT_UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024;

/** 超过此大小走分片上传（8MB） */
export const CHUNKED_UPLOAD_MIN_BYTES = 8 * 1024 * 1024;

export const UPLOAD_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
