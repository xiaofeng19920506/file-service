import { formatPlaybackTime } from './PlaylistAudioPlayer';
import { CloseIcon } from './icons';
import { useI18n } from '../i18n';
import ScrollingTitle from './ScrollingTitle';

type PlaylistsMiniBarProps = {
  title: string;
  playing: boolean;
  currentTime: number;
  duration: number;
  onExpand: () => void;
  onPlayToggle: () => void;
  onClose: () => void;
};

export default function PlaylistsMiniBar({
  title,
  playing,
  currentTime,
  duration,
  onExpand,
  onPlayToggle,
  onClose,
}: PlaylistsMiniBarProps) {
  const { t } = useI18n();
  const timeLabel = `${formatPlaybackTime(currentTime)} / ${
    Number.isFinite(duration) && duration > 0 ? formatPlaybackTime(duration) : '--:--'
  }`;

  return (
    <div className="playlists-mini-bar mobile-only" role="group" aria-label={t('playlists.playerSectionAudio')}>
      <button type="button" className="playlists-mini-bar-main" onClick={onExpand}>
        <ScrollingTitle text={title} className="playlists-mini-bar-title" />
      </button>
      <span className="playlists-mini-bar-time">{timeLabel}</span>
      <button
        type="button"
        className="playlists-mini-bar-btn"
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
        className="playlists-mini-bar-btn playlists-mini-bar-btn--close"
        onClick={onClose}
        aria-label={t('playlists.closeMiniPlayer')}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
