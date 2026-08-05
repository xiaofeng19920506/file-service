import { youtubeThumbnailSrc } from '../../lib/youtube-thumbnail';

type WorshipTrackThumbnailProps = {
  videoId: string;
  title: string;
};

/** 敬拜 / 歌单列表左侧 YouTube 缩略图（16:9） */
export default function WorshipTrackThumbnail({ videoId, title }: WorshipTrackThumbnailProps) {
  return (
    <span className="worship-track-thumb-wrap">
      <img
        className="worship-track-thumb"
        src={youtubeThumbnailSrc(videoId)}
        alt=""
        title={title}
        loading="lazy"
        draggable={false}
      />
    </span>
  );
}
