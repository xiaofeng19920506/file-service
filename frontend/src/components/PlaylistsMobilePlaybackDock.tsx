import AudioSeekBar from './AudioSeekBar';
import { PlaybackOrderModeIcon, QueueIcon } from './icons';
import { formatPlaybackTime } from './PlaylistAudioPlayer';
import { useI18n } from '../i18n';
import ScrollingTitle from './ScrollingTitle';
import type { PlaylistPlaybackOrderMode } from '../lib/playlist-playback-order-mode';

type PlaylistsMobilePlaybackDockProps = {
  title: string;
  trackLabel: string;
  playing: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  showProgress?: boolean;
  currentTime?: number;
  duration?: number;
  canSeek?: boolean;
  playbackOrderMode?: PlaylistPlaybackOrderMode;
  playbackOrderOpen?: boolean;
  queueOpen?: boolean;
  onSeekRatio?: (ratio: number) => void;
  onOpenPlaybackOrder?: () => void;
  onToggleQueue?: () => void;
  onPlayToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
};

export default function PlaylistsMobilePlaybackDock({
  title,
  trackLabel,
  playing,
  canGoPrev,
  canGoNext,
  showProgress = false,
  currentTime = 0,
  duration = 0,
  canSeek = false,
  playbackOrderMode = 'sequential',
  playbackOrderOpen = false,
  queueOpen = false,
  onSeekRatio,
  onOpenPlaybackOrder,
  onToggleQueue,
  onPlayToggle,
  onPrev,
  onNext,
}: PlaylistsMobilePlaybackDockProps) {
  const { t } = useI18n();
  const totalDurationLabel = duration > 0 ? formatPlaybackTime(duration) : '--:--';

  return (
    <div
      className={`playlists-playback-dock playlists-playback-dock--mobile playlists-playback-dock--audio mobile-only${showProgress ? ' playlists-playback-dock--with-progress' : ''}`}
      role="group"
      aria-label={t('playlists.playerSectionAudio')}
    >
      <div className="playlists-playback-dock-meta">
        <ScrollingTitle text={title} className="playlists-playback-dock-title" />
        <span className="playlists-playback-dock-index">{trackLabel}</span>
      </div>

      {showProgress && onSeekRatio ? (
        <div className="playlists-playback-dock-progress-wrap">
          <AudioSeekBar
            currentTime={currentTime}
            duration={duration}
            canSeek={canSeek}
            onSeekRatio={onSeekRatio}
            className="playlists-playback-dock-progress"
          />
          <div className="playlists-playback-dock-times">
            <span>{formatPlaybackTime(currentTime)}</span>
            <span>{totalDurationLabel}</span>
          </div>
        </div>
      ) : null}

      <div className="playlists-playback-dock-controls">
        <div className="playlists-mobile-transport playlists-mobile-transport--dock">
          <button
            type="button"
            className="playlists-mobile-transport-btn"
            onClick={onPrev}
            disabled={!canGoPrev}
            aria-label={t('playlists.prevTrack')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M14 6l-6 6 6 6V6z" />
            </svg>
          </button>
          <button
            type="button"
            className="playlists-mobile-transport-btn playlists-mobile-transport-btn--primary"
            onClick={onPlayToggle}
            aria-label={playing ? t('playlists.pause') : t('playlists.play')}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M7 6h3v12H7V6zm7 0h3v12h-3V6z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7L8 5z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="playlists-mobile-transport-btn"
            onClick={onNext}
            disabled={!canGoNext}
            aria-label={t('playlists.nextTrack')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M10 6l6 6-6 6V6z" />
            </svg>
          </button>
        </div>

        <div className="playlists-playback-dock-secondary">
          {onOpenPlaybackOrder ? (
            <button
              type="button"
              className={`playlists-playback-dock-secondary-btn${playbackOrderMode !== 'sequential' || playbackOrderOpen ? ' active' : ''}`}
              aria-label={t('playlists.playOrderTitle')}
              aria-pressed={playbackOrderOpen}
              onClick={onOpenPlaybackOrder}
            >
              <PlaybackOrderModeIcon mode={playbackOrderMode} />
            </button>
          ) : null}
          {onToggleQueue ? (
            <button
              type="button"
              className={`playlists-playback-dock-secondary-btn${queueOpen ? ' active' : ''}`}
              aria-label={t('playlists.queueTitle')}
              aria-pressed={queueOpen}
              onClick={onToggleQueue}
            >
              <QueueIcon />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
