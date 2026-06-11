import { useCallback, useMemo, useRef, useState } from 'react';
import { uploadFile } from '../api/client';
import { friendlyError } from '../lib/error-messages';
import { isAcceptedFile } from '../lib/file-accept';
import { runWithConcurrency, UPLOAD_CONCURRENCY } from '../lib/upload-queue';
import { useI18n } from '../i18n';
import { songTitleSummary } from '../lib/song-title';
import type { UploadMetadata } from './useMergeWorkspace';
import type { MetadataConflict, MetadataField, MetadataSnapshot } from '../types';

export type LibraryUploadItem = {
  id: string;
  file: File;
  status: 'queued' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
  deduplicated?: boolean;
  blobId?: string;
  sha256?: string;
  title?: string;
  metadataUpdated?: boolean;
  metadataFilled?: MetadataField[];
  metadataConflicts?: MetadataConflict[];
  existingMetadata?: MetadataSnapshot | null;
  submittedMetadata?: MetadataSnapshot;
  conflictResolved?: boolean;
};

function newUploadItem(file: File, metadata: UploadMetadata): LibraryUploadItem {
  const title = songTitleSummary(metadata);
  return {
    id: crypto.randomUUID(),
    file,
    status: 'queued',
    progress: 0,
    title: title || undefined,
  };
}

export function useLibraryUpload() {
  const { t } = useI18n();
  const [items, setItems] = useState<LibraryUploadItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const uploadGenRef = useRef(0);

  const uploadSummary = useMemo(() => {
    const active = items.filter((i) => i.status === 'uploading' || i.status === 'queued');
    if (!active.length) return null;
    const uploading = items.filter((i) => i.status === 'uploading');
    const avgProgress =
      uploading.length > 0
        ? Math.round(uploading.reduce((sum, i) => sum + i.progress, 0) / uploading.length)
        : 0;
    return {
      active: active.length,
      queued: items.filter((i) => i.status === 'queued').length,
      percent: avgProgress,
    };
  }, [items]);

  const uploadOne = useCallback(
    async (item: LibraryUploadItem, gen: number, metadata: UploadMetadata) => {
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id ? { ...row, status: 'uploading', progress: 0, error: undefined } : row,
        ),
      );

      try {
        const result = await uploadFile(
          item.file,
          {
            titleEn: metadata.titleEn,
            titleZhCn: metadata.titleZhCn,
            titleZhTw: metadata.titleZhTw,
            composer: metadata.composer,
            author: metadata.author,
            notes: metadata.notes,
          },
          (p) => {
            if (uploadGenRef.current !== gen) return;
            setItems((prev) =>
              prev.map((row) => (row.id === item.id ? { ...row, progress: p.percent } : row)),
            );
          },
        );

        if (uploadGenRef.current !== gen) return;

        if (result.deduplicated || (result.metadataConflicts?.length ?? 0) > 0) {
          setItems((prev) =>
            prev.map((row) =>
              row.id === item.id
                ? {
                    ...row,
                    status: 'error',
                    progress: 0,
                    error: friendlyError('content_already_exists', t),
                  }
                : row,
            ),
          );
          return;
        }

        setItems((prev) =>
          prev.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  status: 'done',
                  progress: 100,
                  blobId: result.blobId,
                  sha256: result.sha256,
                }
              : row,
          ),
        );
      } catch (e) {
        if (uploadGenRef.current !== gen) return;
        const code = e instanceof Error ? e.message : 'upload_failed';
        setItems((prev) =>
          prev.map((row) =>
            row.id === item.id
              ? { ...row, status: 'error', error: friendlyError(code, t), progress: 0 }
              : row,
          ),
        );
      }
    },
    [t],
  );

  const uploadFiles = useCallback(
    async (uploads: { file: File; metadata: UploadMetadata }[]) => {
      const all = uploads.filter(({ file }) => file.size > 0);
      const accepted = all.filter(({ file }) => isAcceptedFile(file));
      const rejected = all.filter(({ file }) => !isAcceptedFile(file));

      if (rejected.length) {
        setError(
          t('errors.skipped_files', {
            count: rejected.length,
            names: rejected.map(({ file }) => file.name).join('、'),
          }),
        );
      }
      if (!accepted.length) return;

      setError(null);
      const pending = accepted.map(({ file, metadata }) => ({
        item: newUploadItem(file, metadata),
        metadata,
      }));
      setItems((prev) => [...pending.map((row) => row.item), ...prev]);

      const gen = ++uploadGenRef.current;
      await runWithConcurrency(
        pending.map(({ item, metadata }) => () => uploadOne(item, gen, metadata)),
        UPLOAD_CONCURRENCY,
      );
    },
    [uploadOne, t],
  );

  const clearCompleted = useCallback(() => {
    setItems((prev) => prev.filter((i) => i.status !== 'done' && i.status !== 'error'));
  }, []);

  return {
    items,
    error,
    setError,
    uploadSummary,
    uploadFiles,
    clearCompleted,
  };
}
