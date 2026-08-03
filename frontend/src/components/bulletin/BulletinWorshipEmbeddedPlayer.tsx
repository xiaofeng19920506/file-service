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
import {
  normalizeWorshipPresentationMode,
  type WorshipPresentationMode,
} from '../../lib/worship-presentation-mode';

type BulletinWorshipEmbeddedPlayerProps = {
  bulletinId: string;
  playlistId: string | null;
  playlistTitle?: string;
  items: PlaylistItem[];
  slideNumber: number;
  patch: BulletinSlidePreviewParams;
  lyricsPptxBlobId?: string | null;
  presentationMode?: WorshipPresentationMode | string | null;
};

function toPlayerItems(items: PlaylistItem[]): YoutubePlayerItem[] {
  return items
    .filter((item) => item.youtubeVideoId)
    .map((item) => ({
      youtubeVideoId: item.youtubeVideoId,
      title: item.title,
      startSeconds: item.playStartSec ?? null,
      endSeconds: item.playEndSec ?? null,
    }));
}

export function hasBulletinWorshipPlayItems(items: PlaylistItem[]): boolean {
  return toPlayerItems(items).length > 0;
}

export function shouldShowBulletinWorshipEmbedded(opts: {
  mode: WorshipPresentationMode;
  items: PlaylistItem[];
  lyricsPptxBlobId?: string | null;
}): boolean {
  if (opts.mode === 'ppt') return Boolean(opts.lyricsPptxBlobId);
  if (opts.mode === 'youtube') return hasBulletinWorshipPlayItems(opts.items);
  return Boolean(opts.lyricsPptxBlobId) || hasBulletinWorshipPlayItems(opts.items);
}

export default function BulletinWorshipEmbeddedPlayer({
  bulletinId,
  playlistId,
  playlistTitle = '',
  items,
  slideNumber,
  patch,
  lyricsPptxBlobId = null,
  presentationMode = 'youtube',
}: BulletinWorshipEmbeddedPlayerProps) {
  const { t } = useI18n();
  const mode = normalizeWorshipPresentationMode(presentationMode);
  const playerItems = useMemo(() => toPlayerItems(items), [items]);
  const [started, setStarted] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [maximizeMode, setMaximizeMode] = useState<WorshipLiveMode>(
    mode === 'ppt' ? 'ppt' : mode === 'ppt_youtube' ? 'ppt' : 'youtube',
  );

  const transport = usePlaylistPlaybackTransport({
    itemCount: playerItems.length,
    shuffleEnabled: false,
    repeatMode: 'all',
  });

  if (!shouldShowBulletinWorshipEmbedded({ mode, items, lyricsPptxBlobId })) {
    return null;
  }

  const hasTracks = playerItems.length > 0;
  const pptOnly = mode === 'ppt';
  const youtubeOnly = mode === 'youtube';

  const startPlayback = () => {
    setStarted(true);
    if (hasTracks) transport.setPlaying(true);
  };

  const stopPlayback = () => {
    transport.setPlaying(false);
    setStarted(false);
  };

  const openMaximize = (liveMode: WorshipLiveMode) => {
    setMaximizeMode(liveMode);
    setMaximized(true);
    if (!started) {
      setStarted(true);
      if (hasTracks) transport.setPlaying(true);
    }
  };

  return (
    <figure
      className={`bulletin-slide-preview bulletin-worship-embedded${started ? ' is-playing' : ''}`}
    >
      <div className="bulletin-worship-embedded-stage">
        <div className="bulletin-worship-embedded-slide-back" aria-hidden={started && youtubeOnly}>
          <BulletinPptSlidePreview slideNumber={slideNumber} patch={patch} />
        </div>

        <div className="bulletin-worship-embedded-layer">
          {!started ? (
            <button type="button" className="bulletin-worship-embedded-idle" onClick={startPlayback}>
              <span className="bulletin-worship-embedded-idle-card">
                <span className="bulletin-worship-embedded-idle-icon" aria-hidden>
                  <ListPlayIcon />
                </span>
                <span className="bulletin-worship-embedded-idle-copy">
                  <span className="bulletin-worship-embedded-idle-title">
                    {pptOnly
                      ? t('bulletin.worshipSlideModePpt')
                      : t('bulletin.worshipSlideTapPlay')}
                  </span>
                  <span className="bulletin-worship-embedded-idle-meta">
                    {pptOnly
                      ? t('bulletin.worshipLyricsPptxReady')
                      : mode === 'ppt_youtube'
                        ? t('bulletin.worshipModePptYoutubeHint')
                        : t('bulletin.worshipSlideTrackCount', { count: playerItems.length })}
                  </span>
                </span>
              </span>
            </button>
          ) : !maximized && youtubeOnly && hasTracks ? (
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
          ) : !maximized && mode === 'ppt_youtube' && hasTracks ? (
            <div className="bulletin-worship-embedded-player bulletin-worship-embedded-player--audio-only">
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

        {started && !maximized ? (
          <div className="bulletin-worship-embedded-toolbar">
            {!youtubeOnly ? (
              <button
                type="button"
                className="bulletin-worship-embedded-tool"
                onClick={() => openMaximize('ppt')}
              >
                {t('bulletin.worshipSlideModePpt')}
              </button>
            ) : null}
            {hasTracks ? (
              <button
                type="button"
                className="bulletin-worship-embedded-tool bulletin-worship-embedded-tool--primary"
                onClick={() => openMaximize('youtube')}
                title={t('bulletin.worshipSlideMaximize')}
              >
                {youtubeOnly
                  ? t('bulletin.worshipSlideMaximize')
                  : t('bulletin.worshipSlideModeVideo')}
              </button>
            ) : null}
            <button
              type="button"
              className="bulletin-worship-embedded-tool"
              onClick={stopPlayback}
            >
              {t('bulletin.worshipSlideHidePlayer')}
            </button>
          </div>
        ) : !started ? (
          <div className="bulletin-worship-embedded-toolbar">
            <button
              type="button"
              className="bulletin-worship-embedded-tool bulletin-worship-embedded-tool--primary"
              onClick={() =>
                openMaximize(pptOnly || mode === 'ppt_youtube' ? 'ppt' : 'youtube')
              }
            >
              {t('bulletin.worshipSlideOpenLive')}
            </button>
          </div>
        ) : null}
      </div>

      {maximized && (
        <BulletinWorshipMaximizeOverlay
          mode={maximizeMode}
          onModeChange={setMaximizeMode}
          onClose={() => setMaximized(false)}
          bulletinId={bulletinId}
          playlistId={playlistId ?? ''}
          playlistTitle={playlistTitle}
          items={items}
          transport={transport}
          lyricsPptxBlobId={lyricsPptxBlobId}
          allowYoutube={!pptOnly && hasTracks}
          allowPpt={!youtubeOnly}
        />
      )}
    </figure>
  );
}
