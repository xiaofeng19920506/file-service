import { useCallback, useMemo, useRef, useState } from 'react';
import { openMergeEditTab, uploadFile } from '../api/client';
import { friendlyError } from '../lib/error-messages';
import { mergeBlobIdsAndGetDownloadUrl, triggerFileDownload } from '../lib/merge-job';
import { isAcceptedFile } from '../lib/file-accept';
import { runWithConcurrency, UPLOAD_CONCURRENCY } from '../lib/upload-queue';
import { useI18n } from '../i18n';
import type { UploadedItem } from '../types';

import { EMPTY_SONG_TITLE, type SongTitleInput } from '../lib/song-title';

export type UploadMetadata = SongTitleInput & {
  composer: string;
  author: string;
  notes: string;
};

export const DEFAULT_METADATA: UploadMetadata = {
  ...EMPTY_SONG_TITLE,
  composer: '',
  author: '',
  notes: '',
};

type DragOverTarget = { index: number; after: boolean };

function newItem(file: File, metadata: UploadMetadata): UploadedItem {
  return {
    id: crypto.randomUUID(),
    file,
    blobId: '',
    sha256: '',
    deduplicated: false,
    status: 'queued',
    progress: 0,
    titleEn: metadata.titleEn || undefined,
    titleZhCn: metadata.titleZhCn || undefined,
    titleZhTw: metadata.titleZhTw || undefined,
    composer: metadata.composer || undefined,
    author: metadata.author || undefined,
    notes: metadata.notes || undefined,
  };
}

type UseMergeWorkspaceOptions = {
  getUploadMetadata?: () => UploadMetadata;
};

export function useMergeWorkspace(options: UseMergeWorkspaceOptions = {}) {
  const { getUploadMetadata } = options;
  const { t } = useI18n();

  const [items, setItems] = useState<UploadedItem[]>([]);
  const [uploadDragging, setUploadDragging] = useState(false);
  const [listDragIndex, setListDragIndex] = useState<number | null>(null);
  const [listDragOver, setListDragOver] = useState<DragOverTarget | null>(null);
  const uploadGenRef = useRef(0);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readyItems = items.filter((i) => i.status === 'done');
  const isUploading = items.some((i) => i.status === 'uploading' || i.status === 'queued');
  const activeUploads = items.filter((i) => i.status === 'uploading');
  const queuedUploads = items.filter((i) => i.status === 'queued');
  const failedUploads = items.filter((i) => i.status === 'error');

  const uploadSummary = useMemo(() => {
    const active = items.filter((i) => i.status === 'uploading' || i.status === 'queued');
    if (!active.length) return null;
    const doneCount = items.filter((i) => i.status === 'done').length;
    const avgProgress =
      activeUploads.length > 0
        ? Math.round(
            activeUploads.reduce((sum, i) => sum + (i.progress ?? 0), 0) / activeUploads.length,
          )
        : 0;
    return {
      active: activeUploads.length,
      queued: queuedUploads.length,
      done: doneCount,
      percent: avgProgress,
    };
  }, [items, activeUploads, queuedUploads]);

  const uploadOne = useCallback(
    async (item: UploadedItem, gen: number) => {
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id ? { ...row, status: 'uploading', progress: 0, error: undefined } : row,
        ),
      );

      try {
        const result = await uploadFile(
          item.file,
          {
            titleEn: item.titleEn,
            titleZhCn: item.titleZhCn,
            titleZhTw: item.titleZhTw,
            composer: item.composer,
            author: item.author,
            notes: item.notes,
          },
          (p) => {
            if (uploadGenRef.current !== gen) return;
            setItems((prev) =>
              prev.map((row) => (row.id === item.id ? { ...row, progress: p.percent } : row)),
            );
          },
        );

        if (uploadGenRef.current !== gen) return;

        setItems((prev) =>
          prev.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  blobId: result.blobId,
                  sha256: result.sha256,
                  deduplicated: result.deduplicated,
                  status: 'done',
                  progress: 100,
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
    async (files: FileList | File[]) => {
      const all = Array.from(files).filter((f) => f.size > 0);
      const accepted = all.filter(isAcceptedFile);
      const rejected = all.filter((f) => !isAcceptedFile(f));

      if (rejected.length) {
        setError(
          t('errors.skipped_files', {
            count: rejected.length,
            names: rejected.map((f) => f.name).join('、'),
          }),
        );
      }
      if (!accepted.length) return;

      setError(null);

      const metadata = getUploadMetadata?.() ?? DEFAULT_METADATA;
      const pending = accepted.map((file) => newItem(file, metadata));
      setItems((prev) => [...prev, ...pending]);

      const gen = ++uploadGenRef.current;
      await runWithConcurrency(
        pending.map((item) => () => uploadOne(item, gen)),
        UPLOAD_CONCURRENCY,
      );
    },
    [getUploadMetadata, uploadOne, t],
  );

  const addReadyItem = useCallback((item: UploadedItem) => {
    setItems((prev) => [...prev, item]);
  }, []);

  const retryUpload = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      if (!item || item.status !== 'error') return;
      void uploadOne(item, uploadGenRef.current);
    },
    [items, uploadOne],
  );

  const retryAllFailed = useCallback(() => {
    const failed = items.filter((i) => i.status === 'error');
    if (!failed.length) return;
    const gen = uploadGenRef.current;
    void runWithConcurrency(
      failed.map((item) => () => uploadOne(item, gen)),
      UPLOAD_CONCURRENCY,
    );
  }, [items, uploadOne]);

  const onPickFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) void uploadFiles(e.target.files);
      e.target.value = '';
    },
    [uploadFiles],
  );

  const onUploadDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setUploadDragging(false);
      if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files);
    },
    [uploadFiles],
  );

  const reorderItems = useCallback((from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setItems((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      const insertAt = to > from ? to - 1 : to;
      copy.splice(insertAt, 0, moved);
      return copy;
    });
  }, []);

  const dropAtTarget = useCallback(
    (from: number, target: DragOverTarget) => {
      let to = target.after ? target.index + 1 : target.index;
      if (from < to) to -= 1;
      reorderItems(from, to);
    },
    [reorderItems],
  );

  const removeItem = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
    },
    [],
  );

  const downloadMerged = useCallback(async () => {
    if (readyItems.length < 1 || downloading) return;

    setDownloading(true);
    setError(null);
    try {
      const { url } = await mergeBlobIdsAndGetDownloadUrl(
        readyItems.map((item) => item.blobId),
      );
      triggerFileDownload(url);
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : 'merge_failed', t));
    } finally {
      setDownloading(false);
    }
  }, [readyItems, downloading, t]);

  const openEditMerged = useCallback(() => {
    if (readyItems.length < 1 || downloading) return;
    openMergeEditTab(
      readyItems.map((item) => item.blobId),
      t('merge.editPageDefaultTitle'),
    );
  }, [readyItems, downloading, t]);

  const canDownloadMerged = readyItems.length > 0 && !isUploading && !downloading;

  return {
    items,
    uploadDragging,
    setUploadDragging,
    listDragIndex,
    setListDragIndex,
    listDragOver,
    setListDragOver,
    downloading,
    error,
    readyItems,
    isUploading,
    failedUploads,
    uploadSummary,
    canDownloadMerged,
    uploadFiles,
    addReadyItem,
    retryUpload,
    retryAllFailed,
    onPickFiles,
    onUploadDrop,
    dropAtTarget,
    removeItem,
    downloadMerged,
    openEditMerged,
  };
}

export type MergeWorkspace = ReturnType<typeof useMergeWorkspace>;
