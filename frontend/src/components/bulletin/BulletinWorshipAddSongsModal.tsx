import { useEffect, useState } from 'react';
import AddPlaylistItemsModal from '../AddPlaylistItemsModal';
import BulletinWorshipYoutubeImportPanel from './BulletinWorshipYoutubeImportPanel';
import { useI18n } from '../../i18n';
import type { PlaylistDetail } from '../../api/playlists';

type Tab = 'search' | 'youtube';

type BulletinWorshipAddSongsModalProps = {
  bulletinId: string;
  existingVideoIds: Set<string>;
  initialTab?: Tab;
  oauthJustConnected?: boolean;
  oauthError?: string | null;
  onClearOauthError?: () => void;
  onClose: () => void;
  onAdded: (detail: PlaylistDetail, meta: { addedCount: number; skippedCount: number }) => void;
};

/**
 * 合并「搜索/粘贴链接」与「导入 YouTube 歌单」到同一弹窗。
 * 搜索页复用 AddPlaylistItemsModal 的内容区逻辑：用内嵌面板而非再套一层 overlay。
 */
export default function BulletinWorshipAddSongsModal({
  bulletinId,
  existingVideoIds,
  initialTab = 'search',
  oauthJustConnected = false,
  oauthError = null,
  onClearOauthError,
  onClose,
  onAdded,
}: BulletinWorshipAddSongsModalProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    if (oauthJustConnected || oauthError) setTab('youtube');
  }, [oauthJustConnected, oauthError]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="metadata-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="metadata-modal bulletin-worship-add-songs-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('bulletin.worshipAddSongs')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="metadata-modal-header">
          <h3>{t('bulletin.worshipAddSongs')}</h3>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>

        <div className="bulletin-worship-add-songs-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'search'}
            className={`bulletin-worship-add-songs-tab${tab === 'search' ? ' is-active' : ''}`}
            onClick={() => setTab('search')}
          >
            {t('bulletin.worshipAddSongsTabSearch')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'youtube'}
            className={`bulletin-worship-add-songs-tab${tab === 'youtube' ? ' is-active' : ''}`}
            onClick={() => setTab('youtube')}
          >
            {t('bulletin.worshipAddSongsTabYoutube')}
          </button>
        </div>

        <div className="bulletin-worship-add-songs-body">
          {tab === 'search' ? (
            <AddPlaylistItemsModal
              bulletinId={bulletinId}
              existingVideoIds={existingVideoIds}
              embedded
              hideUrlPanel
              onClose={onClose}
              onAdded={onAdded}
            />
          ) : (
            <BulletinWorshipYoutubeImportPanel
              bulletinId={bulletinId}
              oauthJustConnected={oauthJustConnected}
              oauthError={oauthError}
              onClearOauthError={onClearOauthError}
              onImported={(detail, meta) => {
                onAdded(detail, meta);
                onClose();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
