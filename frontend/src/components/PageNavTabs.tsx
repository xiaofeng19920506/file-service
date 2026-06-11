import {
  AdminNavIcon,
  LibraryNavIcon,
  MergeNavIcon,
  PlaylistsNavIcon,
} from './icons';
import type { AppPage } from '../hooks/useAppPage';
import { useI18n } from '../i18n';

type NavTarget = 'library' | 'playlists' | 'merge' | 'admin';

type PageNavTabsProps = {
  page: AppPage;
  navigate: (page: NavTarget) => void;
  canMerge: boolean;
  canEdit: boolean;
  variant: 'header' | 'bottom';
};

const NAV_ITEMS: {
  id: NavTarget;
  icon: typeof LibraryNavIcon;
  labelKey: 'nav.library' | 'nav.playlists' | 'nav.merge' | 'nav.admin';
  shortKey: 'nav.libraryShort' | 'nav.playlistsShort' | 'nav.mergeShort' | 'nav.adminShort';
  requiresMerge?: boolean;
  requiresEdit?: boolean;
}[] = [
  { id: 'library', icon: LibraryNavIcon, labelKey: 'nav.library', shortKey: 'nav.libraryShort' },
  {
    id: 'playlists',
    icon: PlaylistsNavIcon,
    labelKey: 'nav.playlists',
    shortKey: 'nav.playlistsShort',
    requiresMerge: true,
  },
  {
    id: 'merge',
    icon: MergeNavIcon,
    labelKey: 'nav.merge',
    shortKey: 'nav.mergeShort',
    requiresMerge: true,
  },
  {
    id: 'admin',
    icon: AdminNavIcon,
    labelKey: 'nav.admin',
    shortKey: 'nav.adminShort',
    requiresEdit: true,
  },
];

export default function PageNavTabs({
  page,
  navigate,
  canMerge,
  canEdit,
  variant,
}: PageNavTabsProps) {
  const { t } = useI18n();
  const isBottom = variant === 'bottom';

  const items = NAV_ITEMS.filter((item) => {
    if (item.requiresMerge && !canMerge) return false;
    if (item.requiresEdit && !canEdit) return false;
    return true;
  });

  return (
    <div
      className={`page-tabs page-tabs-${variant}`}
      role="tablist"
      aria-label={t('nav.pages')}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = page === item.id;
        const label = isBottom ? t(item.shortKey) : t(item.labelKey);

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`page-tab page-tab-${variant}${active ? ' active' : ''}`}
            onClick={() => navigate(item.id)}
          >
            {isBottom && <Icon />}
            <span className="page-tab-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
