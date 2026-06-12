import { useI18n } from '../i18n';

type PlaylistsMobilePlaybackDockProps = {
  title: string;
  trackLabel: string;
  playing: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
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
  onPlayToggle,
  onPrev,
  onNext,
}: PlaylistsMobilePlaybackDockProps) {
  const { t } = useI18n();

  return (
    <div
      className="playlists-playback-dock playlists-playback-dock--mobile playlists-playback-dock--audio mobile-only"
      role="group"
      aria-label={t('playlists.playerSectionAudio')}
    >
      <div className="playlists-playback-dock-meta">
        <span className="playlists-playback-dock-title">{title}</span>
        <span className="playlists-playback-dock-index">{trackLabel}</span>
      </div>

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
    </div>
  );
}
