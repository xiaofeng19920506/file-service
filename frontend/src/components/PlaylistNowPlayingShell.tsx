import type { ReactNode } from 'react';
import { ChevronDownIcon, QueueIcon } from './icons';
import PlaylistPlayerBottomChrome from './PlaylistPlayerBottomChrome';
import ScrollingTitle from './ScrollingTitle';
import { useI18n } from '../i18n';
import type { PlaylistPlaybackMode } from '../lib/playlist-playback-mode';
import type { PlaylistRepeatMode } from '../lib/playlist-repeat-mode';

type PlaylistNowPlayingShellProps = {
  playlistTitle: string;
  trackTitle: string;
  trackCurrent: number;
  trackTotal: number;
  onMinimize: () => void;
  onToggleQueue: () => void;
  repeatMode: PlaylistRepeatMode;
  onCycleRepeat: () => void;
  shuffleEnabled: boolean;
  onToggleShuffle: () => void;
  playbackMode: PlaylistPlaybackMode;
  onPlaybackModeChange: (mode: PlaylistPlaybackMode) => void;
  children: ReactNode;
};

export default function PlaylistNowPlayingShell({
  playlistTitle,
  trackTitle: _trackTitle,
  trackCurrent: _trackCurrent,
  trackTotal: _trackTotal,
  onMinimize,
  onToggleQueue,
  repeatMode,
  onCycleRepeat,
  shuffleEnabled,
  onToggleShuffle,
  playbackMode,
  onPlaybackModeChange,
  children,
}: PlaylistNowPlayingShellProps) {
  const { t } = useI18n();

  return (
    <div className="playlist-now-playing">
      <header className="playlist-now-playing-header">
        <button
          type="button"
          className="playlist-now-playing-minimize"
          onClick={onMinimize}
          aria-label={t('playlists.minimizePlayer')}
        >
          <ChevronDownIcon />
        </button>

        <div className="playlist-now-playing-header-text desktop-only">
          <ScrollingTitle text={playlistTitle} className="playlist-now-playing-title" />
        </div>

        <p className="playlist-np-mobile-playlist mobile-only">{playlistTitle}</p>

        <div className="playlist-now-playing-header-end">
          <div
            className="playlist-np-mode-switch desktop-only"
            role="group"
            aria-label={t('playlists.playbackMode')}
          >
            <button
              type="button"
              className={`playlist-np-mode-btn${playbackMode === 'audio' ? ' active' : ''}`}
              aria-pressed={playbackMode === 'audio'}
              onClick={() => onPlaybackModeChange('audio')}
            >
              {t('playlists.playbackMp3')}
            </button>
            <button
              type="button"
              className={`playlist-np-mode-btn${playbackMode === 'video' ? ' active' : ''}`}
              aria-pressed={playbackMode === 'video'}
              onClick={() => onPlaybackModeChange('video')}
            >
              {t('playlists.playbackVideo')}
            </button>
          </div>
          <button
            type="button"
            className="playlist-np-queue-btn desktop-only"
            onClick={onToggleQueue}
            aria-label={t('playlists.queueTitle')}
          >
            <QueueIcon />
          </button>
          <div
            className="playlist-np-mode-switch mobile-only"
            role="group"
            aria-label={t('playlists.playbackMode')}
          >
            <button
              type="button"
              className={`playlist-np-mode-btn${playbackMode === 'audio' ? ' active' : ''}`}
              aria-pressed={playbackMode === 'audio'}
              onClick={() => onPlaybackModeChange('audio')}
            >
              {t('playlists.playbackMp3')}
            </button>
            <button
              type="button"
              className={`playlist-np-mode-btn${playbackMode === 'video' ? ' active' : ''}`}
              aria-pressed={playbackMode === 'video'}
              onClick={() => onPlaybackModeChange('video')}
            >
              {t('playlists.playbackVideo')}
            </button>
          </div>
        </div>
      </header>

      <div className="playlist-now-playing-body">{children}</div>

      <PlaylistPlayerBottomChrome
        className="desktop-only"
        onToggleQueue={onToggleQueue}
        repeatMode={repeatMode}
        onCycleRepeat={onCycleRepeat}
        shuffleEnabled={shuffleEnabled}
        onToggleShuffle={onToggleShuffle}
        playbackMode={playbackMode}
        onPlaybackModeChange={onPlaybackModeChange}
      />
    </div>
  );
}
