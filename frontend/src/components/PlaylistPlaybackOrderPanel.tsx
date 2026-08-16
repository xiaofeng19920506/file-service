import { useEffect } from 'react';
import { ListPlayIcon, PlaybackOrderModeIcon } from './icons';
import { useI18n } from '../i18n';
import type { PlaylistPlaybackOrderMode } from '../lib/playlist-playback-order-mode';

const MODES: PlaylistPlaybackOrderMode[] = [
  'sequential',
  'loop_all',
  'loop_one',
  'shuffle',
];

type PlaylistPlaybackOrderPanelProps = {
  open: boolean;
  onClose: () => void;
  mode: PlaylistPlaybackOrderMode;
  onSelectMode: (mode: PlaylistPlaybackOrderMode) => void;
  variant?: 'mobile' | 'desktopDock';
};

export default function PlaylistPlaybackOrderPanel({
  open,
  onClose,
  mode,
  onSelectMode,
  variant = 'mobile',
}: PlaylistPlaybackOrderPanelProps) {
  const { t } = useI18n();
  const isDesktopDock = variant === 'desktopDock';

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const labelForMode = (value: PlaylistPlaybackOrderMode) => {
    switch (value) {
      case 'loop_one':
        return t('playlists.repeatOne');
      case 'loop_all':
        return t('playlists.repeatAll');
      case 'shuffle':
        return t('playlists.shuffle');
      default:
        return t('playlists.playOrderSequential');
    }
  };

  const hintForMode = (value: PlaylistPlaybackOrderMode) => {
    switch (value) {
      case 'sequential':
        return t('playlists.playOrderSequentialHint');
      case 'loop_all':
        return t('playlists.playOrderLoopAllHint');
      case 'loop_one':
        return t('playlists.playOrderLoopOneHint');
      case 'shuffle':
        return t('playlists.playOrderShuffleHint');
    }
  };

  return (
    <>
      <button
        type="button"
        className={`playlist-queue-backdrop playlist-play-order-backdrop${isDesktopDock ? ' playlist-queue-backdrop--desktop-dock' : ''}`}
        aria-label={t('common.cancel')}
        onClick={onClose}
      />
      <aside
        className={`playlist-queue-panel playlist-play-order-panel${isDesktopDock ? ' playlist-queue-panel--desktop-dock' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('playlists.playOrderTitle')}
      >
        <header className="playlist-queue-head">
          <h2>{t('playlists.playOrderTitle')}</h2>
          <button type="button" className="playlist-queue-close" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </header>
        <ul className="playlist-play-order-list" role="radiogroup" aria-label={t('playlists.playOrderTitle')}>
          {MODES.map((value) => {
            const selected = mode === value;
            return (
              <li key={value}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`playlist-play-order-item${selected ? ' active' : ''}`}
                  onClick={() => {
                    onSelectMode(value);
                    onClose();
                  }}
                >
                  <span className="playlist-play-order-item-icon" aria-hidden>
                    {value === 'sequential' ? (
                      <ListPlayIcon />
                    ) : (
                      <PlaybackOrderModeIcon mode={value} />
                    )}
                  </span>
                  <span className="playlist-play-order-item-text">
                    <span className="playlist-play-order-item-title">{labelForMode(value)}</span>
                    <span className="playlist-play-order-item-hint">{hintForMode(value)}</span>
                  </span>
                  {selected ? (
                    <span className="playlist-play-order-item-check" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </>
  );
}
