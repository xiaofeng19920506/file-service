import { canonicalSongTitle, type SongTitleFields } from '@file-service/shared';

export type MetadataField =
  | 'titleEn'
  | 'titleZhCn'
  | 'titleZhTw'
  | 'composer'
  | 'author'
  | 'notes';

export type BlobMetadataInput = {
  /** @deprecated legacy single title — mapped to titleZhCn when empty */
  title?: string | null;
  titleEn?: string | null;
  titleZhCn?: string | null;
  titleZhTw?: string | null;
  composer?: string | null;
  author?: string | null;
  notes?: string | null;
};

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

const METADATA_FIELDS: MetadataField[] = [
  'titleEn',
  'titleZhCn',
  'titleZhTw',
  'composer',
  'author',
  'notes',
];

function norm(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function normalizeMetadataInput(input: BlobMetadataInput): MetadataSnapshot {
  const legacyTitle = norm(input.title);
  return {
    titleEn: norm(input.titleEn),
    titleZhCn: norm(input.titleZhCn) ?? legacyTitle,
    titleZhTw: norm(input.titleZhTw),
    composer: norm(input.composer),
    author: norm(input.author),
    notes: norm(input.notes),
  };
}

export function pickMetadataSnapshot(row: BlobMetadataInput): MetadataSnapshot {
  return normalizeMetadataInput(row);
}

export function metadataToDbRow(snapshot: MetadataSnapshot): SongTitleFields & MetadataSnapshot & { title: string | null } {
  return {
    ...snapshot,
    title: canonicalSongTitle(snapshot),
  };
}

export function findMetadataConflicts(
  existing: MetadataSnapshot,
  incoming: BlobMetadataInput,
): MetadataConflict[] {
  const next = normalizeMetadataInput(incoming);
  const conflicts: MetadataConflict[] = [];
  for (const field of METADATA_FIELDS) {
    const prev = existing[field];
    const value = next[field];
    if (prev && value && prev !== value) {
      conflicts.push({ field, existing: prev, incoming: value });
    }
  }
  return conflicts;
}

export function mergeMetadataFillEmpty(
  existing: MetadataSnapshot,
  incoming: BlobMetadataInput,
): { patch: Partial<MetadataSnapshot>; filled: MetadataField[] } {
  const next = normalizeMetadataInput(incoming);
  const patch: Partial<MetadataSnapshot> = {};
  const filled: MetadataField[] = [];

  for (const field of METADATA_FIELDS) {
    const value = next[field];
    if (!existing[field] && value) {
      patch[field] = value;
      filled.push(field);
    }
  }

  return { patch, filled };
}

export function mergeMetadataOverwrite(
  incoming: BlobMetadataInput,
): Partial<MetadataSnapshot> {
  const next = normalizeMetadataInput(incoming);
  const patch: Partial<MetadataSnapshot> = {};
  for (const field of METADATA_FIELDS) {
    const value = next[field];
    if (value !== null) {
      patch[field] = value;
    }
  }
  return patch;
}
