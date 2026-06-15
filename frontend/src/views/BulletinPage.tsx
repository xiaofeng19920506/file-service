import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createBulletin,
  getBulletin,
  listBulletins,
  saveBulletinAnnouncements,
  updateBulletin,
  type AnnouncementInput,
  type WeeklyBulletin,
} from '../api/bulletins';
import { useAuth } from '../auth/AuthContext';
import { useBulletinRealtime } from '../hooks/useBulletinRealtime';
import { useI18n } from '../i18n';
import { publishBulletinPptx, resolveBulletinPptxBlob } from '../lib/bulletin-publish';
import { readWorshipLiveConfig, writeWorshipLiveConfig } from '../lib/worship-live-config';

type AnnouncementDraft = AnnouncementInput & { key: string };

function emptyAnnouncement(): AnnouncementDraft {
  return { key: crypto.randomUUID(), category: 'general', title: '', body: '' };
}

function toDrafts(bulletin: WeeklyBulletin): AnnouncementDraft[] {
  if (!bulletin.announcements.length) return [emptyAnnouncement()];
  return bulletin.announcements.map((a) => ({
    key: a.id,
    category: a.category,
    title: a.title,
    body: a.body,
  }));
}

function nextSundayIso(from = new Date()): string {
  const d = new Date(from);
  const day = d.getDay();
  const add = day === 0 ? 7 : 7 - day;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

export default function BulletinPage() {
  const { t } = useI18n();
  const { permissions } = useAuth();
  const canManage = permissions.canManageBulletin;
  const canPublish = canManage && permissions.canUpload;

  const [bulletins, setBulletins] = useState<WeeklyBulletin[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WeeklyBulletin | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementDraft[]>([emptyAnnouncement()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const skipVerseAutosaveRef = useRef(true);
  const verseFocusedRef = useRef(false);
  const savingRef = useRef(false);
  savingRef.current = saving || publishing;

  useEffect(() => {
    skipVerseAutosaveRef.current = true;
    const timer = window.setTimeout(() => {
      skipVerseAutosaveRef.current = false;
    }, 600);
    return () => window.clearTimeout(timer);
  }, [selectedId, draft?.updatedAt]);

  useBulletinRealtime(
    selectedId,
    (event) => {
      if (!selectedId || savingRef.current) return;
      if (event.updatedAt === draft?.updatedAt) return;
      void (async () => {
        const remote = await getBulletin(selectedId);
        skipVerseAutosaveRef.current = true;
        setDraft((prev) => {
          if (!prev || prev.id !== remote.id) return remote;
          if (verseFocusedRef.current) {
            return { ...remote, verseOfWeek: prev.verseOfWeek };
          }
          return remote;
        });
        if (!verseFocusedRef.current) {
          setAnnouncements(toDrafts(remote));
        }
        window.setTimeout(() => {
          skipVerseAutosaveRef.current = false;
        }, 600);
      })();
    },
    Boolean(selectedId),
  );

  useEffect(() => {
    if (!canManage || !draft || skipVerseAutosaveRef.current) return;
    const timer = window.setTimeout(() => {
      void updateBulletin(draft.id, { verseOfWeek: draft.verseOfWeek }).then((updated) => {
        setDraft((prev) =>
          prev && prev.id === updated.id
            ? { ...prev, verseOfWeek: updated.verseOfWeek, updatedAt: updated.updatedAt }
            : prev,
        );
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [canManage, draft?.id, draft?.verseOfWeek]);

  const refreshList = useCallback(async () => {
    const rows = await listBulletins();
    setBulletins(rows);
    return rows;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const rows = await refreshList();
        if (!cancelled && rows[0]) {
          setSelectedId(rows[0].id);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshList]);

  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const bulletin = await getBulletin(selectedId);
        if (cancelled) return;
        setDraft(bulletin);
        setAnnouncements(toDrafts(bulletin));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selectedLabel = useMemo(() => {
    if (!draft) return '';
    return `${draft.serviceDate} · ${draft.serviceTime}`;
  }, [draft]);

  const patchField = <K extends keyof WeeklyBulletin>(key: K, value: WeeklyBulletin[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleCreate = async () => {
    if (!canManage) return;
    try {
      setSaving(true);
      setError(null);
      const bulletin = await createBulletin(nextSundayIso());
      await refreshList();
      setSelectedId(bulletin.id);
      setMessage(t('bulletin.created'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!canManage || !draft) return;
    try {
      setSaving(true);
      setError(null);
      const updated = await updateBulletin(draft.id, {
        serviceDate: draft.serviceDate,
        serviceTime: draft.serviceTime,
        status: draft.status,
        lastWeekOfferingDate: draft.lastWeekOfferingDate,
        offeringQuarterLabel: draft.offeringQuarterLabel,
        birthdayMonth: draft.birthdayMonth,
        birthdayNames: draft.birthdayNames,
        staffMeetingDate: draft.staffMeetingDate,
        testimonyShareDate: draft.testimonyShareDate,
        serviceRosterText: draft.serviceRosterText,
        baptismText: draft.baptismText,
        verseOfWeek: draft.verseOfWeek,
        weeklyMeetingVariant: draft.weeklyMeetingVariant,
        skipTestimonyWeek: draft.skipTestimonyWeek,
        skipDepartmentReports: draft.skipDepartmentReports,
      });
      const withAnnouncements = await saveBulletinAnnouncements(
        updated.id,
        announcements
          .filter((a) => a.body.trim() || (a.title ?? '').trim())
          .map(({ category, title, body }) => ({ category, title, body })),
      );
      setDraft(withAnnouncements);
      setAnnouncements(toDrafts(withAnnouncements));
      await refreshList();
      setMessage(t('bulletin.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!draft) return;
    try {
      setGenerating(true);
      setError(null);
      const file = await resolveBulletinPptxBlob(draft);
      const downloadFile =
        file instanceof File
          ? file
          : new File([file], `bulletin-${draft.serviceDate}.pptx`, {
              type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            });
      const url = URL.createObjectURL(downloadFile);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFile.name;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(t('bulletin.generated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!canManage || !draft) return;
    try {
      setPublishing(true);
      setError(null);
      const saved = await updateBulletin(draft.id, {
        serviceDate: draft.serviceDate,
        serviceTime: draft.serviceTime,
        lastWeekOfferingDate: draft.lastWeekOfferingDate,
        offeringQuarterLabel: draft.offeringQuarterLabel,
        birthdayMonth: draft.birthdayMonth,
        birthdayNames: draft.birthdayNames,
        staffMeetingDate: draft.staffMeetingDate,
        testimonyShareDate: draft.testimonyShareDate,
        serviceRosterText: draft.serviceRosterText,
        baptismText: draft.baptismText,
        verseOfWeek: draft.verseOfWeek,
        weeklyMeetingVariant: draft.weeklyMeetingVariant,
        skipTestimonyWeek: draft.skipTestimonyWeek,
        skipDepartmentReports: draft.skipDepartmentReports,
      });
      const withAnnouncements = await saveBulletinAnnouncements(
        saved.id,
        announcements
          .filter((a) => a.body.trim() || (a.title ?? '').trim())
          .map(({ category, title, body }) => ({ category, title, body })),
      );
      const { bulletin } = await publishBulletinPptx(withAnnouncements);
      setDraft(bulletin);
      setAnnouncements(toDrafts(bulletin));
      await refreshList();
      setMessage(t('bulletin.published'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return <p className="bulletin-loading">{t('bulletin.loading')}</p>;
  }

  return (
    <div className="bulletin-page">
      <header className="bulletin-header">
        <div>
          <h1>{t('bulletin.title')}</h1>
          <p className="bulletin-intro">{t('bulletin.intro')}</p>
        </div>
        {canManage && (
          <button type="button" className="btn-primary" disabled={saving} onClick={handleCreate}>
            {t('bulletin.create')}
          </button>
        )}
        {permissions.canStartWorship && draft && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const prev = readWorshipLiveConfig();
              writeWorshipLiveConfig({
                mode: 'ppt',
                playlistId: prev?.playlistId ?? '',
                bulletinId: draft.id,
              });
              window.location.hash = '#/worship';
            }}
          >
            {t('worship.start')}
          </button>
        )}
      </header>

      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}

      <div className="bulletin-layout">
        <aside className="bulletin-list">
          <h2>{t('bulletin.weeks')}</h2>
          {bulletins.length === 0 ? (
            <p className="bulletin-empty">{t('bulletin.empty')}</p>
          ) : (
            <ul>
              {bulletins.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    className={`bulletin-list-item${selectedId === b.id ? ' active' : ''}`}
                    onClick={() => setSelectedId(b.id)}
                  >
                    <span>{b.serviceDate}</span>
                    <span className="bulletin-list-meta">{b.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="bulletin-editor">
          {!draft ? (
            <p className="bulletin-empty">{t('bulletin.selectWeek')}</p>
          ) : (
            <>
              <h2>{selectedLabel}</h2>

              <div className="bulletin-grid">
                <label>
                  {t('bulletin.serviceDate')}
                  <input
                    type="date"
                    value={draft.serviceDate}
                    disabled={!canManage}
                    onChange={(e) => patchField('serviceDate', e.target.value)}
                  />
                </label>
                <label>
                  {t('bulletin.serviceTime')}
                  <input
                    type="text"
                    value={draft.serviceTime}
                    disabled={!canManage}
                    onChange={(e) => patchField('serviceTime', e.target.value)}
                  />
                </label>
                <label>
                  {t('bulletin.lastWeekOffering')}
                  <input
                    type="text"
                    value={draft.lastWeekOfferingDate}
                    disabled={!canManage}
                    onChange={(e) => patchField('lastWeekOfferingDate', e.target.value)}
                  />
                </label>
                <label>
                  {t('bulletin.offeringQuarter')}
                  <input
                    type="text"
                    value={draft.offeringQuarterLabel}
                    disabled={!canManage}
                    onChange={(e) => patchField('offeringQuarterLabel', e.target.value)}
                  />
                </label>
                <label>
                  {t('bulletin.birthdayMonth')}
                  <input
                    type="text"
                    value={draft.birthdayMonth}
                    disabled={!canManage}
                    onChange={(e) => patchField('birthdayMonth', e.target.value)}
                  />
                </label>
                <label>
                  {t('bulletin.birthdayNames')}
                  <input
                    type="text"
                    value={draft.birthdayNames}
                    disabled={!canManage}
                    onChange={(e) => patchField('birthdayNames', e.target.value)}
                  />
                </label>
                <label>
                  {t('bulletin.staffMeeting')}
                  <input
                    type="text"
                    value={draft.staffMeetingDate}
                    disabled={!canManage}
                    onChange={(e) => patchField('staffMeetingDate', e.target.value)}
                  />
                </label>
                <label>
                  {t('bulletin.testimonyShare')}
                  <input
                    type="text"
                    value={draft.testimonyShareDate}
                    disabled={!canManage}
                    onChange={(e) => patchField('testimonyShareDate', e.target.value)}
                  />
                </label>
                <label className="bulletin-span-2">
                  {t('bulletin.serviceRoster')}
                  <textarea
                    rows={3}
                    value={draft.serviceRosterText}
                    disabled={!canManage}
                    onChange={(e) => patchField('serviceRosterText', e.target.value)}
                  />
                </label>
                <label className="bulletin-span-2">
                  {t('bulletin.baptism')}
                  <textarea
                    rows={2}
                    value={draft.baptismText}
                    disabled={!canManage}
                    onChange={(e) => patchField('baptismText', e.target.value)}
                  />
                </label>
                <label className="bulletin-span-2 bulletin-verse-field">
                  {t('bulletin.verseOfWeek')}
                  <textarea
                    rows={4}
                    value={draft.verseOfWeek}
                    disabled={!canManage}
                    onFocus={() => {
                      verseFocusedRef.current = true;
                    }}
                    onBlur={() => {
                      verseFocusedRef.current = false;
                    }}
                    onChange={(e) => patchField('verseOfWeek', e.target.value)}
                  />
                  {canManage && (
                    <span className="bulletin-verse-hint">{t('bulletin.verseOfWeekHint')}</span>
                  )}
                </label>
              </div>

              <fieldset className="bulletin-fieldset">
                <legend>{t('bulletin.slideOptions')}</legend>
                <label className="bulletin-check">
                  <input
                    type="checkbox"
                    checked={draft.skipTestimonyWeek}
                    disabled={!canManage}
                    onChange={(e) => patchField('skipTestimonyWeek', e.target.checked)}
                  />
                  {t('bulletin.skipTestimony')}
                </label>
                <label className="bulletin-check">
                  <input
                    type="checkbox"
                    checked={draft.skipDepartmentReports}
                    disabled={!canManage}
                    onChange={(e) => patchField('skipDepartmentReports', e.target.checked)}
                  />
                  {t('bulletin.skipDepartment')}
                </label>
                <label>
                  {t('bulletin.meetingVariant')}
                  <select
                    value={draft.weeklyMeetingVariant ?? ''}
                    disabled={!canManage}
                    onChange={(e) => {
                      const v = e.target.value;
                      patchField('weeklyMeetingVariant', v ? Number(v) : null);
                    }}
                  >
                    <option value="">{t('bulletin.meetingVariantDefault')}</option>
                    <option value="28">{t('bulletin.meetingVariant28')}</option>
                    <option value="29">{t('bulletin.meetingVariant29')}</option>
                    <option value="30">{t('bulletin.meetingVariant30')}</option>
                  </select>
                </label>
              </fieldset>

              <div className="bulletin-announcements">
                <h3>{t('bulletin.announcements')}</h3>
                {announcements.map((item, index) => (
                  <div key={item.key} className="bulletin-announcement-card">
                    <label>
                      {t('bulletin.announcementCategory')}
                      <select
                        value={item.category ?? 'general'}
                        disabled={!canManage}
                        onChange={(e) => {
                          const next = [...announcements];
                          next[index] = { ...item, category: e.target.value };
                          setAnnouncements(next);
                        }}
                      >
                        <option value="thanks">{t('bulletin.catThanks')}</option>
                        <option value="celebration">{t('bulletin.catCelebration')}</option>
                        <option value="baptism">{t('bulletin.catBaptism')}</option>
                        <option value="general">{t('bulletin.catGeneral')}</option>
                      </select>
                    </label>
                    <label>
                      {t('bulletin.announcementTitle')}
                      <input
                        type="text"
                        value={item.title ?? ''}
                        disabled={!canManage}
                        onChange={(e) => {
                          const next = [...announcements];
                          next[index] = { ...item, title: e.target.value };
                          setAnnouncements(next);
                        }}
                      />
                    </label>
                    <label className="bulletin-span-2">
                      {t('bulletin.announcementBody')}
                      <textarea
                        rows={3}
                        value={item.body}
                        disabled={!canManage}
                        onChange={(e) => {
                          const next = [...announcements];
                          next[index] = { ...item, body: e.target.value };
                          setAnnouncements(next);
                        }}
                      />
                    </label>
                    {canManage && announcements.length > 1 && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setAnnouncements(announcements.filter((_, i) => i !== index))}
                      >
                        {t('bulletin.removeAnnouncement')}
                      </button>
                    )}
                  </div>
                ))}
                {canManage && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setAnnouncements([...announcements, emptyAnnouncement()])}
                  >
                    {t('bulletin.addAnnouncement')}
                  </button>
                )}
              </div>

              <div className="bulletin-actions">
                {canManage && (
                  <button type="button" className="btn-primary" disabled={saving} onClick={handleSave}>
                    {saving ? t('bulletin.saving') : t('bulletin.save')}
                  </button>
                )}
                {canPublish && (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={publishing}
                    onClick={() => void handlePublish()}
                  >
                    {publishing ? t('bulletin.publishing') : t('bulletin.publishToLibrary')}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={generating}
                  onClick={() => void handleGenerate()}
                >
                  {generating ? t('bulletin.generating') : t('bulletin.downloadPptx')}
                </button>
                {draft.outputBlobId && permissions.canDownload && (
                  <a
                    className="btn-secondary"
                    href={`#/preview/${encodeURIComponent(draft.outputBlobId)}?title=${encodeURIComponent(draft.serviceDate)}`}
                  >
                    {t('bulletin.openInLibrary')}
                  </a>
                )}
              </div>

              {draft.outputBlobId && (
                <p className="bulletin-published-hint">{t('bulletin.publishedHint')}</p>
              )}

              {!canManage && (
                <p className="bulletin-readonly-hint">{t('bulletin.readonlyHint')}</p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
