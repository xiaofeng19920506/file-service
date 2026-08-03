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

/** 敬拜首屏是否挂操作条（不替换原 slide） */
export function shouldShowBulletinWorshipEmbedded(opts: {
  items: PlaylistItem[];
  lyricsPptxBlobId?: string | null;
  playlistId?: string | null;
}): boolean {
  return (
    Boolean(opts.playlistId) ||
    hasBulletinWorshipPlayItems(opts.items) ||
    Boolean(opts.lyricsPptxBlobId)
  );
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
  const defaultMode = normalizeWorshipPresentationMode(presentationMode);
  const playerItems = useMemo(() => toWorshipPlayerItems(items), [items]);
  const hasTracks = playerItems.length > 0;
  const hasPpt = Boolean(lyricsPptxBlobId);

  const [liveMode, setLiveMode] = useState<WorshipLiveMode>(
    defaultMode === 'youtube' && hasTracks ? 'youtube' : 'ppt',
  );
  const [started, setStarted] = useState(false);
  const [maximized, setMaximized] = useState(false);
  /** 嵌入预览时选择的显示形式；可随时切换，不限于周报默认 mode */
  const [viewMode, setViewMode] = useState<WorshipPresentationMode>(defaultMode);

  const transport = usePlaylistPlaybackTransport({
    itemCount: playerItems.length,
    shuffleEnabled: false,
    repeatMode: 'all',
  });

  if (!shouldShowBulletinWorshipEmbedded({ items, lyricsPptxBlobId, playlistId })) {
    return null;
  }

  const startBackgroundAudio = () => {
    if (!hasTracks) return;
    setStarted(true);
    transport.setPlaying(true);
  };

  const stopPlayback = () => {
    transport.setPlaying(false);
    setStarted(false);
  };

  const openLive = (mode: WorshipLiveMode) => {
    setLiveMode(mode);
    setMaximized(true);
    if (hasTracks) {
      setStarted(true);
      transport.setPlaying(true);
    }
  };

  const applyViewMode = (mode: WorshipPresentationMode) => {
    setViewMode(mode);
    if (mode === 'youtube') {
      if (hasTracks) openLive('youtube');
      return;
    }
    if (mode === 'ppt') {
      openLive('ppt');
      return;
    }
    // ppt_youtube：歌词投影 + 背景音频
    openLive('ppt');
    startBackgroundAudio();
  };

  return (
    <>
      <div className="bulletin-worship-dock" role="toolbar" aria-label={t('bulletin.worshipModeLabel')}>
        <div className="bulletin-worship-dock-modes" role="group">
          <button
            type="button"
            className={`bulletin-worship-dock-mode${viewMode === 'ppt' ? ' is-active' : ''}`}
            onClick={() => applyViewMode('ppt')}
          >
            {t('bulletin.worshipModePpt')}
          </button>
          <button
            type="button"
            className={`bulletin-worship-dock-mode${viewMode === 'youtube' ? ' is-active' : ''}`}
            disabled={!hasTracks}
            onClick={() => applyViewMode('youtube')}
          >
            {t('bulletin.worshipModeYoutube')}
          </button>
          <button
            type="button"
            className={`bulletin-worship-dock-mode${viewMode === 'ppt_youtube' ? ' is-active' : ''}`}
            disabled={!hasTracks && !hasPpt}
            onClick={() => applyViewMode('ppt_youtube')}
          >
            {t('bulletin.worshipModePptYoutube')}
          </button>
        </div>
        <div className="bulletin-worship-dock-actions">
          {started && hasTracks && !maximized ? (
            <span className="bulletin-worship-dock-status">
              {t('bulletin.worshipSlidePlayingBg')}
            </span>
          ) : null}
          {started ? (
            <button type="button" className="bulletin-worship-dock-btn" onClick={stopPlayback}>
              {t('bulletin.worshipSlideHidePlayer')}
            </button>
          ) : null}
          <button
            type="button"
            className="bulletin-worship-dock-btn bulletin-worship-dock-btn--primary"
            onClick={() =>
              applyViewMode(
                viewMode === 'youtube' && hasTracks
                  ? 'youtube'
                  : viewMode === 'ppt_youtube'
                    ? 'ppt_youtube'
                    : 'ppt',
              )
            }
          >
            {t('bulletin.worshipSlideOpenLive')}
          </button>
        </div>
      </div>

      {/* 背景音频：不遮盖原 slide，仅在 ppt_youtube / 已开始时挂载 */}
      {started && hasTracks && !maximized && viewMode !== 'youtube' ? (
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

      {maximized && (
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
          allowPpt
        />
      )}
    </>
  );
}
