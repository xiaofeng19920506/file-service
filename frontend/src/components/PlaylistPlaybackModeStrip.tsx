import { ListPlayIcon, PlaybackOrderModeIcon } from './icons';
import { useI18n } from '../i18n';
import type { PlaylistPlaybackOrderMode } from '../lib/playlist-playback-order-mode';

export const PLAYBACK_ORDER_MODES: PlaylistPlaybackOrderMode[] = [
  'sequential',
  'loop_all',
  'loop_one',
  'shuffle',
];

export function playbackOrderShortLabel(
  mode: PlaylistPlaybackOrderMode,
  t: (key: string) => string,
): string {
  switch (mode) {
    case 'loop_all':
      return t('playlists.playOrderLoopAllShort');
    case 'loop_one':
      return t('playlists.repeatOne');
    case 'shuffle':
      return t('playlists.shuffleShort');
    default:
      return t('playlists.playOrderSequentialShort');
  }
}

export function playbackOrderFullLabel(
  mode: PlaylistPlaybackOrderMode,
  t: (key: string) => string,
): string {
  switch (mode) {
    case 'loop_all':
      return t('playlists.repeatAll');
    case 'loop_one':
      return t('playlists.repeatOne');
    case 'shuffle':
      return t('playlists.shuffle');
    default:
      return t('playlists.playOrderSequential');
  }
}

type PlaylistPlaybackModeStripProps = {
  mode: PlaylistPlaybackOrderMode;
  onSelectMode: (mode: PlaylistPlaybackOrderMode) => void;
  compact?: boolean;
};

export default function PlaylistPlaybackModeStrip({
  mode,
  onSelectMode,
  compact = false,
}: PlaylistPlaybackModeStripProps) {
  const { t } = useI18n();

  return (
    <div
      className={`playlist-play-order-grid${compact ? ' playlist-play-order-grid--compact' : ''}`}
      role="radiogroup"
      aria-label={t('playlists.playOrderTitle')}
    >
      {PLAYBACK_ORDER_MODES.map((value) => {
        const selected = mode === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`playlist-play-order-grid-btn${selected ? ' active' : ''}`}
            onClick={() => onSelectMode(value)}
          >
            <span className="playlist-play-order-grid-icon" aria-hidden>
              {value === 'sequential' ? <ListPlayIcon /> : <PlaybackOrderModeIcon mode={value} />}
            </span>
            <span className="playlist-play-order-grid-label">{playbackOrderShortLabel(value, t)}</span>
          </button>
        );
      })}
    </div>
  );
}
