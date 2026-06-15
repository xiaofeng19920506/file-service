import type { ReactNode } from 'react';

type PlaylistListRowProps = {
  title: string;
  meta: ReactNode;
  onSelect: () => void;
};

/** 桌面端侧栏列表项：点击进入详情，操作在详情工具栏完成 */
export default function PlaylistListRow({ title, meta, onSelect }: PlaylistListRowProps) {
  return (
    <button type="button" className="playlists-list-item" onClick={onSelect}>
      <span className="playlists-list-item-body">
        <span className="playlists-list-title">{title}</span>
        <span className="playlists-list-meta">{meta}</span>
      </span>
    </button>
  );
}
