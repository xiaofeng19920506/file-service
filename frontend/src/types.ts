export type MetadataField =
  | 'titleEn'
  | 'titleZhCn'
  | 'titleZhTw'
  | 'composer'
  | 'author'
  | 'notes';

export type MetadataConflict = {
  field: MetadataField;
  existing: string;
  incoming: string;
};

export type MetadataSnapshot = {
  titleEn: string | null;
  titleZhCn: string | null;
  titleZhTw: string | null;
  composer: string | null;
  author: string | null;
  notes: string | null;
};

export type UploadResult = {
  blobId: string;
  sha256: string;
  deduplicated: boolean;
  metadataUpdated?: boolean;
  metadataFilled?: MetadataField[];
  metadataConflicts?: MetadataConflict[];
  existingMetadata?: MetadataSnapshot | null;
};

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'expired';

export type JobResponse = {
  jobId: string;
  status: JobStatus;
  progress: number;
  errorCode: string | null;
  errorDetail: string | null;
  expiresAt: string | null;
  outputKey: string | null;
  inputs: { blobId: string; sortOrder: number }[];
};

export type BlobRecord = {
  id: string;
  contentSha256?: string;
  originalFilename: string | null;
  title?: string | null;
  titleEn?: string | null;
  titleZhCn?: string | null;
  titleZhTw?: string | null;
  composer: string | null;
  author: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt?: string | null;
  uploadedBy?: string | null;
  updatedBy?: string | null;
  sizeBytes: number;
  mimeType: string | null;
};

export type UploadedItem = {
  id: string;
  file: File;
  blobId: string;
  sha256: string;
  deduplicated: boolean;
  title?: string;
  titleEn?: string;
  titleZhCn?: string;
  titleZhTw?: string;
  composer?: string;
  author?: string;
  notes?: string;
  originalFilename?: string;
  status: 'queued' | 'uploading' | 'done' | 'error';
  progress?: number;
  error?: string;
};
