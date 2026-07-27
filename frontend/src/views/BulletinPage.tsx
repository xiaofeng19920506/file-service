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
  BulletinPreServiceStep,
  BulletinScriptureStep,
  BulletinVerseStep,
} from '../components/bulletin/BulletinWizardSteps';
import ProgressStepper from '../components/ProgressStepper';
import BulletinSectionPptEditor from '../components/bulletin/BulletinSectionPptEditor';
import BulletinSectionReplaceBanner from '../components/bulletin/BulletinSectionReplaceBanner';
import { useBulletinRealtime } from '../hooks/useBulletinRealtime';
import { useBulletinScripturePersistence } from '../hooks/useBulletinScripturePersistence';
import { useI18n } from '../i18n';
import { resolveAvailableSundayIso, upcomingSundayIso } from '../lib/bulletin-date';
import {
  isBulletinSectionVisible,
  resolveHiddenSections,
  setBulletinSectionVisible,
  BULLETIN_SECTION_TEMPLATE_SLIDES,
} from '../lib/bulletin-section-visibility';
import { withTemplateFieldDefaults } from '../lib/bulletin-template-field-defaults';
import {
  BULLETIN_NAV_SECTIONS,
  isReadonlyNavSection,
  navSectionById,
  navSectionIndexById,
} from '../lib/bulletin-sections';
import { BULLETIN_WIZARD_STEPS } from '../lib/bulletin-template-steps';
import { buildBulletinPptxFile, publishBulletinPptx } from '../lib/bulletin-publish';
import { friendlyError } from '../lib/error-messages';
type AnnouncementDraft = AnnouncementInput & { key: string };

const EDIT_SLIDES_PARAM = 'editSlides';

function bulletinHashParams(): URLSearchParams {
  const hash = window.location.hash;
  const q = hash.indexOf('?');
  return q === -1 ? new URLSearchParams() : new URLSearchParams(hash.slice(q + 1));
}

function bulletinHashWithParams(params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `#/bulletin?${qs}` : '#/bulletin';
}

function editSlidesSectionFromHash(): string | null {
  if (!window.location.hash.startsWith('#/bulletin')) return null;
  const sectionId = bulletinHashParams().get(EDIT_SLIDES_PARAM)?.trim() || null;
  if (!sectionId || !(BULLETIN_SECTION_TEMPLATE_SLIDES[sectionId]?.length ?? 0)) return null;
  return sectionId;
}

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

function withHiddenSections(bulletin: WeeklyBulletin): WeeklyBulletin {
  return withTemplateFieldDefaults({
    ...bulletin,
    hiddenSections: resolveHiddenSections(bulletin),
    slideTextOverrides: Array.isArray(bulletin.slideTextOverrides)
      ? bulletin.slideTextOverrides
      : [],
    sectionPptxOverrides:
      bulletin.sectionPptxOverrides && typeof bulletin.sectionPptxOverrides === 'object'
        ? bulletin.sectionPptxOverrides
        : {},
  });
}

