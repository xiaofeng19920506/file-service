import { useState } from 'react';
import type { PlaylistItem } from '../../api/playlists';
import YoutubePlaylistPlayer, { type YoutubePlayerItem } from '../YoutubePlaylistPlayer';
import { ListPlayIcon } from '../icons';
import { useI18n } from '../../i18n';
import { buildWorshipLiveHash, writeWorshipLiveConfig } from '../../lib/worship-live-config';

export type BulletinWorshipSlidePlayFabProps = {
  bulletinId: string;
  playlistId: string;
  items: PlaylistItem[];
  expanded: boolean;
  onToggle: () => void;
};

function toPlayerItems(items: PlaylistItem[]): YoutubePlayerItem[] {
  return items
    .filter((item) => item.youtubeVideoId)
    .map((item) => ({
      youtubeVideoId: item.youtubeVideoId,
      title: item.title,
    }));
}

/** 叠在幻灯片右上角的播放角标 */
export function BulletinWorshipSlidePlayFab({
  items,
  expanded,
  onToggle,
}: BulletinWorshipSlidePlayFabProps) {
  const { t } = useI18n();
  if (toPlayerItems(items).length === 0) return null;

  return (
    <button
      type="button"
      className={`bulletin-worship-slide-play-fab${expanded ? ' is-active' : ''}`}
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={expanded ? t('bulletin.worshipSlideHidePlayer') : t('bulletin.worshipSlidePlay')}
      title={expanded ? t('bulletin.worshipSlideHidePlayer') : t('bulletin.worshipSlidePlay')}
    >
      <ListPlayIcon />
    </button>
  );
}

type BulletinWorshipSlidePlayerPanelProps = BulletinWorshipSlidePlayFabProps;

/** 幻灯片下方展开的 YouTube 播放器 */
export function BulletinWorshipSlidePlayerPanel({
  bulletinId,
  playlistId,
  items,
  expanded,
}: BulletinWorshipSlidePlayerPanelProps) {
  const { t } = useI18n();
  const playerItems = toPlayerItems(items);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  if (!expanded || playerItems.length === 0) return null;

  const openWorshipLive = () => {
    const config = { mode: 'youtube' as const, playlistId, bulletinId };
    writeWorshipLiveConfig(config);
    window.location.hash = buildWorshipLiveHash(config);
  };

  return (
    <div className="bulletin-worship-slide-player-panel">
      <div className="bulletin-worship-slide-player-panel-head">
        <span className="bulletin-worship-slide-player-title">{t('bulletin.worshipSlidePlayerTitle')}</span>
        <button type="button" className="btn-secondary btn-sm" onClick={openWorshipLive}>
          {t('bulletin.worshipSlideOpenLive')}
        </button>
      </div>
      <YoutubePlaylistPlayer
        items={playerItems}
        activeIndex={activeIndex}
        onActiveIndexChange={setActiveIndex}
        playing={playing}
        onPlayingChange={setPlaying}
        onNextTrack={() => setActiveIndex((i) => Math.min(i + 1, playerItems.length - 1))}
        onPrevTrack={() => setActiveIndex((i) => Math.max(i - 1, 0))}
        canGoNext={activeIndex < playerItems.length - 1}
        canGoPrev={activeIndex > 0}
        mobileInline
        nativeControls
      />
    </div>
  );
}

export function hasBulletinWorshipPlayItems(items: PlaylistItem[]): boolean {
  return toPlayerItems(items).length > 0;
}
