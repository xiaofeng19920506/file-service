import { useMemo, useState } from 'react';
import YoutubePlaylistPlayer, { type YoutubePlayerItem } from '../YoutubePlaylistPlayer';
import { ListPlayIcon } from '../icons';
import { useI18n } from '../../i18n';
import { youtubeThumbnailSrc } from '../../lib/youtube-thumbnail';

type BulletinDoxologyEmbeddedPlayerProps = {
  youtubeVideoId: string;
};

function PauseIcon() {
  return (
    <svg className="player-chrome-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export default function BulletinDoxologyEmbeddedPlayer({
  youtubeVideoId,
}: BulletinDoxologyEmbeddedPlayerProps) {
  const { t } = useI18n();
  const videoId = youtubeVideoId.trim();
  const hasVideo = Boolean(videoId);

  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const items = useMemo((): YoutubePlayerItem[] => {
    if (!hasVideo) return [];
    return [{ youtubeVideoId: videoId, title: t('bulletin.sections.doxology') }];
  }, [hasVideo, videoId, t]);

  const thumbSrc = hasVideo ? youtubeThumbnailSrc(videoId, 'hqdefault') : '';

  const handlePlay = () => {
    if (!hasVideo) return;
    setStarted(true);
    setPlaying(true);
  };

  const handlePause = () => {
    setPlaying(false);
  };

  const handleStop = () => {
    setPlaying(false);
    setStarted(false);
  };

  const handleThumbClick = () => {
    if (!hasVideo) return;
    if (playing) handlePause();
    else handlePlay();
  };

  return (
    <>
      {hasVideo ? (
        <div className="bulletin-doxology-slide-stage" aria-hidden={false}>
          <button
            type="button"
            className={`bulletin-doxology-thumb-hotspot${playing ? ' is-playing' : ''}`}
            onClick={handleThumbClick}
            aria-label={
              playing ? t('bulletin.doxologySlidePause') : t('bulletin.doxologySlideTapPlay')
            }
            title={playing ? t('bulletin.doxologySlidePause') : t('bulletin.doxologySlideTapPlay')}
          >
            <img
              className="bulletin-doxology-thumb-img"
              src={thumbSrc}
              alt=""
              draggable={false}
            />
            <span className="bulletin-doxology-thumb-fab" aria-hidden>
              {playing ? <PauseIcon /> : <ListPlayIcon />}
            </span>
          </button>
        </div>
      ) : null}

      <div className="bulletin-worship-dock" role="status">
        {!hasVideo ? (
          <span className="bulletin-worship-dock-hint">{t('bulletin.doxologyNeedVideo')}</span>
        ) : playing ? (
          <>
            <span className="bulletin-worship-dock-current">{t('bulletin.doxologyPlayingBg')}</span>
            <button type="button" className="bulletin-doxology-dock-btn" onClick={handlePause}>
              {t('bulletin.doxologySlidePause')}
            </button>
            <button type="button" className="bulletin-doxology-dock-btn" onClick={handleStop}>
              {t('bulletin.doxologySlideStop')}
            </button>
          </>
        ) : started ? (
          <>
            <span className="bulletin-worship-dock-hint">{t('bulletin.doxologyPaused')}</span>
            <button type="button" className="bulletin-doxology-dock-btn" onClick={handlePlay}>
              {t('bulletin.doxologySlideResume')}
            </button>
            <button type="button" className="bulletin-doxology-dock-btn" onClick={handleStop}>
              {t('bulletin.doxologySlideStop')}
            </button>
          </>
        ) : (
          <span className="bulletin-worship-dock-hint">{t('bulletin.doxologySlideHint')}</span>
        )}
      </div>

      {started && hasVideo ? (
        <div className="bulletin-worship-embedded-player--audio-only" aria-hidden>
          <YoutubePlaylistPlayer
            items={items}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
            playing={playing}
            onPlayingChange={setPlaying}
            onNextTrack={() => {
              setPlaying(false);
              setStarted(false);
            }}
            canGoNext={false}
            canGoPrev={false}
            mobileInline
            nativeControls
          />
        </div>
      ) : null}
    </>
  );
}
