import type { PendingUploadEntry } from './pending-upload';

let draft: PendingUploadEntry[] | null = null;

export function setUploadDraft(entries: PendingUploadEntry[]): void {
  draft = entries;
}

export function getUploadDraft(): PendingUploadEntry[] | null {
  return draft;
}

export function clearUploadDraft(): void {
  draft = null;
}
