import { useCallback, useEffect, useMemo, useState } from 'react';
import { listAdminUsers, updateAdminUser, deleteAdminUser, type AdminUserRecord } from '../api/admin-users';
import AdminTableFilter from './AdminTableFilter';
import AdminTablePagination from './AdminTablePagination';
import { useAuth } from '../auth/AuthContext';
import { matchesAdminFilter } from '../lib/admin-filter';
import { paginateItems, type AdminTablePageSize } from '../lib/admin-table-pagination';
import { friendlyError } from '../lib/error-messages';
import { roleLabelKey, type UserRole } from '../lib/permissions';
import { formatUserDisplayName } from '../lib/user-name';
import { useI18n } from '../i18n';

const ROLES: UserRole[] = ['member', 'vip', 'worship_team', 'creator', 'admin'];

type Draft = {
  firstName: string;
  lastName: string;
  role: UserRole;
};

function draftsEqual(a: Draft, b: Draft): boolean {
  return (
    a.firstName === b.firstName && a.lastName === b.lastName && a.role === b.role
  );
}

function rowDraft(row: AdminUserRecord): Draft {
  return { firstName: row.firstName, lastName: row.lastName, role: row.role };
}

function isNameValid(draft: Draft): boolean {
  return draft.firstName.trim().length >= 1 && draft.lastName.trim().length >= 1;
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function AdminUserSection() {
  const { t, locale } = useI18n();
  const { user: currentUser, refreshSession } = useAuth();
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [filterQuery, setFilterQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<AdminTablePageSize>(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listAdminUsers();
      setUsers(rows);
      setDrafts(Object.fromEntries(rows.map((row) => [row.id, rowDraft(row)])));
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'load_users_failed', t));
      setUsers([]);
      setDrafts({});
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    return users.filter((row) =>
      matchesAdminFilter(filterQuery, [
        row.email,
        row.firstName,
        row.lastName,
        formatUserDisplayName(row),
        t(roleLabelKey(row.role)),
        row.role,
      ]),
    );
  }, [users, filterQuery, t]);

  useEffect(() => {
    setPage(1);
  }, [filterQuery]);

  const pagination = useMemo(
    () => paginateItems(filteredUsers, page, pageSize),
    [filteredUsers, page, pageSize],
  );

  useEffect(() => {
    if (page !== pagination.page) setPage(pagination.page);
  }, [page, pagination.page]);

  const updateDraft = (userId: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({
      ...prev,
      [userId]: { ...prev[userId]!, ...patch },
    }));
    setSavedId(null);
  };

  const saveUser = async (row: AdminUserRecord) => {
    const draft = drafts[row.id];
    const baseline = rowDraft(row);
    const isSelf = row.id === currentUser?.id;
    const unchanged = isSelf
      ? draft.firstName === baseline.firstName && draft.lastName === baseline.lastName
      : draftsEqual(draft, baseline);
    if (!draft || unchanged) return;

    setSavingId(row.id);
    setError(null);
    setSavedId(null);
    try {
      const patch: { role?: UserRole; firstName?: string; lastName?: string } = {};
      if (draft.firstName !== row.firstName) patch.firstName = draft.firstName;
      if (draft.lastName !== row.lastName) patch.lastName = draft.lastName;
      if (!isSelf && draft.role !== row.role) patch.role = draft.role;
      const updated = await updateAdminUser(row.id, patch);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setDrafts((prev) => ({
        ...prev,
        [updated.id]: rowDraft(updated),
      }));
      setSavedId(updated.id);
      if (updated.id === currentUser?.id) {
        await refreshSession();
      }
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'update_user_failed', t));
    } finally {
      setSavingId(null);
    }
  };

  const deleteUser = async (row: AdminUserRecord) => {
    if (row.id === currentUser?.id) return;

    const displayName = formatUserDisplayName(row) || row.email;
    if (!window.confirm(t('admin.deleteUserConfirm', { name: displayName, email: row.email }))) {
      return;
    }

    setDeletingId(row.id);
    setError(null);
    setSavedId(null);
    try {
      await deleteAdminUser(row.id);
      setUsers((prev) => prev.filter((u) => u.id !== row.id));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'delete_user_failed', t));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="admin-table-section">
      <AdminTableFilter
        value={filterQuery}
        onChange={setFilterQuery}
        placeholder={t('admin.usersFilterPlaceholder')}
        resultCount={filteredUsers.length}
        totalCount={users.length}
      />

      {error && <p className="error-msg">{error}</p>}
      {loading && <p className="admin-muted">{t('admin.usersLoading')}</p>}

      {!loading && !error && (
        <div className="admin-table-wrap">
          {users.length === 0 ? (
            <div className="admin-table-empty">
              <p className="search-empty">{t('admin.usersEmpty')}</p>
            </div>
          ) : (
            <table className="admin-table admin-table-users">
              <thead>
                <tr>
                  <th className="admin-table-col-email">{t('admin.colEmail')}</th>
                  <th className="admin-table-col-first-name">{t('admin.colFirstName')}</th>
                  <th className="admin-table-col-last-name">{t('admin.colLastName')}</th>
                  <th className="admin-table-col-role">{t('admin.colRole')}</th>
                  <th className="admin-table-col-date">{t('admin.colRegistered')}</th>
                  <th className="admin-table-actions-col">{t('admin.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr className="admin-table-empty-row">
                    <td colSpan={6}>
                      <p className="admin-table-empty-msg">{t('admin.tableNoMatches')}</p>
                    </td>
                  </tr>
                ) : (
                  pagination.items.map((row) => {
                const draft = drafts[row.id] ?? rowDraft(row);
                const baseline = rowDraft(row);
                const isSelf = row.id === currentUser?.id;
                const dirty = isSelf
                  ? draft.firstName !== baseline.firstName ||
                    draft.lastName !== baseline.lastName
                  : !draftsEqual(draft, baseline);

                return (
                  <tr key={row.id}>
                    <td className="admin-table-col-email" data-label={t('admin.colEmail')}>
                      <div className="admin-table-email-cell">
                        <strong>{row.email}</strong>
                        {isSelf && (
                          <span className="nav-user-badge admin-table-badge">{t('admin.usersYou')}</span>
                        )}
                        {savedId === row.id && (
                          <span className="admin-user-saved">{t('admin.usersSaved')}</span>
                        )}
                      </div>
                    </td>
                    <td className="admin-table-col-first-name" data-label={t('admin.colFirstName')}>
                      <input
                        type="text"
                        className="admin-table-input"
                        value={draft.firstName}
                        autoComplete="given-name"
                        onChange={(e) => updateDraft(row.id, { firstName: e.target.value })}
                      />
                    </td>
                    <td className="admin-table-col-last-name" data-label={t('admin.colLastName')}>
                      <input
                        type="text"
                        className="admin-table-input"
                        value={draft.lastName}
                        autoComplete="family-name"
                        onChange={(e) => updateDraft(row.id, { lastName: e.target.value })}
                      />
                    </td>
                    <td className="admin-table-col-role" data-label={t('admin.colRole')}>
                      {isSelf ? (
                        <span className="admin-table-role-readonly" title={t('admin.cannotChangeOwnRole')}>
                          {t(roleLabelKey(row.role))}
                        </span>
                      ) : (
                        <select
                          className="admin-table-select"
                          value={draft.role}
                          onChange={(e) =>
                            updateDraft(row.id, { role: e.target.value as UserRole })
                          }
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {t(roleLabelKey(role))}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="admin-table-col-date" data-label={t('admin.colRegistered')}>
                      {formatDate(row.createdAt, locale)}
                    </td>
                    <td className="admin-table-actions-col" data-label={t('admin.colActions')}>
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          disabled={!dirty || savingId === row.id || deletingId === row.id || !isNameValid(draft)}
                          onClick={() => void saveUser(row)}
                        >
                          {savingId === row.id ? t('admin.usersSaving') : t('admin.usersSave')}
                        </button>
                        {!isSelf && (
                          <button
                            type="button"
                            className="btn-danger btn-sm"
                            disabled={deletingId === row.id || savingId === row.id}
                            onClick={() => void deleteUser(row)}
                          >
                            {deletingId === row.id ? t('admin.deleting') : t('admin.delete')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
                  })
                )}
              </tbody>
            </table>
          )}
          {!loading && !error && users.length > 0 && (
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
  );
}
