import { useEffect, useRef, useState, type ReactNode } from 'react';
import MobileSegmentedControl from './MobileSegmentedControl';
import type { MergeWorkspace } from '../hooks/useMergeWorkspace';
import { useI18n } from '../i18n';

type WorkspaceShellProps = {
  workspace: MergeWorkspace;
  children?: ReactNode;
  leftColumn?: ReactNode;
  centerColumn?: ReactNode;
};

export default function WorkspaceShell({
  workspace,
  children,
  leftColumn,
  centerColumn,
}: WorkspaceShellProps) {
  const { t } = useI18n();
  const {
    downloading,
    canDownloadMerged,
    downloadMerged,
    openEditMerged,
  } = workspace;

  const [mobilePanel, setMobilePanel] = useState<'search' | 'setlist'>('search');
  const itemCount = workspace.items.length;
  const prevItemCount = useRef(itemCount);

  useEffect(() => {
    if (itemCount > prevItemCount.current) {
      setMobilePanel('setlist');
    }
    prevItemCount.current = itemCount;
  }, [itemCount]);

  if (leftColumn != null && centerColumn != null) {
    return (
      <div className="page-body page-body-merge" data-mobile-panel={mobilePanel}>
        <MobileSegmentedControl
          className="mobile-only merge-mobile-segments"
          ariaLabel={t('merge.mobileSections')}
          value={mobilePanel}
          onChange={(id) => setMobilePanel(id as 'search' | 'setlist')}
          segments={[
            { id: 'search', label: t('merge.mobileSearch') },
            { id: 'setlist', label: t('merge.mobileSetlist'), badge: itemCount },
          ]}
        />
        <aside className="merge-panel merge-panel-search">{leftColumn}</aside>
        <aside className="merge-panel merge-panel-setlist">
          <header className="merge-header-actions">
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={!canDownloadMerged || downloading}
              onClick={openEditMerged}
            >
              {t('merge.openEditor')}
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={!canDownloadMerged || downloading}
              onClick={() => void downloadMerged()}
            >
              {downloading ? t('status.running') : t('slides.download')}
            </button>
          </header>
          <div className="merge-setlist-scroll">{centerColumn}</div>
        </aside>
      </div>
    );
  }

  return (
    <div className="page-body">
      <div className="workspace">
        <div className="workspace-main">
          <main className="main">{children}</main>
        </div>
      </div>
    </div>
  );
}
