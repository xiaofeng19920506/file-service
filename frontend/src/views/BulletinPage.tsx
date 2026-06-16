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
import BulletinCoverStep from '../components/bulletin/BulletinCoverStep';
import BulletinWorshipStep from '../components/bulletin/BulletinWorshipStep';
import BulletinPreviewPanel from '../components/bulletin/BulletinPreviewPanel';
import {
  BulletinAnnouncementsStep,
  BulletinBirthdayStep,
  BulletinMoreStep,
  BulletinOfferingStep,
  BulletinScriptureStep,
  BulletinVerseStep,
} from '../components/bulletin/BulletinWizardSteps';
import ProgressStepper from '../components/ProgressStepper';
import { useBulletinRealtime } from '../hooks/useBulletinRealtime';
import { useBulletinScripturePersistence } from '../hooks/useBulletinScripturePersistence';
import { useI18n } from '../i18n';
import { nextSundayIso } from '../lib/bulletin-date';
import { BULLETIN_WIZARD_STEPS } from '../lib/bulletin-template-steps';
import { publishBulletinPptx, resolveBulletinPptxBlob } from '../lib/bulletin-publish';
import { readWorshipLiveConfig, writeWorshipLiveConfig } from '../lib/worship-live-config';

type AnnouncementDraft = AnnouncementInput & { key: string };

function emptyAnnouncement(): AnnouncementDraft {
  return { key: crypto.randomUUID(), category: 'general', title: '', body: '' };
}

