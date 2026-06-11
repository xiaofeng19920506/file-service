import { ADMIN_TABLE_PAGE_SIZES, type AdminTablePageSize } from '../lib/admin-table-pagination';
import { useI18n } from '../i18n';

type AdminTablePaginationProps = {
  page: number;
  pageSize: AdminTablePageSize;
  totalItems: number;
  rangeStart: number;
  rangeEnd: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: AdminTablePageSize) => void;
};

export default function AdminTablePagination({
  page,
  pageSize,
  totalItems,
  rangeStart,
  rangeEnd,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: AdminTablePaginationProps) {
  const { t } = useI18n();

  if (totalItems === 0) return null;

  return (
    <div className="admin-table-pagination">
      <span className="admin-table-pagination-summary">
        {t('admin.paginationShowing', {
          from: rangeStart,
          to: rangeEnd,
          total: totalItems,
        })}
      </span>

      <div className="admin-table-pagination-controls">
        <label className="admin-table-page-size">
          <span>{t('admin.paginationPageSize')}</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) as AdminTablePageSize)}
          >
            {ADMIN_TABLE_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <span className="admin-table-pagination-page">
          {t('admin.paginationPage', { page, totalPages })}
        </span>

        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t('admin.paginationPrev')}
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          {t('admin.paginationNext')}
        </button>
      </div>
    </div>
  );
}
