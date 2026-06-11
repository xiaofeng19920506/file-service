import { DragHandleIcon } from './icons';
import { useI18n } from '../i18n';
import type { PlaylistItem } from '../api/playlists';

type PlaylistQueuePanelProps = {
  open: boolean;
  onClose: () => void;
  items: PlaylistItem[];
  activeIndex: number;
  playing: boolean;
  onSelectTrack: (index: number) => void;
  /** 桌面底部播放栏：从左下角上拉的紧凑队列 */
  variant?: 'mobile' | 'desktopDock';
  onRemoveTrack?: (itemId: string) => void;
  removingItemId?: string | null;
  savingOrder?: boolean;
  trackDragIndex?: number | null;
  trackDragOver?: { index: number; after: boolean } | null;
  onDragStart?: (index: number) => void;
  onDragEnd?: () => void;
  onDragOver?: (index: number, after: boolean) => void;
  onDragLeave?: (index: number) => void;
  onDrop?: (from: number, target: { index: number; after: boolean }) => void;
};

function youtubeThumb(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export default function PlaylistQueuePanel({
  open,
  onClose,
  items,
  activeIndex,
  playing,
  onSelectTrack,
  onRemoveTrack,
  removingItemId = null,
  savingOrder = false,
  trackDragIndex = null,
  trackDragOver = null,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  variant = 'mobile',
}: PlaylistQueuePanelProps) {
  const { t } = useI18n();
  const isDesktopDock = variant === 'desktopDock';

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className={`playlist-queue-backdrop${isDesktopDock ? ' playlist-queue-backdrop--desktop-dock' : ''}`}
        aria-label={t('common.cancel')}
        onClick={onClose}
      />
      <aside
        className={`playlist-queue-panel${isDesktopDock ? ' playlist-queue-panel--desktop-dock' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('playlists.queueTitle')}
      >
        <header className="playlist-queue-head">
          <h2>{t('playlists.queueTitle')}</h2>
          <button type="button" className="playlist-queue-close" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </header>
        <ol className={`playlist-queue-list${savingOrder ? ' saving-order' : ''}`}>
          {items.map((item, index) => {
            const isActive = index === activeIndex;
            const isPlaying = isActive && playing;
            const isDragging = trackDragIndex === index;
            const isDragOverBefore =
              trackDragOver?.index === index && !trackDragOver.after;
            const isDragOverAfter = trackDragOver?.index === index && trackDragOver.after;

            return (
              <li
                key={item.id}
                className={`playlist-queue-item${isActive ? ' active' : ''}${isPlaying ? ' playing' : ''}${isDragging ? ' dragging' : ''}${isDragOverBefore ? ' drag-over-before' : ''}${isDragOverAfter ? ' drag-over-after' : ''}`}
                onDragOver={(e) => {
                  if (trackDragIndex === null || savingOrder || !onDragOver) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  const rect = e.currentTarget.getBoundingClientRect();
                  onDragOver(index, e.clientY > rect.top + rect.height / 2);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (trackDragIndex !== null && trackDragOver && onDrop) {
                    onDrop(trackDragIndex, trackDragOver);
                  }
                  onDragEnd?.();
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    onDragLeave?.(index);
                  }
                }}
              >
                {onDragStart && (
                  <span
                    className={`playlist-queue-drag${savingOrder ? ' disabled' : ''}`}
                    draggable={!savingOrder}
                    onDragStart={(e) => {
                      if (savingOrder) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.effectAllowed = 'move';
                      onDragStart(index);
                    }}
                    onDragEnd={() => onDragEnd?.()}
                  >
                    <DragHandleIcon />
                  </span>
                )}
                <button
                  type="button"
                  className="playlist-queue-item-main"
                  onClick={() => {
                    onSelectTrack(index);
                    onClose();
                  }}
                >
                  <span className="playlist-queue-thumb-wrap">
                    <img
                      className="playlist-queue-thumb"
                      src={youtubeThumb(item.youtubeVideoId)}
                      alt=""
                      loading="lazy"
                      draggable={false}
                    />
                    <span className="playlist-queue-play-icon" aria-hidden>
                      {isPlaying ? '▮▮' : '▶'}
                    </span>
                  </span>
                  <span className="playlist-queue-title">{item.title}</span>
                </button>
                {onRemoveTrack && (
                  <button
                    type="button"
                    className="playlist-queue-remove"
                    disabled={removingItemId === item.id || savingOrder}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveTrack(item.id);
                    }}
                    aria-label={t('playlists.removeTrack', { title: item.title })}
                  >
                    {removingItemId === item.id ? '…' : '×'}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </aside>
    </>
  );
}