function toDrafts(bulletin: WeeklyBulletin): AnnouncementDraft[] {
  const slots = [
    { category: 'thanks', title: '', body: '' },
    { category: 'celebration', title: '', body: '' },
    { category: 'baptism', title: '', body: '' },
  ] as const;
  if (!bulletin.announcements.length) {
    return slots.map((slot) => ({ key: crypto.randomUUID(), ...slot }));
  }
  return slots.map((slot, index) => {
    const item = bulletin.announcements[index];
    if (!item) return { key: crypto.randomUUID(), ...slot };
    return {
      key: item.id,
      category: item.category || slot.category,
      title: item.title,
      body: item.body,
    };
  });
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
  const [wizardStep, setWizardStep] = useState(0);
  const [worshipYoutubeOauthReady, setWorshipYoutubeOauthReady] = useState(false);
  const savingRef = useRef(false);
  const scripturePersistingRef = useRef(false);
  savingRef.current = saving || publishing;

  const stepperSteps = useMemo(
    () =>
      BULLETIN_WIZARD_STEPS.filter((step) => !step.skipInStepper).map((step) => ({
        id: step.id,
        label: t(step.labelKey),
        enabled: step.enabled,
      })),
    [t],
  );

  const currentStepDef = BULLETIN_WIZARD_STEPS[wizardStep];

  useEffect(() => {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return;

    const params = new URLSearchParams(hash.slice(qIndex + 1));
    if (params.get('youtube_oauth') !== 'connected' || params.get('worship_youtube') !== '1') {
      return;
    }

    params.delete('youtube_oauth');
    params.delete('worship_youtube');
    params.delete('reason');
    const rest = params.toString();
    window.history.replaceState(null, '', rest ? `#/bulletin?${rest}` : '#/bulletin');

    setWorshipYoutubeOauthReady(true);
    const worshipIdx = BULLETIN_WIZARD_STEPS.findIndex((step) => step.id === 'worship');
    if (worshipIdx >= 0) setWizardStep(worshipIdx);
  }, []);

  useBulletinRealtime(
    selectedId,
    (event) => {
      if (!selectedId || savingRef.current || scripturePersistingRef.current) return;
      if (event.updatedAt === draft?.updatedAt) return;
      void (async () => {
        const remote = await getBulletin(selectedId);
        setDraft((prev) => {
          if (!prev || prev.id !== remote.id) return remote;
          return remote;
        });
        setAnnouncements(toDrafts(remote));
      })();
    },
    Boolean(selectedId),
  );

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

  const patchField = <K extends keyof WeeklyBulletin>(key: K, value: WeeklyBulletin[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  useBulletinScripturePersistence(draft, patchField, {
    canPersistRemote: canManage,
    onPersistingChange: (busy) => {
      scripturePersistingRef.current = busy;
    },
  });

  const handleServiceDateChange = (isoDate: string) => {
    const existing = bulletins.find((b) => b.serviceDate === isoDate);
    if (existing && existing.id !== selectedId) {
      setSelectedId(existing.id);
      return;
    }
    patchField('serviceDate', isoDate);
  };

  const handleSaveCover = async () => {
    if (!canManage || !draft) return;
    try {
      setSaving(true);
      setError(null);
      const updated = await updateBulletin(draft.id, {
        serviceDate: draft.serviceDate,
        serviceTime: draft.serviceTime,
      });
      setDraft(updated);
      await refreshList();
      setMessage(t('bulletin.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFields = async (
    patch: Parameters<typeof updateBulletin>[1],
    withAnnouncements = false,
  ) => {
    if (!canManage || !draft) return;
    try {
      setSaving(true);
      setError(null);
      let updated = await updateBulletin(draft.id, patch);
      if (withAnnouncements) {
        updated = await saveBulletinAnnouncements(
          updated.id,
          announcements
            .filter((a) => a.body.trim() || (a.title ?? '').trim())
            .map(({ category, title, body }) => ({ category, title, body })),
        );
      }
      setDraft(updated);
      setAnnouncements(toDrafts(updated));
      await refreshList();
      setMessage(t('bulletin.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!canManage) return;
    try {
      setSaving(true);
      setError(null);
      const bulletin = await createBulletin(nextSundayIso());
      await refreshList();
      setSelectedId(bulletin.id);
      setWizardStep(0);
      setMessage(t('bulletin.created'));
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
        scriptureBook: draft.scriptureBook,
        scriptureReference: draft.scriptureReference,
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

  const renderStepPanel = () => {
    if (!draft) return null;

    const common = {
      draft,
      canEdit: canManage,
      saving,
      onPatch: patchField,
    };

    switch (currentStepDef?.id) {
      case 'cover':
        return (
          <BulletinCoverStep
            serviceDate={draft.serviceDate}
            serviceTime={draft.serviceTime}
            canEdit={canManage}
            saving={saving}
            onServiceDateChange={handleServiceDateChange}
            onServiceTimeChange={(time) => patchField('serviceTime', time)}
            onSave={handleSaveCover}
          />
        );
      case 'scripture':
        return (
          <BulletinScriptureStep
            {...common}
            onSave={() =>
              void handleSaveFields({
                scriptureBook: draft.scriptureBook,
                scriptureReference: draft.scriptureReference,
              })
            }
          />
        );
      case 'worship':
        return (
          <BulletinWorshipStep
            draft={draft}
            canManage={canManage}
            canEditSongs={permissions.canEditBulletinWorshipSongs}
            oauthJustConnected={worshipYoutubeOauthReady}
            onPlaylistReady={(playlistId) => {
              setDraft((prev) => (prev ? { ...prev, servicePlaylistId: playlistId } : prev));
            }}
          />
        );
      case 'offering':
        return (
          <BulletinOfferingStep
            {...common}
            onSave={() =>
              void handleSaveFields({
                lastWeekOfferingDate: draft.lastWeekOfferingDate,
                offeringQuarterLabel: draft.offeringQuarterLabel,
              })
            }
          />
        );
      case 'birthday':
        return (
          <BulletinBirthdayStep
            {...common}
            onSave={() =>
              void handleSaveFields({
                birthdayMonth: draft.birthdayMonth,
                birthdayNames: draft.birthdayNames,
              })
            }
          />
        );
      case 'announcements':
        return (
          <BulletinAnnouncementsStep
            {...common}
            announcements={announcements}
            onAnnouncementsChange={setAnnouncements}
            onSave={() => void handleSaveFields({}, true)}
          />
        );
      case 'verse':
        return (
          <BulletinVerseStep
            {...common}
            onSave={() => void handleSaveFields({ verseOfWeek: draft.verseOfWeek })}
          />
        );
      case 'more':
        return (
          <BulletinMoreStep
            {...common}
            onSave={() =>
              void handleSaveFields({
                staffMeetingDate: draft.staffMeetingDate,
                testimonyShareDate: draft.testimonyShareDate,
                serviceRosterText: draft.serviceRosterText,
                baptismText: draft.baptismText,
                weeklyMeetingVariant: draft.weeklyMeetingVariant,
                skipTestimonyWeek: draft.skipTestimonyWeek,
                skipDepartmentReports: draft.skipDepartmentReports,
              })
            }
          />
        );
      default:
        return <p className="bulletin-step-placeholder">{t('bulletin.steps.comingSoon')}</p>;
    }
  };

  if (loading) {
    return <p className="bulletin-loading">{t('bulletin.loading')}</p>;
  }

  return (
    <div className="bulletin-page bulletin-page--workspace">
      <header className="bulletin-header">
        <div>
          <h1>{t('bulletin.title')}</h1>
          <p className="bulletin-intro">{t('bulletin.intro')}</p>
        </div>
        <div className="bulletin-header-actions">
          {bulletins.length > 0 && (
            <label className="bulletin-week-select">
              {t('bulletin.weeks')}
              <select
                value={selectedId ?? ''}
                onChange={(e) => setSelectedId(e.target.value || null)}
              >
                {bulletins.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.serviceDate} ({b.status})
                  </option>
                ))}
              </select>
            </label>
          )}
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
        </div>
      </header>

      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}

      {!draft ? (
        <p className="bulletin-empty">{t('bulletin.selectWeek')}</p>
      ) : (
        <div className="bulletin-workspace">
          <section className="bulletin-workspace-editor" aria-label={t('bulletin.editorPanel')}>
            <div className="bulletin-workspace-editor-inner">
              <ProgressStepper
                steps={stepperSteps}
                currentIndex={wizardStep}
                orientation="vertical"
                onStepSelect={(index) => {
                  if (BULLETIN_WIZARD_STEPS[index]?.enabled) {
                    setWizardStep(index);
                  }
                }}
              />
              <div className="bulletin-step-panel">{renderStepPanel()}</div>
            </div>

            <div className="bulletin-actions">
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
          </section>

          <aside className="bulletin-workspace-preview" aria-label={t('bulletin.previewTitle')}>
            <BulletinPreviewPanel wizardStep={wizardStep} bulletin={draft} />
          </aside>
        </div>
      )}
    </div>
  );
}
