export const ADMIN_MEDIA_FOLDER_IDS = ['movies', 'tv', 'videos', 'anime', 'variety'] as const;

export type AdminMediaFolderId = (typeof ADMIN_MEDIA_FOLDER_IDS)[number];

export type AdminMediaFolder = {
  id: AdminMediaFolderId;
  /** 飞牛「影视」下的子文件夹名 */
  dirName: string;
  /** 给用户看的 NAS 路径 */
  nasLabel: string;
};

export const ADMIN_MEDIA_FOLDERS: AdminMediaFolder[] = [
  {
    id: 'movies',
    dirName: '电影',
    nasLabel: '存储空间 1/admin 的文件/影视/电影',
  },
  {
    id: 'tv',
    dirName: '电视剧',
    nasLabel: '存储空间 1/admin 的文件/影视/电视剧',
  },
  {
    id: 'videos',
    dirName: '视频',
    nasLabel: '存储空间 1/admin 的文件/影视/视频',
  },
  {
    id: 'anime',
    dirName: '动漫',
    nasLabel: '存储空间 1/admin 的文件/影视/动漫',
  },
  {
    id: 'variety',
    dirName: '综艺',
    nasLabel: '存储空间 1/admin 的文件/影视/综艺',
  },
];

export function parseAdminMediaFolderId(raw: string | undefined): AdminMediaFolderId | null {
  const value = raw?.trim();
  return ADMIN_MEDIA_FOLDER_IDS.find((id) => id === value) ?? null;
}

export function adminMediaFolderById(id: AdminMediaFolderId): AdminMediaFolder {
  const found = ADMIN_MEDIA_FOLDERS.find((item) => item.id === id);
  if (!found) throw new Error('invalid_download_folder');
  return found;
}
