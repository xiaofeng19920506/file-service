import { useCallback, useState } from 'react';
import { fetchBlobPreviewPptx } from '../api/client';
import { useMergeWorkspace } from '../hooks/useMergeWorkspace';
import WorkspaceShell from '../components/WorkspaceShell';
import LibrarySearchSection from '../components/LibrarySearchSection';
import { FileListSection } from '../components/MergeWorkspaceSections';
import { friendlyError } from '../lib/error-messages';
import { useI18n } from '../i18n';
import type { BlobRecord } from '../types';

export default function MergePage() {
  const { t } = useI18n();
  const [libraryAddError, setLibraryAddError] = useState<string | null>(null);
  const workspace = useMergeWorkspace();
  const { items, addReadyItem, error } = workspace;

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
