import { DEFAULT_METADATA, type UploadMetadata } from '../hooks/useMergeWorkspace';

export type PendingUploadEntry = {
  id: string;
  file: File;
  metadata: UploadMetadata;
};

export function createPendingUploadEntries(files: File[]): PendingUploadEntry[] {
  return files.map((file) => ({
    id: crypto.randomUUID(),
    file,
    metadata: { ...DEFAULT_METADATA },
  }));
}
