import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppPage } from '../hooks/useAppPage';
import { searchBlobs, deleteBlob } from '../api/client';
import AdminUserSection from '../components/AdminUserSection';
import AdminTableFilter from '../components/AdminTableFilter';
import AdminTablePagination from '../components/AdminTablePagination';
import EditLibraryEntryModal from '../components/EditLibraryEntryModal';
import { useAuth } from '../auth/AuthContext';
import { formatContentFingerprint } from '../lib/content-fingerprint';
import { matchesAdminFilter } from '../lib/admin-filter';
import { paginateItems, type AdminTablePageSize } from '../lib/admin-table-pagination';
import { formatSize } from '../lib/file-accept';
import { friendlyError } from '../lib/error-messages';
import { localizedSongTitle } from '../lib/song-title';
import { useI18n } from '../i18n';
import type { BlobRecord } from '../types';

type AdminTab = 'library' | 'users';

function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(locale);
  } catch {
    return iso;
  }
}

export default function AdminPage() {
  const { t, locale } = useI18n();
  const { permissions } = useAuth();
  const { navigate } = useAppPage();
  const [tab, setTab] = useState<AdminTab>('library');
  const [filterQuery, setFilterQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<AdminTablePageSize>(10);
  const [blobs, setBlobs] = useState<BlobRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingBlob, setEditingBlob] = useState<BlobRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!permissions.canEdit) navigate('library');
  }, [permissions.canEdit, navigate]);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await searchBlobs('', { limit: 200 });
      setBlobs(rows);
    } catch (err) {
      setLoadError(friendlyError(err instanceof Error ? err.message : 'search_failed', t));
      setBlobs([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (tab === 'library') void loadLibrary();
  }, [tab, loadLibrary]);

  const filteredBlobs = useMemo(() => {
    return blobs.filter((blob) => {
      const title = localizedSongTitle(blob, locale, blob.originalFilename ?? blob.id);
      return matchesAdminFilter(filterQuery, [
        title,
        blob.titleEn,
        blob.titleZhCn,
        blob.titleZhTw,
        blob.composer,
        blob.author,
        blob.originalFilename,
        blob.uploadedBy,
        blob.updatedBy,
        blob.contentSha256 ? formatContentFingerprint(blob.contentSha256) : null,
      ]);
    });
  }, [blobs, filterQuery, locale]);

  useEffect(() => {
    setPage(1);
  }, [filterQuery]);

  const pagination = useMemo(
    () => paginateItems(filteredBlobs, page, pageSize),
    [filteredBlobs, page, pageSize],
  );

  useEffect(() => {
    if (page !== pagination.page) setPage(pagination.page);
  }, [page, pagination.page]);

  const onSaved = (updated: BlobRecord) => {
    setBlobs((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
    setEditingBlob((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
  };

  const onDeleted = (blobId: string) => {
    setBlobs((prev) => prev.filter((row) => row.id !== blobId));
    setEditingBlob((prev) => (prev?.id === blobId ? null : prev));
  };

  const handleDelete = async (blob: BlobRecord) => {
    const displayTitle = localizedSongTitle(
      blob,
      locale,
      blob.originalFilename ?? blob.id,
    );
    if (!window.confirm(t('admin.deleteConfirm', { title: displayTitle }))) return;

    setDeletingId(blob.id);
    setLoadError(null);
    try {
      await deleteBlob(blob.id);
      onDeleted(blob.id);
    } catch (err) {
      setLoadError(friendlyError(err instanceof Error ? err.message : 'delete_failed', t));
    } finally {
      setDeletingId(null);
    }
  };

  if (!permissions.canEdit) return null;

  return (
    <main className="admin-page">
      <div className="admin-toolbar">
        <h1>{t('admin.title')}</h1>
      </div>

      <div className="admin-tabs page-tabs" role="tablist" aria-label={t('admin.tabs')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'library'}
          className={`page-tab${tab === 'library' ? ' active' : ''}`}
          onClick={() => setTab('library')}
        >
          {t('admin.tabLibrary')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'users'}
          className={`page-tab${tab === 'users' ? ' active' : ''}`}
          onClick={() => setTab('users')}
        >
          {t('admin.tabUsers')}
        </button>
      </div>

      {tab === 'users' ? (
        <AdminUserSection />
      ) : (
        <section className="admin-table-section">
          <AdminTableFilter
            value={filterQuery}
            onChange={setFilterQuery}
            placeholder={t('admin.libraryFilterPlaceholder')}
            resultCount={filteredBlobs.length}
            totalCount={blobs.length}
          />

          {loadError && <p className="error-msg">{loadError}</p>}
          {loading && <p className="admin-muted">{t('admin.libraryLoading')}</p>}

          {!loading && !loadError && (
            <div className="admin-table-wrap">
              {blobs.length === 0 ? (
                <div className="admin-table-empty">
                  <p className="search-empty">{t('admin.libraryEmpty')}</p>
                </div>
              ) : (
                <table className="admin-table admin-table-library">
                  <thead>
                    <tr>
                      <th className="admin-table-col-title">{t('admin.colTitle')}</th>
                      <th className="admin-table-col-composer">{t('admin.colComposer')}</th>
                      <th className="admin-table-col-author">{t('admin.colAuthor')}</th>
                      <th className="admin-table-col-size">{t('admin.colSize')}</th>
                      <th className="admin-table-col-updated">{t('admin.colUpdated')}</th>
                      <th className="admin-table-actions-col">{t('admin.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBlobs.length === 0 ? (
                      <tr className="admin-table-empty-row">
                        <td colSpan={6}>
                          <p className="admin-table-empty-msg">{t('admin.tableNoMatches')}</p>
                        </td>
                      </tr>
                    ) : (
                      pagination.items.map((blob) => {
                        const displayTitle = localizedSongTitle(
                          blob,
                          locale,
                          blob.originalFilename ?? blob.id,
                        );
                        return (
                          <tr key={blob.id}>
                            <td className="admin-table-col-title">
                              <span className="admin-table-title">{displayTitle}</span>
                            </td>
                            <td className="admin-table-col-composer">{blob.composer || '—'}</td>
                            <td className="admin-table-col-author">{blob.author || '—'}</td>
                            <td className="admin-table-col-size">{formatSize(blob.sizeBytes)}</td>
                            <td className="admin-table-col-updated">
                              {formatDateTime(blob.updatedAt ?? blob.createdAt, locale)}
                            </td>
                            <td className="admin-table-actions-col">
                              <div className="admin-table-actions">
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  onClick={() => setEditingBlob(blob)}
                                >
                                  {t('library.edit')}
                                </button>
                                <button
                                  type="button"
                                  className="btn-danger btn-sm"
                                  disabled={deletingId === blob.id}
                                  onClick={() => void handleDelete(blob)}
                                >
                                  {deletingId === blob.id ? t('admin.deleting') : t('admin.delete')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
              {!loading && !loadError && blobs.length > 0 && (
                <AdminTablePagination
                  page={pagination.page}
                  pageSize={pageSize}
                  totalItems={pagination.totalItems}
                  rangeStart={pagination.rangeStart}
                  rangeEnd={pagination.rangeEnd}
                  totalPages={pagination.totalPages}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                />
              )}
            </div>
          )}
        </section>
      )}

      {editingBlob && (
        <EditLibraryEntryModal
          blob={editingBlob}
          onClose={() => setEditingBlob(null)}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    </main>
  );
}
