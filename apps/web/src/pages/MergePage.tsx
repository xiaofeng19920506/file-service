import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBlobPreviewPptx } from '../api/client';
import { getPlaylist } from '../api/playlists';
import { useMergeWorkspace } from '../hooks/useMergeWorkspace';
import WorkspaceShell from '../components/WorkspaceShell';
import LibrarySearchSection from '../components/LibrarySearchSection';
import { FileListSection } from '../components/MergeWorkspaceSections';
import { friendlyError } from '../lib/error-messages';
import { useI18n } from '../i18n';
import type { BlobRecord } from '../types';

type MergePageProps = {
  mergePlaylistId?: string;
};

export default function MergePage({ mergePlaylistId }: MergePageProps) {
  const { t } = useI18n();
  const [libraryAddError, setLibraryAddError] = useState<string | null>(null);
  const workspace = useMergeWorkspace();
  const { items, addReadyItem, error } = workspace;
  const loadedPlaylistRef = useRef<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const addedBlobIds = new Set(items.map((i) => i.blobId).filter(Boolean));

  const addFromLibrary = useCallback(
    async (blob: BlobRecord) => {
      if (items.some((item) => item.blobId === blob.id)) return;
      setLibraryAddError(null);
      try {
        const preview = await fetchBlobPreviewPptx(blob.id);
        const filename = blob.originalFilename ?? `${blob.id}.pptx`;
        const file = new File([preview], filename, {
          type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        });
        addReadyItem({
          id: crypto.randomUUID(),
          file,
          blobId: blob.id,
          sha256: '',
          deduplicated: true,
          status: 'done',
          progress: 100,
          titleEn: blob.titleEn ?? undefined,
          titleZhCn: blob.titleZhCn ?? blob.title ?? undefined,
          titleZhTw: blob.titleZhTw ?? undefined,
          composer: blob.composer ?? undefined,
          author: blob.author ?? undefined,
          notes: blob.notes ?? undefined,
        });
      } catch (e) {
        setLibraryAddError(
          friendlyError(e instanceof Error ? e.message : 'fetch_preview_failed', t),
        );
      }
    },
    [items, addReadyItem, t],
  );

  useEffect(() => {
    if (!mergePlaylistId || loadedPlaylistRef.current === mergePlaylistId) return;
    loadedPlaylistRef.current = mergePlaylistId;

    let cancelled = false;
    void (async () => {
      setLibraryAddError(null);
      try {
        const data = await getPlaylist(mergePlaylistId);
        if (cancelled) return;

        const seenBlobIds = new Set(
          itemsRef.current.map((row) => row.blobId).filter(Boolean),
        );
        for (const item of data.items) {
          if (!item.blobId || !item.blob || seenBlobIds.has(item.blobId)) continue;
          seenBlobIds.add(item.blobId);
          const preview = await fetchBlobPreviewPptx(item.blobId);
          if (cancelled) return;
          const filename = item.blob.originalFilename ?? `${item.blobId}.pptx`;
          const file = new File([preview], filename, {
            type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          });
          addReadyItem({
            id: crypto.randomUUID(),
            file,
            blobId: item.blobId,
            sha256: '',
            deduplicated: true,
            status: 'done',
            progress: 100,
            titleEn: item.blob.titleEn ?? undefined,
            titleZhCn: item.blob.titleZhCn ?? item.blob.title ?? undefined,
            titleZhTw: item.blob.titleZhTw ?? undefined,
            composer: item.blob.composer ?? undefined,
            author: item.blob.author ?? undefined,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setLibraryAddError(
            friendlyError(e instanceof Error ? e.message : 'load_playlist_failed', t),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mergePlaylistId, addReadyItem, t]);

  return (
    <WorkspaceShell
      workspace={workspace}
      leftColumn={
        <>
          <LibrarySearchSection
            addedBlobIds={addedBlobIds}
            onAdd={(blob) => void addFromLibrary(blob)}
          />
          {libraryAddError && <p className="error-msg">{libraryAddError}</p>}
        </>
      }
      centerColumn={
        <div className="merge-setlist-panel">
          {items.length === 0 ? null : (
            <>
              <FileListSection workspace={workspace} mode="merge" />
              {error && <p className="error-msg">{error}</p>}
            </>
          )}
        </div>
      }
    />
  );
}
