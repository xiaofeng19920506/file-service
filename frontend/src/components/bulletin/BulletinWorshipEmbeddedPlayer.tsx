import { useMemo, useState } from 'react';
import type { PlaylistItem } from '../../api/playlists';
import YoutubePlaylistPlayer, { type YoutubePlayerItem } from '../YoutubePlaylistPlayer';
import { ListPlayIcon } from '../icons';
import { usePlaylistPlaybackTransport } from '../../hooks/usePlaylistPlaybackTransport';
import { useI18n } from '../../i18n';
import type { BulletinSlidePreviewParams } from '../../api/bulletins';
import BulletinPptSlidePreview from './BulletinPptSlidePreview';
import BulletinWorshipMaximizeOverlay from './BulletinWorshipMaximizeOverlay';
import type { WorshipLiveMode } from '../../lib/worship-live-config';

type BulletinWorshipEmbeddedPlayerProps = {
  bulletinId: string;
  playlistId: string;
  playlistTitle?: string;
  items: PlaylistItem[];
  slideNumber: number;
  patch: BulletinSlidePreviewParams;
  slideLabel: string;
  emptyLabel: string;
};

function toPlayerItems(items: PlaylistItem[]): YoutubePlayerItem[] {
  return items
    .filter((item) => item.youtubeVideoId)
    .map((item) => ({
      youtubeVideoId: item.youtubeVideoId,
      title: item.title,
    }));
}

export function hasBulletinWorshipPlayItems(items: PlaylistItem[]): boolean {
  return toPlayerItems(items).length > 0;
}

export default function BulletinWorshipEmbeddedPlayer({
  bulletinId,
  playlistId,
  playlistTitle = '',
  items,
  slideNumber,
  patch,
  slideLabel,
  emptyLabel,
}: BulletinWorshipEmbeddedPlayerProps) {
  const { t } = useI18n();
  const playerItems = useMemo(() => toPlayerItems(items), [items]);
  const [started, setStarted] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [maximizeMode, setMaximizeMode] = useState<WorshipLiveMode>('youtube');

  const transport = usePlaylistPlaybackTransport({
    itemCount: playerItems.length,
    shuffleEnabled: false,
    repeatMode: 'all',
  });

  if (playerItems.length === 0) return null;

  const startPlayback = () => {
    setStarted(true);
    transport.setPlaying(true);
  };

  const openMaximize = (mode: WorshipLiveMode) => {
    setMaximizeMode(mode);
    setMaximized(true);
    if (!started) {
      setStarted(true);
      transport.setPlaying(true);
    }
  };

  return (
    <figure className="bulletin-slide-preview bulletin-worship-embedded">
      <figcaption className="bulletin-slide-preview-caption">{slideLabel}</figcaption>

      <div className="bulletin-worship-embedded-stage">
        <div className="bulletin-worship-embedded-slide-back" aria-hidden={started}>
          <BulletinPptSlidePreview
            slideNumber={slideNumber}
            patch={patch}
            requireDate={false}
            emptyLabel={emptyLabel}
          />
        </div>

        <div className="bulletin-worship-embedded-layer">
          {!started ? (
            <button type="button" className="bulletin-worship-embedded-idle" onClick={startPlayback}>
              <span className="bulletin-worship-embedded-idle-icon" aria-hidden>
                <ListPlayIcon />
              </span>
              <span className="bulletin-worship-embedded-idle-title">{t('bulletin.worshipSlideTapPlay')}</span>
              <span className="bulletin-worship-embedded-idle-meta">
                {t('bulletin.worshipSlideTrackCount', { count: playerItems.length })}
              </span>
            </button>
          ) : !maximized ? (
            <div className="bulletin-worship-embedded-player">
              <YoutubePlaylistPlayer
                items={playerItems}
                activeIndex={transport.activeIndex}
                onActiveIndexChange={transport.setActiveIndex}
                playing={transport.playing}
                onPlayingChange={transport.setPlaying}
                onNextTrack={transport.goToNextTrack}
                onPrevTrack={transport.goToPrevTrack}
                canGoNext={transport.canGoNext}
                canGoPrev={transport.canGoPrev}
                mobileInline
                nativeControls
              />
            </div>
          ) : null}
        </div>

        <div className="bulletin-worship-embedded-toolbar">
          <button
            type="button"
            className="bulletin-worship-embedded-tool"
            onClick={() => openMaximize('youtube')}
          >
            {t('bulletin.worshipSlideModeVideo')}
          </button>
          <button
            type="button"
            className="bulletin-worship-embedded-tool"
            onClick={() => openMaximize('ppt')}
          >
            {t('bulletin.worshipSlideModePpt')}
          </button>
          <button
            type="button"
            className="bulletin-worship-embedded-tool bulletin-worship-embedded-tool--primary"
            onClick={() => openMaximize(maximizeMode)}
            title={t('bulletin.worshipSlideMaximize')}
          >
            {t('bulletin.worshipSlideMaximize')}
          </button>
        </div>
      </div>

      {maximized && (
        <BulletinWorshipMaximizeOverlay
          mode={maximizeMode}
          onModeChange={setMaximizeMode}
          onClose={() => setMaximized(false)}
          bulletinId={bulletinId}
          playlistId={playlistId}
          playlistTitle={playlistTitle}
          items={items}
          transport={transport}
        />
      )}
    </figure>
  );
}
