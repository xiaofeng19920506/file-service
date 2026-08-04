import { useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import type { PlaylistItem } from '../../api/playlists';
import YoutubePlaylistPlayer, { type YoutubePlayerItem } from '../YoutubePlaylistPlayer';
import { ListPlayIcon } from '../icons';
import { usePlaylistPlaybackTransport } from '../../hooks/usePlaylistPlaybackTransport';
import { useI18n } from '../../i18n';
import { exitDocumentFullscreen, requestElementFullscreen } from '../../lib/fullscreen';
import BulletinWorshipMaximizeOverlay from './BulletinWorshipMaximizeOverlay';
import type { WorshipLiveMode } from '../../lib/worship-live-config';
import {
  normalizeWorshipPresentationMode,
  resolvePlayClips,
  type WorshipPresentationMode,
} from '../../lib/worship-presentation-mode';

type BulletinWorshipEmbeddedPlayerProps = {
  bulletinId: string;
  playlistId: string | null;
  playlistTitle?: string;
  items: PlaylistItem[];
  lyricsPptxBlobId?: string | null;
  presentationMode?: WorshipPresentationMode | string | null;
  onPresentationModeChange?: (mode: WorshipPresentationMode) => void;
};

/** 把歌单项展开为播放队列：多段剪切 = 多条连续播放项 */
export function toWorshipPlayerItems(items: PlaylistItem[]): YoutubePlayerItem[] {
  const out: YoutubePlayerItem[] = [];
  for (const item of items) {
    if (!item.youtubeVideoId) continue;
    const clips = resolvePlayClips(item);
    if (clips.length === 0) {
      out.push({
        youtubeVideoId: item.youtubeVideoId,
        title: item.title,
        startSeconds: null,
        endSeconds: null,
      });
      continue;
    }
    clips.forEach((clip, index) => {
      const segLabel =
        clip.label?.trim() ||
        (clips.length > 1 ? `${index + 1}/${clips.length}` : null);
      out.push({
        youtubeVideoId: item.youtubeVideoId,
        title: segLabel ? `${item.title} (${segLabel})` : item.title,
        startSeconds: clip.startSec,
        endSeconds: clip.endSec,
      });
    });
  }
  return out;
}

export function hasBulletinWorshipPlayItems(items: PlaylistItem[]): boolean {
  return toWorshipPlayerItems(items).length > 0;
}

export function shouldShowBulletinWorshipEmbedded(_opts?: {
  items?: PlaylistItem[];
  lyricsPptxBlobId?: string | null;
  playlistId?: string | null;
}): boolean {
  return true;
}

function liveModeFor(mode: WorshipPresentationMode, hasTracks: boolean): WorshipLiveMode {
  if (mode === 'youtube' && hasTracks) return 'youtube';
  return 'ppt';
}

function modeLabelKey(mode: WorshipPresentationMode): string {
  if (mode === 'ppt') return 'bulletin.worshipModePpt';
  if (mode === 'youtube') return 'bulletin.worshipModeYoutube';
  return 'bulletin.worshipModePptYoutube';
}

export default function BulletinWorshipEmbeddedPlayer({
  bulletinId,
  playlistId,
  playlistTitle = '',
  items,
  lyricsPptxBlobId = null,
  presentationMode = 'youtube',
}: BulletinWorshipEmbeddedPlayerProps) {
  const { t } = useI18n();
  const mode = normalizeWorshipPresentationMode(presentationMode);
  const playerItems = useMemo(() => toWorshipPlayerItems(items), [items]);
  const hasTracks = playerItems.length > 0;
  const hasPpt = Boolean(lyricsPptxBlobId);
  const pptOnly = mode === 'ppt';
  /** 仅 PPT 不显示 slide 播放键；有歌单的模式才显示 */
  const showSlidePlay = !pptOnly && hasTracks;

  const [liveMode, setLiveMode] = useState<WorshipLiveMode>(() => liveModeFor(mode, hasTracks));
  const [started, setStarted] = useState(false);
  const [maximized, setMaximized] = useState(false);

  const transport = usePlaylistPlaybackTransport({
    itemCount: playerItems.length,
    shuffleEnabled: false,
    repeatMode: 'all',
  });

  const openLive = (nextLive: WorshipLiveMode) => {
    setLiveMode(nextLive);
    setMaximized(true);
    if (hasTracks && (nextLive === 'youtube' || mode === 'ppt_youtube')) {
      setStarted(true);
      transport.setPlaying(true);
    }
  };

  /** 点播放：开播 + 最大化；YouTube 原生播放器 mount 后自动点全屏按钮 */
  const handlePlay = () => {
    if (!showSlidePlay) return;
    const nextLive: WorshipLiveMode = mode === 'youtube' ? 'youtube' : 'ppt';
    flushSync(() => {
      openLive(nextLive);
    });
    if (nextLive === 'youtube') {
      const btn = document.querySelector(
        '.bulletin-worship-maximize .youtube-player-fullscreen-btn',
      ) as HTMLButtonElement | null;
      if (btn) {
        btn.click();
        return;
      }
      const wrap = document.querySelector(
        '.bulletin-worship-maximize .youtube-player-frame-wrap',
      ) as HTMLElement | null;
      void requestElementFullscreen(wrap);
      return;
    }
    const stage = document.querySelector('.bulletin-worship-maximize') as HTMLElement | null;
    void requestElementFullscreen(stage ?? document.documentElement);
  };

  const handleCloseLive = () => {
    void exitDocumentFullscreen();
    setMaximized(false);
    transport.setPlaying(false);
    setStarted(false);
  };

  const bgAudio = started && hasTracks && !maximized && mode === 'ppt_youtube';

  return (
    <>
      {showSlidePlay && !maximized ? (
        <button
          type="button"
          className="bulletin-worship-slide-play"
          onClick={handlePlay}
          aria-label={t('bulletin.worshipSlideTapPlay')}
          title={t('bulletin.worshipSlideTapPlay')}
        >
          <span className="bulletin-worship-slide-play-fab" aria-hidden>
            <ListPlayIcon />
          </span>
        </button>
      ) : null}

      <div className="bulletin-worship-dock" role="status">
        <span className="bulletin-worship-dock-current">
          {t('bulletin.worshipModeCurrent', { mode: t(modeLabelKey(mode)) })}
        </span>
        {!pptOnly && !hasTracks ? (
          <span className="bulletin-worship-dock-hint">{t('bulletin.worshipSlideNeedTracks')}</span>
        ) : null}
        {pptOnly && !hasPpt ? (
          <span className="bulletin-worship-dock-hint">{t('bulletin.worshipLyricsPptxEmpty')}</span>
        ) : null}
      </div>

      {bgAudio ? (
        <div className="bulletin-worship-embedded-player--audio-only" aria-hidden>
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

      {maximized ? (
        <BulletinWorshipMaximizeOverlay
          mode={liveMode}
          onModeChange={setLiveMode}
          onClose={handleCloseLive}
          autoEnterFullscreen
          bulletinId={bulletinId}
          playlistId={playlistId ?? ''}
          playlistTitle={playlistTitle}
          items={items}
          transport={transport}
          lyricsPptxBlobId={lyricsPptxBlobId}
          allowYoutube={hasTracks}
          allowPpt={hasPpt || mode !== 'youtube'}
          requireLyricsPptx={mode === 'ppt' || mode === 'ppt_youtube'}
        />
      ) : null}
    </>
  );
}
