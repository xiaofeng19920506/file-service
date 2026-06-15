import { useEffect, useState } from 'react';
import { usePlaylistTrackLyrics } from '../hooks/usePlaylistTrackLyrics';
import PlaylistLyricsScroller from './PlaylistLyricsScroller';
import { useI18n } from '../i18n';

type PlaylistDesktopAudioCenterProps = {
  videoId: string;
  title: string;
  currentTime: number;
};

function youtubeThumb(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export default function PlaylistDesktopAudioCenter({
  videoId,
  title,
  currentTime,
}: PlaylistDesktopAudioCenterProps) {
  const { t, locale } = useI18n();
  const [showLyrics, setShowLyrics] = useState(false);
  const { captionCues, lyricsLoading, subtitleLang, changeSubtitleLang } = usePlaylistTrackLyrics({
    videoId,
    locale,
  });

  useEffect(() => {
    setShowLyrics(false);
  }, [videoId]);

  const langSwitch = (
    <div className="playlist-desktop-audio-lang" role="group" aria-label={t('playlists.subtitleLanguage')}>
      <button
        type="button"
        className={`audio-lang-btn${subtitleLang === 'zh' ? ' active' : ''}`}
        onClick={() => changeSubtitleLang('zh')}
      >
        {t('playlists.subtitleChineseShort')}
      </button>
      <button
        type="button"
        className={`audio-lang-btn${subtitleLang === 'en' ? ' active' : ''}`}
        onClick={() => changeSubtitleLang('en')}
      >
        {t('playlists.subtitleEnglishShort')}
      </button>
    </div>
  );

  if (showLyrics) {
    return (
      <div className="playlist-desktop-audio-center playlist-desktop-audio-center--lyrics">
        <header className="playlist-desktop-audio-lyrics-head">
          <button
            type="button"
            className="playlist-desktop-audio-back-btn"
            onClick={() => setShowLyrics(false)}
          >
            {t('playlists.backToCover')}
          </button>
          {langSwitch}
        </header>
        <PlaylistLyricsScroller
          cues={captionCues}
          currentTime={currentTime}
          loading={lyricsLoading}
          loadingMessage={t('playlists.loadingLyrics')}
          emptyMessage={t('playlists.noLyricsYet')}
          className="playlist-desktop-audio-lyrics"
        />
      </div>
    );
  }

  return (
    <div className="playlist-desktop-audio-center playlist-desktop-audio-center--art">
      <button
        type="button"
        className="playlist-desktop-audio-art-wrap playlist-desktop-audio-art-wrap--button"
        onClick={() => setShowLyrics(true)}
        aria-label={t('playlists.showLyrics')}
      >
        <img
          className="playlist-desktop-audio-art"
          src={youtubeThumb(videoId)}
          alt={title}
          loading="lazy"
        />
      </button>
    </div>
  );
}
