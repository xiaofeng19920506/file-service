import type { ReactNode } from 'react';
import { ChevronDownIcon } from './icons';
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
  trackTitle,
  trackCurrent,
  trackTotal,
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
        <div className="playlist-now-playing-header-text">
          <span className="playlist-now-playing-eyebrow">{t('playlists.nowPlaying')}</span>
          <ScrollingTitle text={trackTitle} className="playlist-now-playing-title" />
          <span className="playlist-now-playing-subtitle">{playlistTitle}</span>
        </div>
        <span className="playlist-now-playing-counter">
          {t('playlists.trackCounter', { current: trackCurrent, total: trackTotal })}
        </span>
      </header>

      <div className="playlist-now-playing-body">{children}</div>

      <PlaylistPlayerBottomChrome
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
