import { SearchIcon } from './icons';
import { useI18n } from '../i18n';

type AdminTableFilterProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  resultCount?: number;
  totalCount?: number;
};

export default function AdminTableFilter({
  value,
  onChange,
  placeholder,
  resultCount,
  totalCount,
}: AdminTableFilterProps) {
  const { t } = useI18n();
  const showCount =
    typeof resultCount === 'number' &&
    typeof totalCount === 'number' &&
    totalCount > 0;

  return (
    <div className="admin-table-toolbar">
      <div className="admin-table-filter">
        <SearchIcon />
        <input
          type="search"
          className="admin-table-filter-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? t('admin.tableFilterPlaceholder')}
          aria-label={t('admin.tableFilterPlaceholder')}
        />
      </div>
      {showCount && (
        <span className="admin-table-count">
          {value.trim()
            ? t('admin.tableFilteredCount', { shown: resultCount, total: totalCount })
            : t('admin.tableTotalCount', { total: totalCount })}
        </span>
      )}
    </div>
  );
}
