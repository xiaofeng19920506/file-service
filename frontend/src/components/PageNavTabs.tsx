import {
  AdminNavIcon,
  BulletinNavIcon,
  HomeNavIcon,
  LibraryNavIcon,
  MergeNavIcon,
  PlaylistsNavIcon,
  WorshipNavIcon,
} from './icons';
import type { AppPage } from '../hooks/useAppPage';
import { useI18n } from '../i18n';

type NavTarget = 'library' | 'playlists' | 'playlist-lists' | 'merge' | 'bulletin' | 'worship' | 'admin';

type PageNavTabsProps = {
  page: AppPage;
  navigate: (page: NavTarget) => void;
  canSearch: boolean;
  canAccessPlaylists: boolean;
  canMerge: boolean;
  canViewBulletin: boolean;
  canStartWorship: boolean;
  canEdit: boolean;
  variant: 'header' | 'bottom';
};

const NAV_ITEMS: {
  id: NavTarget;
  icon: typeof LibraryNavIcon;
  labelKey: 'nav.library' | 'nav.playlistsShort' | 'nav.playlistLists' | 'nav.merge' | 'nav.bulletinShort' | 'nav.worshipShort' | 'nav.admin';
  requiresSearch?: boolean;
  requiresPlaylists?: boolean;
  requiresMerge?: boolean;
  requiresBulletin?: boolean;
  requiresWorship?: boolean;
  requiresEdit?: boolean;
  bottomOnly?: boolean;
  /** 桌面顶栏不展示（首页由左侧应用名标识即可） */
  headerHidden?: boolean;
}[] = [
  {
    id: 'playlists',
    icon: HomeNavIcon,
    labelKey: 'nav.playlistsShort',
    requiresPlaylists: true,
    headerHidden: true,
  },
  {
    id: 'playlist-lists',
    icon: PlaylistsNavIcon,
    labelKey: 'nav.playlistLists',
    requiresPlaylists: true,
    bottomOnly: true,
  },
  {
    id: 'library',
    icon: LibraryNavIcon,
    labelKey: 'nav.library',
    requiresSearch: true,
  },
  {
    id: 'merge',
    icon: MergeNavIcon,
    labelKey: 'nav.merge',
    requiresMerge: true,
  },
  {
    id: 'bulletin',
    icon: BulletinNavIcon,
    labelKey: 'nav.bulletinShort',
    requiresBulletin: true,
  },
  {
    id: 'worship',
    icon: WorshipNavIcon,
    labelKey: 'nav.worshipShort',
    requiresWorship: true,
  },
  {
    id: 'admin',
    icon: AdminNavIcon,
    labelKey: 'nav.admin',
    requiresEdit: true,
  },
];

export default function PageNavTabs({
  page,
  navigate,
  canSearch,
  canAccessPlaylists,
  canMerge,
  canViewBulletin,
  canStartWorship,
  canEdit,
  variant,
}: PageNavTabsProps) {
  const { t } = useI18n();
  const isBottom = variant === 'bottom';

  const items = NAV_ITEMS.filter((item) => {
    if (item.bottomOnly && !isBottom) return false;
    if (item.headerHidden && !isBottom) return false;
    if (item.requiresSearch && !canSearch) return false;
    if (item.requiresPlaylists && !canAccessPlaylists) return false;
    if (item.requiresMerge && !canMerge) return false;
    if (item.requiresBulletin && !canViewBulletin) return false;
    if (item.requiresWorship && !canStartWorship) return false;
    if (item.requiresEdit && !canEdit) return false;
    return true;
  });

  if (items.length === 0) return null;

  return (
    <div
      className={`page-tabs page-tabs-${variant}`}
      role="tablist"
      aria-label={t('nav.pages')}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = page === item.id || (item.id === 'worship' && page === 'worship-live');
        const label = t(item.labelKey);

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={isBottom ? label : undefined}
            title={isBottom ? label : undefined}
            className={`page-tab page-tab-${variant}${active ? ' active' : ''}`}
            onClick={() => navigate(item.id)}
          >
            {isBottom ? <Icon /> : <span className="page-tab-label">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
