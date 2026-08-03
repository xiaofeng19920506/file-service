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
import BulletinSlideShowLauncher from '../components/bulletin/BulletinSlideShowLauncher';
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
import { useBulletinLocalDraftSync } from '../hooks/useBulletinLocalDraftSync';
import { useBulletinRealtime } from '../hooks/useBulletinRealtime';
import { useBulletinScripturePersistence } from '../hooks/useBulletinScripturePersistence';
import { useI18n } from '../i18n';
import { computeOfferingTotalAmount } from '../lib/bulletin-offering';
import { resolveAvailableSundayIso, upcomingSundayIso } from '../lib/bulletin-date';
import {
  isBulletinSectionVisible,
  resolveHiddenSections,
  setBulletinSectionVisible,
  BULLETIN_SECTION_TEMPLATE_SLIDES,
} from '../lib/bulletin-section-visibility';
import {
  bulletinSectionLabel,
  clearBulletinSectionPptx,
  replaceBulletinSectionPptx,
} from '../lib/bulletin-section-pptx';
import { withTemplateFieldDefaults } from '../lib/bulletin-template-field-defaults';
import {
  BULLETIN_NAV_SECTIONS,
  isReadonlyNavSection,
  navSectionById,
  navSectionIndexById,
  resolveNavTargetSectionId,
} from '../lib/bulletin-sections';
import { BULLETIN_WIZARD_STEPS } from '../lib/bulletin-template-steps';
import { buildBulletinPptxFile, publishBulletinPptx } from '../lib/bulletin-publish';
import { friendlyError } from '../lib/error-messages';
import { isLocalBulletinDraftDirty } from '../lib/bulletin-local-draft';
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
  if (!bulletin.announcements.length) {
    return [
      { key: crypto.randomUUID(), category: 'thanks', title: '', body: '' },
      { key: crypto.randomUUID(), category: 'celebration', title: '', body: '' },
    ];
  }
  return bulletin.announcements.map((item) => ({
    key: item.id,
    category: item.category || 'general',
    title: item.title,
    body: item.body,
  }));
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
  const [previewTotalSlides, setPreviewTotalSlides] = useState<number | undefined>();
  const [worshipYoutubeOauthReady, setWorshipYoutubeOauthReady] = useState(false);
  const [worshipOauthError, setWorshipOauthError] = useState<string | null>(null);
  const [editSlidesSectionId, setEditSlidesSectionId] = useState<string | null>(() =>
    editSlidesSectionFromHash(),
  );
  /** 本次打开编辑器是否 push 过历史条目；关闭时优先 history.back，避免残留 query */
  const editSlidesHistoryPushedRef = useRef(false);
  const savingRef = useRef(false);
  const scripturePersistingRef = useRef(false);
  const [busySectionId, setBusySectionId] = useState<string | null>(null);
  savingRef.current = saving || publishing || scripturePersistingRef.current;

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
        readonly: section.editableStepId == null || Boolean(section.groupOnly),
        visible: section.groupOnly
          ? undefined
          : draft
            ? isBulletinSectionVisible(section.id, draft)
            : true,
        depth: section.depth,
        groupOnly: section.groupOnly,
        hasChildren: section.hasChildren,
        hasTemplateSlides: (BULLETIN_SECTION_TEMPLATE_SLIDES[section.id]?.length ?? 0) > 0,
        hasPptxOverride: Boolean(draft?.sectionPptxOverrides?.[section.id]),
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
    const targetId = resolveNavTargetSectionId(sectionId);
    const section = navSectionById(targetId);
    if (!section) return;

    setActiveSectionId(targetId);
    setPreviewSectionId(targetId);
    // 每次点左侧都 bump，确保右侧预览滚到对应分区（含重复点击）
    setPreviewScrollBump((b) => b + 1);

    if (section.editableStepId) {
      const stepIdx = BULLETIN_WIZARD_STEPS.findIndex((s) => s.id === section.editableStepId);
      if (stepIdx >= 0) setWizardStep(stepIdx);
    }
  }, []);

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
      if (!selectedId) return;
      if (event.type === 'playlist_updated') {
        // 邀请链接 / 其它端加歌：只刷新歌单与预览，不覆盖本地公告草稿
        setWorshipPreviewRevision((v) => v + 1);
        return;
      }
      if (savingRef.current || scripturePersistingRef.current) return;
      if (isLocalBulletinDraftDirty(selectedId)) {
        // 本地未同步：只对齐 updatedAt，避免整表覆盖盖掉编辑
        setDraft((prev) =>
          prev && prev.id === selectedId ? { ...prev, updatedAt: event.updatedAt } : prev,
        );
        return;
      }
      if (event.updatedAt === draft?.updatedAt) return;
      void (async () => {
        const remote = await getBulletin(selectedId);
        const normalized = withHiddenSections(remote);
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
    setDraft((prev) => {
      if (!prev) return prev;
      let next: WeeklyBulletin = { ...prev, [key]: value };
      // 表单驱动分区：改字段时清掉该区自定义 PPT / 幻灯片文字覆盖，避免旧快照挡住预览
      const sectionForField: Partial<Record<keyof WeeklyBulletin, string>> = {
        birthdayMonth: 'birthday',
        birthdayNames: 'birthday',
        verseOfWeek: 'verse_of_week',
        serviceDate: 'cover',
        serviceTime: 'cover',
        showPreServiceChairName: 'pre_service',
        preServiceChairNames: 'pre_service',
        lastWeekOfferingDate: 'offering',
        offeringTitheAmount: 'offering',
        offeringOtherAmount: 'offering',
        staffMeetingYear: 'staff_meeting',
        staffMeetingMonth: 'staff_meeting',
        staffMeetingDate: 'staff_meeting',
        staffMeetingStartTime: 'staff_meeting',
        staffMeetingEndTime: 'staff_meeting',
        rotationStartMonth: 'rotation',
        rotationEndMonth: 'rotation',
        testimonyShareDate: 'future_testimony',
        serviceRosterText: 'service_roster',
        serviceRosterTodayDate: 'service_roster',
        serviceRosterNextDate: 'service_roster',
        serviceRosterChair: 'service_roster',
        serviceRosterWorship: 'service_roster',
        serviceRosterUsher: 'service_roster',
        serviceRosterCleanNames: 'service_roster',
      };
      const slidesForField: Partial<Record<keyof WeeklyBulletin, number[]>> = {
        serviceDate: [1],
        serviceTime: [1],
        showPreServiceChairName: [2],
        preServiceChairNames: [2],
        birthdayMonth: [24],
        birthdayNames: [24],
        verseOfWeek: [35],
        lastWeekOfferingDate: [19, 20],
        offeringTitheAmount: [19, 20],
        offeringOtherAmount: [19, 20],
        staffMeetingYear: [31],
        staffMeetingMonth: [31],
        staffMeetingDate: [31],
        staffMeetingStartTime: [31],
        staffMeetingEndTime: [31],
        rotationStartMonth: [32],
        rotationEndMonth: [32],
        testimonyShareDate: [33],
        serviceRosterText: [34],
        serviceRosterTodayDate: [34],
        serviceRosterNextDate: [34],
        serviceRosterChair: [34],
        serviceRosterWorship: [34],
        serviceRosterUsher: [34],
        serviceRosterCleanNames: [34],
      };
      const sectionId = sectionForField[key];
      if (sectionId && next.sectionPptxOverrides?.[sectionId]) {
        const overrides = { ...next.sectionPptxOverrides };
        delete overrides[sectionId];
        next = { ...next, sectionPptxOverrides: overrides };
      }
      const slides = slidesForField[key];
      if (slides?.length && next.slideTextOverrides?.length) {
        const drop = new Set(slides);
        const filtered = next.slideTextOverrides.filter((o) => !drop.has(o.slide));
        if (filtered.length !== next.slideTextOverrides.length) {
          next = { ...next, slideTextOverrides: filtered };
        }
      }
      // 十一 / 其他 / 总数联动：改任一金额时重算总数并写入草稿（预览与保存一致）
      if (key === 'offeringTitheAmount' || key === 'offeringOtherAmount') {
        next = {
          ...next,
          offeringTotalAmount: computeOfferingTotalAmount(
            next.offeringTitheAmount,
            next.offeringOtherAmount,
          ),
        };
      }
      return next;
    });
  };

  useBulletinScripturePersistence(draft, patchField, {
    canFetchRemote: canManage,
  });

  useBulletinLocalDraftSync(draft, setDraft, {
    canPersistRemote: canManage,
    onSectionBusyChange: setBusySectionId,
    onPersistingChange: (busy) => {
      scripturePersistingRef.current = busy;
      savingRef.current = busy || saving || publishing;
    },
    externalSavingRef: savingRef,
  });

  const handleServiceDateChange = (isoDate: string) => {
    const existing = bulletins.find((b) => b.serviceDate === isoDate);
    if (existing && existing.id !== selectedId) {
      setSelectedId(existing.id);
      return;
    }
    patchField('serviceDate', isoDate);
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
        offeringTitheAmount: draft.offeringTitheAmount,
        offeringOtherAmount: draft.offeringOtherAmount,
        birthdayMonth: draft.birthdayMonth,
        birthdayNames: draft.birthdayNames,
        staffMeetingDate: draft.staffMeetingDate,
        staffMeetingYear: draft.staffMeetingYear,
        staffMeetingMonth: draft.staffMeetingMonth,
        staffMeetingStartTime: draft.staffMeetingStartTime,
        staffMeetingEndTime: draft.staffMeetingEndTime,
        rotationStartMonth: draft.rotationStartMonth,
        rotationEndMonth: draft.rotationEndMonth,
        testimonyShareDate: draft.testimonyShareDate,
        serviceRosterText: draft.serviceRosterText,
        serviceRosterTodayDate: draft.serviceRosterTodayDate,
        serviceRosterNextDate: draft.serviceRosterNextDate,
        serviceRosterChair: draft.serviceRosterChair,
        serviceRosterWorship: draft.serviceRosterWorship,
        serviceRosterUsher: draft.serviceRosterUsher,
        serviceRosterCleanNames: draft.serviceRosterCleanNames,
        baptismText: draft.baptismText,
        scriptureBook: draft.scriptureBook,
        scriptureReference: draft.scriptureReference,
        verseOfWeek: draft.verseOfWeek,
        weeklyMeetingVariant: draft.weeklyMeetingVariant,
        showPreServiceChairName: draft.showPreServiceChairName,
        preServiceChairNames: draft.preServiceChairNames,
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

  const handleSectionVisibilityChange = useCallback(
    (sectionId: string, visible: boolean) => {
      if (!draft) return;
      const hiddenSections = setBulletinSectionVisible(draft.hiddenSections, sectionId, visible);
      const patch = {
        hiddenSections,
        skipTestimonyWeek: hiddenSections.includes('testimony_week'),
        skipDepartmentReports: hiddenSections.includes('department_reports'),
      };
      setDraft((prev) => (prev ? { ...prev, ...patch } : prev));

      if (visible) {
        selectNavSection(sectionId);
        window.setTimeout(() => setPreviewScrollBump((b) => b + 1), 280);
      }

      if (!canManage) return;
      void updateBulletin(draft.id, patch)
        .then((updated) => {
          setDraft(withHiddenSections(updated));
          setMessage(t('bulletin.saved'));
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
        });
    },
    [canManage, draft, selectNavSection, t],
  );

  const handleReplaceSectionPptx = useCallback(
    async (sectionId: string, file: File) => {
      if (!draft || !canManage) return;
      try {
        setError(null);
        const label = bulletinSectionLabel(sectionId, t);
        const updated = await replaceBulletinSectionPptx(draft, sectionId, file, label);
        handleSectionPptxSaved(updated);
        selectNavSection(sectionId);
      } catch (err) {
        const code = err instanceof Error ? err.message : 'upload_failed';
        setError(friendlyError(code === 'invalid_pptx' ? 'invalid_pptx' : code, t));
      }
    },
    [canManage, draft, selectNavSection, t],
  );

  const handleResetSectionPptx = useCallback(
    async (sectionId: string) => {
      if (!draft || !canManage) return;
      try {
        setError(null);
        const updated = await clearBulletinSectionPptx(draft, sectionId);
        handleSectionPptxSaved(updated);
        selectNavSection(sectionId);
      } catch (err) {
        setError(friendlyError(err instanceof Error ? err.message : 'update_failed', t));
      }
    },
    [canManage, draft, selectNavSection, t],
  );

  const renderStepPanel = () => {
    if (!draft) return null;

    if (activeSectionReadonly) {
      // 模板固定页：中间无需表单；分区操作在左侧右键菜单
      return null;
    }

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
            onServiceDateChange={handleServiceDateChange}
            onServiceTimeChange={(time) => patchField('serviceTime', time)}
            onCoverPreviewFocus={() =>
              setPreviewScrollToSlide((prev) => ({
                slide: 1,
                bump: (prev?.bump ?? 0) + 1,
              }))
            }
          />
        );
      case 'pre_service':
        return <BulletinPreServiceStep {...common} />;
      case 'scripture':
        return <BulletinScriptureStep {...common} />;
      case 'worship':
        return (
          <BulletinWorshipStep
            draft={draft}
            canManage={canManage}
            canEditSongs={permissions.canEditBulletinWorshipSongs}
            oauthJustConnected={worshipYoutubeOauthReady}
            oauthError={worshipOauthError}
            onClearOauthError={() => setWorshipOauthError(null)}
            playlistRefreshKey={worshipPreviewRevision}
            onPlaylistReady={(playlistId) => {
              setDraft((prev) => (prev ? { ...prev, servicePlaylistId: playlistId } : prev));
              setWorshipPreviewRevision((v) => v + 1);
            }}
            onPlaylistChanged={() => setWorshipPreviewRevision((v) => v + 1)}
            onLyricsPptxChange={(blobId) => {
              setDraft((prev) => (prev ? { ...prev, worshipLyricsPptxBlobId: blobId } : prev));
              setWorshipPreviewRevision((v) => v + 1);
            }}
          />
        );
      case 'offering':
        return <BulletinOfferingStep {...common} />;
      case 'birthday':
        return <BulletinBirthdayStep {...common} />;
      case 'announcements':
        return (
          <BulletinAnnouncementsStep
            {...common}
            announcements={announcements}
            onAnnouncementsChange={(next) => {
              setAnnouncements(next);
              setDraft((prev) => {
                if (!prev) return prev;
                let updated: WeeklyBulletin = {
                  ...prev,
                  announcements: next.map((a, i) => ({
                    id: a.key,
                    sortOrder: i,
                    category: a.category ?? 'general',
                    title: a.title ?? '',
                    body: a.body,
                  })),
                };
                // 改公告列表时清掉该区自定义 PPT / 第 25–26 页旧文字覆盖，避免挡住新页预览
                if (updated.sectionPptxOverrides?.announcements) {
                  const overrides = { ...updated.sectionPptxOverrides };
                  delete overrides.announcements;
                  updated = { ...updated, sectionPptxOverrides: overrides };
                }
                if (updated.slideTextOverrides?.length) {
                  const filtered = updated.slideTextOverrides.filter(
                    (o) => o.slide !== 25 && o.slide !== 26,
                  );
                  if (filtered.length !== updated.slideTextOverrides.length) {
                    updated = { ...updated, slideTextOverrides: filtered };
                  }
                }
                return updated;
              });
            }}
            onSave={() => void handleSaveFields({}, true)}
          />
        );
      case 'verse':
        return <BulletinVerseStep {...common} />;
      case 'more':
        return <BulletinMoreStep {...common} sectionId={activeSectionId} />;
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
          <nav className="bulletin-workspace-nav" aria-label={t('bulletin.editorPanel')}>
            <ProgressStepper
              steps={stepperSteps}
              currentIndex={navCurrentIndex}
              previewIndex={navPreviewIndex}
              orientation="vertical"
              canManage={canManage}
              onEditSlides={(sectionId) => {
                selectNavSection(sectionId);
                openEditSlides(sectionId);
              }}
              onReplacePptx={handleReplaceSectionPptx}
              onResetPptx={handleResetSectionPptx}
              onStepVisibilityChange={handleSectionVisibilityChange}
              onStepSelect={(index) => {
                const section = BULLETIN_NAV_SECTIONS[index];
                if (!section) return;
                selectNavSection(section.id);
              }}
            />
          </nav>

          <section className="bulletin-workspace-form" aria-label={t('bulletin.editorPanel')}>
            <div className="bulletin-step-panel">
              {busySectionId === activeSectionId ? (
                <div className="bulletin-section-syncing" role="status">
                  <span className="preview-spinner bulletin-section-syncing-spinner" />
                  <span>{t('bulletin.sectionSyncing')}</span>
                </div>
              ) : null}
              {renderStepPanel()}
            </div>

            {editSlidesSectionId ? (
              <BulletinSectionPptEditor
                sectionId={editSlidesSectionId}
                draft={draft}
                onClose={closeEditSlides}
                onSaved={handleSectionPptxSaved}
              />
            ) : null}

            <div className="bulletin-workspace-form-footer">
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
                <BulletinSlideShowLauncher
                  bulletin={draft}
                  totalSlides={previewTotalSlides}
                  className="btn-secondary bulletin-slideshow-start"
                  disabled={!permissions.canViewBulletin}
                />
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
            </div>
          </section>

          <aside className="bulletin-workspace-preview" aria-label={t('bulletin.previewTitle')}>
            <BulletinPreviewPanel
              scrollToSectionId={activeSectionId}
              scrollToSectionBump={previewScrollBump}
              scrollToPresentationSlide={previewScrollToSlide}
              highlightSectionId={previewSectionId}
              busySectionId={busySectionId}
              bulletin={draft}
              worshipRefreshKey={worshipPreviewRevision}
              onVisibleSectionChange={handleVisibleSectionChange}
              onDeckMetaChange={(meta) => {
                setPreviewTotalSlides(meta?.totalSlides);
              }}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
