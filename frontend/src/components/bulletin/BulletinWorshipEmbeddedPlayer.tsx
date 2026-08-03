import { useMemo, useState } from 'react';
import type { PlaylistItem } from '../../api/playlists';
import YoutubePlaylistPlayer, { type YoutubePlayerItem } from '../YoutubePlaylistPlayer';
import { usePlaylistPlaybackTransport } from '../../hooks/usePlaylistPlaybackTransport';
import { useI18n } from '../../i18n';
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

/** 敬拜首屏是否挂操作条（由外层按页码 gating；此处始终允许显示控件） */
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

export default function BulletinWorshipEmbeddedPlayer({
  bulletinId,
  playlistId,
  playlistTitle = '',
  items,
  lyricsPptxBlobId = null,
  presentationMode = 'youtube',
  onPresentationModeChange,
}: BulletinWorshipEmbeddedPlayerProps) {
  const { t } = useI18n();
  const mode = normalizeWorshipPresentationMode(presentationMode);
  const playerItems = useMemo(() => toWorshipPlayerItems(items), [items]);
  const hasTracks = playerItems.length > 0;
  const hasPpt = Boolean(lyricsPptxBlobId);

  const [liveMode, setLiveMode] = useState<WorshipLiveMode>(() => liveModeFor(mode, hasTracks));
  const [started, setStarted] = useState(false);
  const [maximized, setMaximized] = useState(false);

  const transport = usePlaylistPlaybackTransport({
    itemCount: playerItems.length,
    shuffleEnabled: false,
    repeatMode: 'all',
  });

  const stopPlayback = () => {
    transport.setPlaying(false);
    setStarted(false);
  };

  const openLive = (nextLive: WorshipLiveMode) => {
    setLiveMode(nextLive);
    setMaximized(true);
    if (hasTracks && (nextLive === 'youtube' || mode === 'ppt_youtube')) {
      setStarted(true);
      transport.setPlaying(true);
    }
  };

  const selectMode = (next: WorshipPresentationMode) => {
    if (next === mode) return;
    if (next === 'youtube' && !hasTracks) return;
    if (next === 'ppt_youtube' && !hasTracks && !hasPpt) return;
    onPresentationModeChange?.(next);
  };

  const startLiveFromMode = () => {
    if (mode === 'youtube') {
      if (!hasTracks) return;
      openLive('youtube');
      return;
    }
    if (mode === 'ppt_youtube') {
      openLive('ppt');
      return;
    }
    openLive('ppt');
  };

  const bgAudio = started && hasTracks && !maximized && mode === 'ppt_youtube';

  return (
    <>
      <div className="bulletin-worship-dock" role="toolbar" aria-label={t('bulletin.worshipModeLabel')}>
        <div className="bulletin-worship-dock-modes" role="group">
          <button
            type="button"
            className={`bulletin-worship-dock-mode${mode === 'ppt' ? ' is-active' : ''}`}
            aria-pressed={mode === 'ppt'}
            onClick={() => selectMode('ppt')}
          >
            {t('bulletin.worshipModePpt')}
          </button>
          <button
            type="button"
            className={`bulletin-worship-dock-mode${mode === 'youtube' ? ' is-active' : ''}`}
            aria-pressed={mode === 'youtube'}
            disabled={!hasTracks}
            onClick={() => selectMode('youtube')}
          >
            {t('bulletin.worshipModeYoutube')}
          </button>
          <button
            type="button"
            className={`bulletin-worship-dock-mode${mode === 'ppt_youtube' ? ' is-active' : ''}`}
            aria-pressed={mode === 'ppt_youtube'}
            disabled={!hasTracks && !hasPpt}
            onClick={() => selectMode('ppt_youtube')}
          >
            {t('bulletin.worshipModePptYoutube')}
          </button>
        </div>
        <div className="bulletin-worship-dock-actions">
          {bgAudio ? (
            <span className="bulletin-worship-dock-status">{t('bulletin.worshipSlidePlayingBg')}</span>
          ) : null}
          {started ? (
            <button type="button" className="bulletin-worship-dock-btn" onClick={stopPlayback}>
              {t('bulletin.worshipSlideHidePlayer')}
            </button>
          ) : null}
          <button
            type="button"
            className="bulletin-worship-dock-btn bulletin-worship-dock-btn--primary"
            onClick={startLiveFromMode}
            disabled={mode === 'youtube' ? !hasTracks : mode === 'ppt' ? !hasPpt : !hasTracks && !hasPpt}
          >
            {t('bulletin.worshipSlideOpenLive')}
          </button>
        </div>
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
          onClose={() => setMaximized(false)}
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
