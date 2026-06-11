import { QueueIcon, RepeatIcon, ShuffleIcon } from './icons';
import { useI18n } from '../i18n';
import type { PlaylistPlaybackMode } from '../lib/playlist-playback-mode';
import type { PlaylistRepeatMode } from '../lib/playlist-repeat-mode';

type PlaylistPlayerBottomChromeProps = {
  className?: string;
  showQueue?: boolean;
  onToggleQueue: () => void;
  repeatMode: PlaylistRepeatMode;
  onCycleRepeat: () => void;
  shuffleEnabled: boolean;
  onToggleShuffle: () => void;
  playbackMode: PlaylistPlaybackMode;
  onPlaybackModeChange: (mode: PlaylistPlaybackMode) => void;
};

export default function PlaylistPlayerBottomChrome({
  className = '',
  showQueue = true,
  onToggleQueue,
  repeatMode,
  onCycleRepeat,
  shuffleEnabled,
  onToggleShuffle,
  playbackMode,
  onPlaybackModeChange,
}: PlaylistPlayerBottomChromeProps) {
  const { t } = useI18n();

  const repeatLabel =
    repeatMode === 'one'
      ? t('playlists.repeatOne')
      : repeatMode === 'all'
        ? t('playlists.repeatAll')
        : t('playlists.repeatOff');

  return (
    <nav
      className={`playlist-now-playing-chrome${className ? ` ${className}` : ''}`}
      aria-label={t('playlists.playerChrome')}
    >
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

      <div className="playlist-chrome-actions" role="group" aria-label={t('playlists.playbackOptions')}>
        <button
          type="button"
          className={`playlist-chrome-btn${repeatMode !== 'off' ? ' active' : ''}`}
          onClick={onCycleRepeat}
          aria-label={repeatLabel}
          title={repeatLabel}
        >
          <RepeatIcon mode={repeatMode} />
        </button>
        <button
          type="button"
          className={`playlist-chrome-btn${shuffleEnabled ? ' active' : ''}`}
          onClick={onToggleShuffle}
          aria-pressed={shuffleEnabled}
          aria-label={t('playlists.shuffle')}
          title={t('playlists.shuffle')}
        >
          <ShuffleIcon />
        </button>
        <div className="playlist-chrome-mode" role="group" aria-label={t('playlists.playbackMode')}>
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
    </nav>
  );
}