function visibilitySaveFields(draft: WeeklyBulletin) {
  const hiddenSections = resolveHiddenSections(draft);
  return {
    hiddenSections,
    skipTestimonyWeek: hiddenSections.includes('testimony_week'),
    skipDepartmentReports: hiddenSections.includes('department_reports'),
  };
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
  const [activeSectionId, setActiveSectionId] = useState('cover');
  const [previewSectionId, setPreviewSectionId] = useState('cover');
  const [previewScrollBump, setPreviewScrollBump] = useState(0);
  const [previewScrollToSlide, setPreviewScrollToSlide] = useState<{
    slide: number;
    bump: number;
  } | null>(null);
  const [worshipPreviewRevision, setWorshipPreviewRevision] = useState(0);
  const [worshipYoutubeOauthReady, setWorshipYoutubeOauthReady] = useState(false);
  const [worshipOauthError, setWorshipOauthError] = useState<string | null>(null);
  const [editSlidesSectionId, setEditSlidesSectionId] = useState<string | null>(() =>
    editSlidesSectionFromHash(),
  );
  /** 本次打开编辑器是否 push 过历史条目；关闭时优先 history.back，避免残留 query */
  const editSlidesHistoryPushedRef = useRef(false);
  const savingRef = useRef(false);
  const scripturePersistingRef = useRef(false);
  savingRef.current = saving || publishing;

  const openEditSlides = useCallback((sectionId: string) => {
    if (!(BULLETIN_SECTION_TEMPLATE_SLIDES[sectionId]?.length ?? 0)) return;
    const params = bulletinHashParams();
    const current = params.get(EDIT_SLIDES_PARAM);
    params.set(EDIT_SLIDES_PARAM, sectionId);
    const nextHash = bulletinHashWithParams(params);
    if (current === sectionId && window.location.hash === nextHash) {
      setEditSlidesSectionId(sectionId);
      return;
    }
    if (current) {
      window.history.replaceState(null, '', nextHash);
    } else {
      window.history.pushState({ bulletinEditSlides: sectionId }, '', nextHash);
      editSlidesHistoryPushedRef.current = true;
    }
    setEditSlidesSectionId(sectionId);
  }, []);

  const closeEditSlides = useCallback(() => {
    const params = bulletinHashParams();
    if (!params.get(EDIT_SLIDES_PARAM)) {
      setEditSlidesSectionId(null);
      editSlidesHistoryPushedRef.current = false;
      return;
    }
    if (editSlidesHistoryPushedRef.current) {
      editSlidesHistoryPushedRef.current = false;
      window.history.back();
      return;
    }
    params.delete(EDIT_SLIDES_PARAM);
    window.history.replaceState(null, '', bulletinHashWithParams(params));
    setEditSlidesSectionId(null);
  }, []);

  useEffect(() => {
    const syncFromHistory = () => {
      const sectionId = editSlidesSectionFromHash();
      if (!sectionId) {
        editSlidesHistoryPushedRef.current = false;
      }
      setEditSlidesSectionId(sectionId);
    };
    window.addEventListener('popstate', syncFromHistory);
    window.addEventListener('hashchange', syncFromHistory);
    return () => {
      window.removeEventListener('popstate', syncFromHistory);
      window.removeEventListener('hashchange', syncFromHistory);
    };
  }, []);

  const stepperSteps = useMemo(
    () =>
      BULLETIN_NAV_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.labelKey),
        enabled: true,
        readonly: section.editableStepId == null,
        visible: draft ? isBulletinSectionVisible(section.id, draft) : true,
      })),
    [t, draft],
  );

  const navCurrentIndex = navSectionIndexById(activeSectionId);
  const navPreviewIndex = navSectionIndexById(previewSectionId);
  const currentStepDef = BULLETIN_WIZARD_STEPS[wizardStep];
  const activeSectionReadonly = isReadonlyNavSection(activeSectionId);

  const handleVisibleSectionChange = useCallback((sectionId: string) => {
    setPreviewSectionId((prev) => (prev === sectionId ? prev : sectionId));
    setActiveSectionId((prev) => {
      if (prev === sectionId) return prev;
      return sectionId;
    });
    const section = navSectionById(sectionId);
    if (!section?.editableStepId) return;
    const stepIdx = BULLETIN_WIZARD_STEPS.findIndex((s) => s.id === section.editableStepId);
    if (stepIdx >= 0) setWizardStep(stepIdx);
  }, []);

  const selectNavSection = useCallback((sectionId: string) => {
    const section = navSectionById(sectionId);
    if (!section) return;

    if (sectionId === activeSectionId) {
      setPreviewScrollBump((b) => b + 1);
      return;
    }

    setActiveSectionId(sectionId);
    setPreviewSectionId(sectionId);

    if (section.editableStepId) {
      const stepIdx = BULLETIN_WIZARD_STEPS.findIndex((s) => s.id === section.editableStepId);
      if (stepIdx >= 0) setWizardStep(stepIdx);
    }
  }, [activeSectionId]);

  useEffect(() => {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return;

    const params = new URLSearchParams(hash.slice(qIndex + 1));
    const oauth = params.get('youtube_oauth');
    if (oauth !== 'connected' && oauth !== 'error') return;
    if (params.get('worship_youtube') !== '1') return;

    const reason = params.get('reason')?.trim();
    params.delete('youtube_oauth');
    params.delete('worship_youtube');
    params.delete('reason');
    const rest = params.toString();
    window.history.replaceState(null, '', rest ? `#/bulletin?${rest}` : '#/bulletin');

    const worshipIdx = BULLETIN_WIZARD_STEPS.findIndex((step) => step.id === 'worship');
    if (worshipIdx >= 0) setWizardStep(worshipIdx);
    setActiveSectionId('worship');
    setPreviewSectionId('worship');
    setPreviewScrollBump((b) => b + 1);

    if (oauth === 'connected') {
      setWorshipYoutubeOauthReady(true);
      setWorshipOauthError(null);
    } else {
      const code =
        reason === 'not_configured' ? 'youtube_oauth_not_configured' : (reason ?? 'youtube_oauth_failed');
      setWorshipOauthError(friendlyError(code, t));
    }
  }, [t]);

  useBulletinRealtime(
    selectedId,
    (event) => {
      if (!selectedId || savingRef.current || scripturePersistingRef.current) return;
      if (event.updatedAt === draft?.updatedAt) return;
      void (async () => {
        const remote = await getBulletin(selectedId);
        const normalized = withHiddenSections(remote);
        // 内容没变（updatedAt 相同）时保留原引用，避免 setDraft 触发
        // 「重渲染 → 自动保存 → SSE → 再刷新」的循环。
        setDraft((prev) => {
          if (prev && prev.id === normalized.id && prev.updatedAt === normalized.updatedAt) {
            return prev;
          }
          return normalized;
        });
        if (!(draft && draft.id === normalized.id && draft.updatedAt === normalized.updatedAt)) {
          setAnnouncements(toDrafts(normalized));
        }
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
        setError(null);
        let rows = await refreshList();
        if (cancelled) return;

        const targetDate = upcomingSundayIso();
        let target = rows.find((b) => b.serviceDate === targetDate) ?? null;

        if (!target && canManage) {
          try {
            target = await createBulletin(targetDate);
            rows = await refreshList();
            target = rows.find((b) => b.serviceDate === targetDate) ?? target;
          } catch (err) {
            const code = err instanceof Error ? err.message : String(err);
            if (code === 'bulletin_exists') {
              rows = await refreshList();
              target = rows.find((b) => b.serviceDate === targetDate) ?? null;
            } else {
              throw err;
            }
          }
        }

        if (!cancelled) {
          setSelectedId(target?.id ?? rows[0]?.id ?? null);
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
  }, [refreshList, canManage]);

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
        const normalized = withHiddenSections(bulletin);
        setDraft(normalized);
        setAnnouncements(toDrafts(normalized));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const patchField = <K extends keyof WeeklyBulletin>(key: K, value: WeeklyBulletin[K]) => {
    // 左右实时一致：草稿一改，右侧预览同步用同一份数据
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSectionVisibilityChange = (sectionId: string, visible: boolean) => {
    if (!draft) return;
    const hiddenSections = setBulletinSectionVisible(draft.hiddenSections, sectionId, visible);
    const patch = {
      hiddenSections,
      skipTestimonyWeek: hiddenSections.includes('testimony_week'),
      skipDepartmentReports: hiddenSections.includes('department_reports'),
    };
    // 勾选「显示」后立即反映到预览
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));

    if (visible) {
      setActiveSectionId(sectionId);
      setPreviewSectionId(sectionId);
      // deck 重建后再滚到该分区
      window.setTimeout(() => setPreviewScrollBump((b) => b + 1), 280);
    }

    if (!canManage) return;
    void updateBulletin(draft.id, patch)
      .then((updated) => {
        const normalized = withHiddenSections(updated);
        setDraft(normalized);
        if (visible) {
          setActiveSectionId(sectionId);
          setPreviewSectionId(sectionId);
          window.setTimeout(() => setPreviewScrollBump((b) => b + 1), 280);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  useBulletinScripturePersistence(draft, patchField, {
    canPersistRemote: canManage,
    onPersistingChange: (busy) => {
      scripturePersistingRef.current = busy;
    },
  });

  // 生日月份/名单：预览即时更新，并防抖自动保存
  useEffect(() => {
    if (!canManage || !draft) return;
    const timer = window.setTimeout(() => {
      const id = draft.id;
      // 标记保存中并在成功后只回写 updatedAt：
      // 否则这次自动保存触发的 SSE 会用远端整对象覆盖草稿，丢掉其它未保存字段。
      savingRef.current = true;
      void updateBulletin(id, {
        birthdayMonth: draft.birthdayMonth,
        birthdayNames: draft.birthdayNames,
      })
        .then((updated) => {
          setDraft((prev) =>
            prev && prev.id === updated.id ? { ...prev, updatedAt: updated.updatedAt } : prev,
          );
        })
        .catch(() => {
          /* 预览已即时；保存失败不打断编辑 */
        })
        .finally(() => {
          savingRef.current = false;
        });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [canManage, draft?.id, draft?.birthdayMonth, draft?.birthdayNames]);

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
        ...visibilitySaveFields(draft),
      });
      const normalized = withHiddenSections(updated);
      setDraft(normalized);
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
      let updated = await updateBulletin(draft.id, {
        ...patch,
        ...visibilitySaveFields(draft),
      });
      if (withAnnouncements) {
        updated = await saveBulletinAnnouncements(
          updated.id,
          announcements
            .filter((a) => a.body.trim() || (a.title ?? '').trim())
            .map(({ category, title, body }) => ({ category, title, body })),
        );
      }
      const normalized = withHiddenSections(updated);
      setDraft(normalized);
      setAnnouncements(toDrafts(normalized));
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
      const serviceDate = resolveAvailableSundayIso(bulletins.map((b) => b.serviceDate));
      const bulletin = await createBulletin(serviceDate);
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
      const file = await buildBulletinPptxFile(draft);
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
        ...visibilitySaveFields(draft),
      });
      const withAnnouncements = await saveBulletinAnnouncements(
        saved.id,
        announcements
          .filter((a) => a.body.trim() || (a.title ?? '').trim())
          .map(({ category, title, body }) => ({ category, title, body })),
      );
      const { bulletin } = await publishBulletinPptx(withAnnouncements);
      const normalized = withHiddenSections(bulletin);
      setDraft(normalized);
      setAnnouncements(toDrafts(normalized));
      await refreshList();
      setMessage(t('bulletin.published'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  };

  const handleSectionPptxSaved = (bulletin: WeeklyBulletin) => {
    setDraft(withHiddenSections(bulletin));
    // 保存后留在编辑器里（与 PowerPoint 一致），方便继续改内容/样式；用户自行点关闭
    setMessage(t('bulletin.editSlidesSaved'));
  };

  const renderStepPanel = () => {
    if (!draft) return null;

    const visibilityProps = {
      sectionId: activeSectionId,
      onSectionVisibilityChange: handleSectionVisibilityChange,
    };

    if (activeSectionReadonly) {
      // 模板固定页：中间无需表单/说明；显示与改幻灯片用左侧入口即可
      return null;
    }

    const common = {
      draft,
      canEdit: canManage,
      saving,
      onPatch: patchField,
      ...visibilityProps,
    };

    switch (currentStepDef?.id) {
      case 'cover':
        return (
          <BulletinCoverStep
            serviceDate={draft.serviceDate}
            serviceTime={draft.serviceTime}
            draft={draft}
            canEdit={canManage}
            saving={saving}
            onServiceDateChange={handleServiceDateChange}
            onServiceTimeChange={(time) => patchField('serviceTime', time)}
            onSectionVisibilityChange={handleSectionVisibilityChange}
              onSave={handleSaveCover}
            onCoverPreviewFocus={() =>
              setPreviewScrollToSlide((prev) => ({
                slide: 1,
                bump: (prev?.bump ?? 0) + 1,
              }))
            }
          />
        );
      case 'pre_service':
        return (
          <BulletinPreServiceStep
            {...common}
            onSave={() =>
              void handleSaveFields({
                showPreServiceChairName: draft.showPreServiceChairName,
                preServiceChairNames: draft.preServiceChairNames,
              })
            }
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
            oauthError={worshipOauthError}
            onClearOauthError={() => setWorshipOauthError(null)}
            onPlaylistReady={(playlistId) => {
              setDraft((prev) => (prev ? { ...prev, servicePlaylistId: playlistId } : prev));
              setWorshipPreviewRevision((v) => v + 1);
            }}
            onPlaylistChanged={() => setWorshipPreviewRevision((v) => v + 1)}
            onLyricsPptxChange={(blobId) => {
              setDraft((prev) => (prev ? { ...prev, worshipLyricsPptxBlobId: blobId } : prev));
              setWorshipPreviewRevision((v) => v + 1);
            }}
            onSectionVisibilityChange={handleSectionVisibilityChange}
              onSaveVisibility={() => void handleSaveFields(visibilitySaveFields(draft))}
            saving={saving}
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
            onAnnouncementsChange={(next) => {
              setAnnouncements(next);
              setDraft((prev) =>
                prev
                  ? {
                      ...prev,
                      announcements: next.map((a, i) => ({
                        id: a.key,
                        sortOrder: i,
                        category: a.category ?? 'general',
                        title: a.title ?? '',
                        body: a.body,
                      })),
                    }
                  : prev,
              );
            }}
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
                    {b.outputBlobId
                      ? `${b.serviceDate} (${t('bulletin.publishedBadge')})`
                      : b.serviceDate}
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
                currentIndex={navCurrentIndex}
                previewIndex={navPreviewIndex}
                orientation="vertical"
                canEditVisibility={canManage}
                canEditSlides={canManage}
                onStepVisibilityChange={handleSectionVisibilityChange}
                onEditSlides={(sectionId) => {
                  selectNavSection(sectionId);
                  openEditSlides(sectionId);
                }}
                onStepSelect={(index) => {
                  const section = BULLETIN_NAV_SECTIONS[index];
                  if (!section) return;
                  selectNavSection(section.id);
                }}
              />
              <div className="bulletin-step-panel">
                {canManage &&
                !activeSectionReadonly &&
                (BULLETIN_SECTION_TEMPLATE_SLIDES[activeSectionId]?.length ?? 0) > 0 ? (
                  <BulletinSectionReplaceBanner
                    sectionId={activeSectionId}
                    draft={draft}
                    onSaved={handleSectionPptxSaved}
                  />
                ) : null}
                {renderStepPanel()}
              </div>
            </div>

            {editSlidesSectionId ? (
              <BulletinSectionPptEditor
                sectionId={editSlidesSectionId}
                draft={draft}
                onClose={closeEditSlides}
                onSaved={handleSectionPptxSaved}
              />
            ) : null}

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
            <BulletinPreviewPanel
              scrollToSectionId={activeSectionId}
              scrollToSectionBump={previewScrollBump}
              scrollToPresentationSlide={previewScrollToSlide}
              highlightSectionId={previewSectionId}
              bulletin={draft}
              worshipRefreshKey={worshipPreviewRevision}
              onVisibleSectionChange={handleVisibleSectionChange}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
