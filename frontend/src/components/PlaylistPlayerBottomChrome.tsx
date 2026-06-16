import { PlaybackOrderModeIcon, QueueIcon } from './icons';
import { useI18n } from '../i18n';
import type { PlaylistPlaybackMode } from '../lib/playlist-playback-mode';
import type { PlaylistPlaybackOrderMode } from '../lib/playlist-playback-order-mode';

type PlaylistPlayerBottomChromeProps = {
  className?: string;
  showQueue?: boolean;
  showPlaybackOptions?: boolean;
  onToggleQueue: () => void;
  playbackOrderMode: PlaylistPlaybackOrderMode;
  onOpenPlaybackOrder: () => void;
  playbackOrderOpen?: boolean;
  playbackMode: PlaylistPlaybackMode;
  onPlaybackModeChange: (mode: PlaylistPlaybackMode) => void;
  canPlayPlaylistVideo?: boolean;
};

export default function PlaylistPlayerBottomChrome({
  className = '',
  showQueue = true,
  showPlaybackOptions = true,
  onToggleQueue,
  playbackOrderMode,
  onOpenPlaybackOrder,
  playbackOrderOpen = false,
  playbackMode,
  onPlaybackModeChange,
  canPlayPlaylistVideo = true,
}: PlaylistPlayerBottomChromeProps) {
  const { t } = useI18n();

  return (
    <nav
      className={`playlist-now-playing-chrome${className ? ` ${className}` : ''}`}
      aria-label={t('playlists.playerChrome')}
    >
      <div className="playlist-chrome-leading">
        {showPlaybackOptions && (
          <button
            type="button"
            className={`playlist-chrome-btn playlist-chrome-btn--play-order${playbackOrderMode !== 'sequential' || playbackOrderOpen ? ' active' : ''}`}
            onClick={onOpenPlaybackOrder}
            aria-label={t('playlists.playOrderTitle')}
            aria-pressed={playbackOrderOpen}
          >
            <PlaybackOrderModeIcon mode={playbackOrderMode} />
            <span className="playlist-chrome-label">{t('playlists.playOrderShort')}</span>
          </button>
        )}
        {showQueue && (
          <button
            type="button"
            className="playlist-chrome-btn playlist-chrome-btn--queue"
            onClick={onToggleQueue}
            aria-label={t('playlists.queueTitle')}
          >
            <QueueIcon />
            <span className="playlist-chrome-label">{t('playlists.queueShort')}</span>
          </button>
        )}
      </div>

      {canPlayPlaylistVideo && (
      <div className="playlist-chrome-actions" role="group" aria-label={t('playlists.playbackMode')}>
        <div className="playlist-chrome-mode">
          <button
            type="button"
            className={`playlist-chrome-mode-btn${playbackMode === 'audio' ? ' active' : ''}`}
            aria-pressed={playbackMode === 'audio'}
            onClick={() => onPlaybackModeChange('audio')}
          >
            {t('playlists.playbackMp3')}
          </button>
          <button
            type="button"
            className={`playlist-chrome-mode-btn${playbackMode === 'video' ? ' active' : ''}`}
            aria-pressed={playbackMode === 'video'}
            onClick={() => onPlaybackModeChange('video')}
          >
            {t('playlists.playbackVideo')}
          </button>
        </div>
      </div>
      )}
    </nav>
  );
}
