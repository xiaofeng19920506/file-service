import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createBulletin,
  fetchBulletinDriveSyncStatus,
  fetchServiceRotationSchedule,
  getBulletin,
  inviteBulletinSectionPastor,
  listBulletins,
  saveBulletinAnnouncements,
  triggerBulletinDriveSync,
  updateBulletin,
  type AnnouncementInput,
  type BulletinDriveSyncStatus,
  type WeeklyBulletin,
} from '../api/bulletins';
import { useAuth } from '../auth/AuthContext';
import BulletinCoverStep from '../components/bulletin/BulletinCoverStep';
import BulletinWorshipStep from '../components/bulletin/BulletinWorshipStep';
import BulletinPreviewPanel from '../components/bulletin/BulletinPreviewPanel';
import BulletinSlideShowLauncher from '../components/bulletin/BulletinSlideShowLauncher';
import {
  BulletinAnnouncementItemStep,
  BulletinBaptismStep,
  BulletinBirthdayStep,
  BulletinMoreStep,
  BulletinOfferingStep,
  BulletinPreServiceStep,
  BulletinScriptureStep,
} from '../components/bulletin/BulletinWizardSteps';
import ProgressStepper from '../components/ProgressStepper';
import BulletinSectionPptEditor from '../components/bulletin/BulletinSectionPptEditor';
import { useBulletinLocalDraftSync } from '../hooks/useBulletinLocalDraftSync';
import { useBulletinRealtime } from '../hooks/useBulletinRealtime';
import { useBulletinScripturePersistence } from '../hooks/useBulletinScripturePersistence';
import { createSlideShowBus } from '../lib/bulletin-slideshow-bus';
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
  resolveServiceRosterFromSchedule,
  setServiceRotationSchedules,
} from '../lib/bulletin-service-rotation';
import { BULLETIN_DRIVE_DATA_REFRESHED } from '../hooks/useBulletinDrivePoll';
import {
  announcementSectionId,
  buildBulletinNavSections,
  buildBulletinNavTree,
  isReadonlyNavSection,
  navSectionById,
  navSectionIndexById,
  parseAnnouncementSectionId,
  resolveNavTargetSectionId,
} from '../lib/bulletin-sections';
import { BULLETIN_WIZARD_STEPS } from '../lib/bulletin-template-steps';
import { buildBulletinPptxFile, publishBulletinPptx } from '../lib/bulletin-publish';
import { friendlyError } from '../lib/error-messages';
import { isLocalBulletinDraftDirty } from '../lib/bulletin-local-draft';
import {
  normalizeWorshipPresentationMode,
  type WorshipPresentationMode,
} from '../lib/worship-presentation-mode';
type AnnouncementDraft = AnnouncementInput & { key: string };

const EDIT_SLIDES_PARAM = 'editSlides';
const BULLETIN_ID_PARAM = 'id';

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

function bulletinIdFromHash(): string | null {
  if (!window.location.hash.startsWith('#/bulletin')) return null;
  return bulletinHashParams().get(BULLETIN_ID_PARAM)?.trim() || null;
}

function toDrafts(bulletin: WeeklyBulletin): AnnouncementDraft[] {
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
    messagePastorEmail: bulletin.messagePastorEmail ?? '',
    messagePastorInviteSentForDate: bulletin.messagePastorInviteSentForDate ?? '',
    versePastorEmail: bulletin.versePastorEmail ?? '',
    versePastorInviteSentForDate: bulletin.versePastorInviteSentForDate ?? '',
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
  const [announcements, setAnnouncements] = useState<AnnouncementDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [driveSyncStatus, setDriveSyncStatus] = useState<BulletinDriveSyncStatus | null>(null);
  const [driveSyncing, setDriveSyncing] = useState(false);
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
  const [previewSkipSlides, setPreviewSkipSlides] = useState<number[]>([]);
  const [slideShowSessionId, setSlideShowSessionId] = useState<string | null>(null);
  const [worshipYoutubeOauthReady, setWorshipYoutubeOauthReady] = useState(false);
  const [worshipOauthError, setWorshipOauthError] = useState<string | null>(null);
  const [pastorInviteSending, setPastorInviteSending] = useState(false);
  const [editSlidesSectionId, setEditSlidesSectionId] = useState<string | null>(() =>
    editSlidesSectionFromHash(),
  );
  const savingRef = useRef(false);
  const scripturePersistingRef = useRef(false);
  const [busySectionId, setBusySectionId] = useState<string | null>(null);
  savingRef.current = saving || publishing || scripturePersistingRef.current;

  /** 新标签打开分区幻灯片编辑页；弹窗被拦时回退到当前页 */
  const openEditSlides = useCallback(
    (sectionId: string) => {
      if (!(BULLETIN_SECTION_TEMPLATE_SLIDES[sectionId]?.length ?? 0)) return;
      const params = new URLSearchParams();
      params.set(EDIT_SLIDES_PARAM, sectionId);
      if (selectedId) params.set(BULLETIN_ID_PARAM, selectedId);
      const hash = bulletinHashWithParams(params);
      const url = `${window.location.origin}${window.location.pathname}${window.location.search}${hash}`;
      const opened = window.open(url, '_blank');
      if (opened) {
        opened.focus();
        return;
      }
      // 浏览器拦截弹窗：仍在本页打开
      window.history.pushState({ bulletinEditSlides: sectionId }, '', hash);
      setEditSlidesSectionId(sectionId);
    },
    [selectedId],
  );

  const closeEditSlides = useCallback(() => {
    const params = bulletinHashParams();
    params.delete(EDIT_SLIDES_PARAM);
    window.history.replaceState(null, '', bulletinHashWithParams(params));
    setEditSlidesSectionId(null);
    // 由「修改幻灯片」新开的标签可直接关掉；若浏览器不允许则留在周报页
    window.close();
  }, []);

  useEffect(() => {
    const syncFromHistory = () => {
      setEditSlidesSectionId(editSlidesSectionFromHash());
    };
    window.addEventListener('popstate', syncFromHistory);
    window.addEventListener('hashchange', syncFromHistory);
    return () => {
      window.removeEventListener('popstate', syncFromHistory);
      window.removeEventListener('hashchange', syncFromHistory);
    };
  }, []);

  const navSections = useMemo(
    () =>
      buildBulletinNavSections(announcements.map((a) => ({ id: a.key, title: a.title, body: a.body })), (n) =>
        t('bulletin.announcementItem', { n }),
      ),
    [announcements, t],
  );
  const navTree = useMemo(
    () =>
      buildBulletinNavTree(announcements.map((a) => ({ id: a.key, title: a.title, body: a.body })), (n) =>
        t('bulletin.announcementItem', { n }),
      ),
    [announcements, t],
  );

  const stepperSteps = useMemo(
    () =>
      navSections.map((section) => ({
        id: section.id,
        label: section.label ?? t(section.labelKey),
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
        hasTemplateSlides:
          section.id.startsWith('announcement:') ||
          (BULLETIN_SECTION_TEMPLATE_SLIDES[section.id]?.length ?? 0) > 0,
        hasPptxOverride: Boolean(draft?.sectionPptxOverrides?.[section.id]),
      })),
    [t, draft, navSections],
  );

  const navCurrentIndex = navSectionIndexById(activeSectionId, navSections);
  const navPreviewIndex = navSectionIndexById(previewSectionId, navSections);
  const currentStepDef = BULLETIN_WIZARD_STEPS[wizardStep];
  const activeSectionReadonly = isReadonlyNavSection(activeSectionId, navSections);

  const handleVisibleSectionChange = useCallback((sectionId: string) => {
    // 预览滚动只更新高亮，不覆盖左侧编辑选中（否则无预览页的分区如未选版式时的本週聚会会被拽回）
    setPreviewSectionId((prev) => (prev === sectionId ? prev : sectionId));
  }, []);

  /** 避免 skipSlides 每次新数组引用触发父组件无限 setState → 狂刷 worship-playlist */
  const handleDeckMetaChange = useCallback(
    (meta: { totalSlides: number; skipSlides: number[] } | null) => {
      const nextTotal = meta?.totalSlides;
      const nextSkip = meta?.skipSlides ?? [];
      setPreviewTotalSlides((prev) => (prev === nextTotal ? prev : nextTotal));
      setPreviewSkipSlides((prev) =>
        prev.length === nextSkip.length && prev.every((n, i) => n === nextSkip[i])
          ? prev
          : nextSkip,
      );
    },
    [],
  );

  const handlePlaylistReady = useCallback((playlistId: string) => {
    setDraft((prev) => {
      if (!prev || prev.servicePlaylistId === playlistId) return prev;
      return { ...prev, servicePlaylistId: playlistId };
    });
  }, []);

  const bumpWorshipPreview = useCallback(() => {
    setWorshipPreviewRevision((v) => v + 1);
  }, []);

  /** 投影窗翻页 → 主页左侧分区与右侧预览跟随 */
  useEffect(() => {
    if (!slideShowSessionId) return;
    const bus = createSlideShowBus(slideShowSessionId);
    const unsub = bus.subscribe((message) => {
      if (message.type === 'close') {
        setSlideShowSessionId(null);
        return;
      }
      if (message.type !== 'sync') return;
      const slide = message.currentSlide;
      if (!Number.isFinite(slide) || slide < 1) return;
      setPreviewScrollToSlide((prev) => ({
        slide,
        bump: (prev?.bump ?? 0) + 1,
      }));
    });
    return () => {
      unsub();
      bus.close();
    };
  }, [slideShowSessionId]);

  const selectNavSection = useCallback(
    (sectionId: string) => {
      const targetId = resolveNavTargetSectionId(sectionId, navTree);
      const section = navSectionById(targetId, navSections);
      if (!section) return;

      setActiveSectionId(targetId);
      setPreviewSectionId(targetId);
      // 每次点左侧都 bump，确保右侧预览滚到对应分区（含重复点击）
      setPreviewScrollBump((b) => b + 1);

      if (section.editableStepId) {
        const stepIdx = BULLETIN_WIZARD_STEPS.findIndex((s) => s.id === section.editableStepId);
        if (stepIdx >= 0) setWizardStep(stepIdx);
      }
    },
    [navSections, navTree],
  );

  const syncAnnouncementsToDraft = useCallback((next: AnnouncementDraft[]) => {
    setAnnouncements(next);
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        announcements: next.map((a, i) => ({
          id: a.key,
          sortOrder: i,
          category: a.category ?? 'general',
          title: a.title ?? '',
          body: a.body,
        })),
      };
    });
  }, []);

  const handleAddAnnouncement = useCallback(() => {
    const key = crypto.randomUUID();
    const next = [
      ...announcements,
      { key, category: 'general', title: '', body: '' },
    ];
    syncAnnouncementsToDraft(next);
    const sectionId = announcementSectionId(key);
    window.setTimeout(() => selectNavSection(sectionId), 0);
    if (!canManage || !draft) return;
    void saveBulletinAnnouncements(
      draft.id,
      next.map((a, i) => ({
        id: a.key,
        sortOrder: i,
        category: a.category ?? 'general',
        title: a.title ?? '',
        body: a.body,
      })),
    ).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [announcements, canManage, draft, selectNavSection, syncAnnouncementsToDraft]);

  const handleRemoveAnnouncement = useCallback(
    (sectionId: string) => {
      const itemId = parseAnnouncementSectionId(sectionId);
      if (!itemId) return;
      const next = announcements.filter((a) => a.key !== itemId);
      syncAnnouncementsToDraft(next);
      setDraft((prev) => {
        if (!prev) return prev;
        const hidden = (prev.hiddenSections ?? []).filter((id) => id !== sectionId);
        return { ...prev, hiddenSections: hidden };
      });
      const fallback =
        next[0] != null
          ? announcementSectionId(next[0].key)
          : 'baptism';
      selectNavSection(fallback);
      if (!canManage || !draft) return;
      void saveBulletinAnnouncements(
        draft.id,
        next.map((a, i) => ({
          id: a.key,
          sortOrder: i,
          category: a.category ?? 'general',
          title: a.title ?? '',
          body: a.body,
        })),
      )
        .then(async () => {
          const hiddenSections = setBulletinSectionVisible(draft.hiddenSections, sectionId, true);
          // ensure removed id not in hidden
          const cleaned = hiddenSections.filter((id) => id !== sectionId);
          await updateBulletin(draft.id, {
            hiddenSections: cleaned,
            skipTestimonyWeek: cleaned.includes('testimony_week'),
            skipDepartmentReports: cleaned.includes('department_reports'),
          });
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    },
    [announcements, canManage, draft, selectNavSection, syncAnnouncementsToDraft],
  );

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
          const hashId = bulletinIdFromHash();
          const fromHash = hashId ? rows.find((b) => b.id === hashId) : null;
          setSelectedId(fromHash?.id ?? target?.id ?? rows[0]?.id ?? null);
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
    let cancelled = false;
    (async () => {
      try {
        const { schedules } = await fetchServiceRotationSchedule();
        if (cancelled) return;
        setServiceRotationSchedules(schedules);
        setDraft((prev) => (prev ? withHiddenSections(prev) : prev));
      } catch {
        // 回退 bundled JSON
      }
      if (!canManage) return;
      try {
        const status = await fetchBulletinDriveSyncStatus();
        if (!cancelled) setDriveSyncStatus(status);
      } catch {
        // 忽略
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManage]);

  useEffect(() => {
    const onRefreshed = () => {
      setDraft((prev) => (prev ? withHiddenSections(prev) : prev));
      if (!canManage) return;
      void fetchBulletinDriveSyncStatus()
        .then(setDriveSyncStatus)
        .catch(() => undefined);
    };
    window.addEventListener(BULLETIN_DRIVE_DATA_REFRESHED, onRefreshed);
    return () => window.removeEventListener(BULLETIN_DRIVE_DATA_REFRESHED, onRefreshed);
  }, [canManage]);

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
      if (key === 'serviceDate' && typeof value === 'string') {
        const fromSchedule = resolveServiceRosterFromSchedule(value);
        if (fromSchedule) {
          next = { ...next, ...fromSchedule };
          // 换主日后服事轮值来自季度表，清掉可能挡住预览的分区 PPT
          if (next.sectionPptxOverrides) {
            const overrides = { ...next.sectionPptxOverrides };
            delete overrides.service_roster;
            delete overrides.rotation;
            next = { ...next, sectionPptxOverrides: overrides };
          }
          if (next.slideTextOverrides?.length) {
            const drop = new Set([32, 34]);
            next = {
              ...next,
              slideTextOverrides: next.slideTextOverrides.filter((o) => !drop.has(o.slide)),
            };
          }
        }
      }
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
        if (key === 'birthdayMonth') {
          // 换月只清掉旧 birthday 别名，保留 birthday_N 各月编辑
          delete overrides.birthday;
        } else {
          delete overrides[sectionId];
        }
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

  const handleDriveSync = async () => {
    if (!canManage || driveSyncing) return;
    try {
      setDriveSyncing(true);
      setError(null);
      const result = await triggerBulletinDriveSync();
      setDriveSyncStatus(result.state);
      try {
        const { schedules } = await fetchServiceRotationSchedule();
        setServiceRotationSchedules(schedules);
        setDraft((prev) => (prev ? withHiddenSections(prev) : prev));
      } catch {
        // ignore
      }
      setMessage(t('bulletin.driveSyncDone'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDriveSyncing(false);
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
      const sentHiddenKey = [...hiddenSections].sort().join(',');
      setDraft((prev) => (prev ? { ...prev, ...patch } : prev));

      if (visible) {
        selectNavSection(sectionId);
        window.setTimeout(() => setPreviewScrollBump((b) => b + 1), 280);
      }

      if (!canManage) return;
      void updateBulletin(draft.id, patch)
        .then((updated) => {
          setDraft((prev) => {
            if (!prev || prev.id !== updated.id) return prev;
            const currentHiddenKey = [...resolveHiddenSections(prev)].sort().join(',');
            // 用户又改过显示/隐藏：勿用过期响应整表覆盖，否则分区与预览会错位到刷新才恢复
            if (currentHiddenKey !== sentHiddenKey) {
              return { ...prev, updatedAt: updated.updatedAt ?? prev.updatedAt };
            }
            return withHiddenSections(updated);
          });
          setMessage(t('bulletin.saved'));
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
        });
    },
    [canManage, draft, selectNavSection, t],
  );

  const persistWorshipPresentationMode = useCallback(
    async (mode: WorshipPresentationMode) => {
      if (!draft) return;
      const previous = normalizeWorshipPresentationMode(draft.worshipPresentationMode);
      if (mode === previous) return;
      setDraft((prev) => (prev ? { ...prev, worshipPresentationMode: mode } : prev));
      try {
        const updated = await updateBulletin(draft.id, { worshipPresentationMode: mode });
        const confirmed = normalizeWorshipPresentationMode(
          updated.worshipPresentationMode,
          mode,
        );
        setDraft((prev) =>
          prev
            ? {
                ...prev,
                worshipPresentationMode: confirmed,
                updatedAt: updated.updatedAt,
              }
            : prev,
        );
      } catch (err) {
        setDraft((prev) => (prev ? { ...prev, worshipPresentationMode: previous } : prev));
        throw err;
      }
    },
    [draft],
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

  const handleSendPastorInvite = useCallback(
    async (sectionId: 'message' | 'verse_of_week') => {
      if (!draft || !canManage || pastorInviteSending) return;
      const email = (
        sectionId === 'verse_of_week' ? draft.versePastorEmail : draft.messagePastorEmail
      )?.trim();
      if (!email) {
        setError(friendlyError('invalid_email', t));
        return;
      }
      setPastorInviteSending(true);
      setError(null);
      try {
        const result = await inviteBulletinSectionPastor(draft.id, sectionId, { email });
        if (result.bulletin) {
          setDraft(withHiddenSections(result.bulletin));
        } else {
          setDraft((prev) => {
            if (!prev) return prev;
            if (sectionId === 'verse_of_week') {
              return {
                ...prev,
                versePastorEmail: result.email,
                versePastorInviteSentForDate: prev.serviceDate,
              };
            }
            return {
              ...prev,
              messagePastorEmail: result.email,
              messagePastorInviteSentForDate: prev.serviceDate,
            };
          });
        }
        setMessage(t('bulletin.pastorInviteSent', { email: result.email }));
      } catch (err) {
        setError(friendlyError(err instanceof Error ? err.message : 'email_send_failed', t));
      } finally {
        setPastorInviteSending(false);
      }
    },
    [canManage, draft, pastorInviteSending, t],
  );

  const renderStepPanel = () => {
    if (!draft) return null;

    if (activeSectionId === 'message' && canManage) {
      const email = (draft.messagePastorEmail ?? '').trim();
      return (
        <div className="bulletin-message-pastor-panel">
          <p className="bulletin-step-hint">{t('bulletin.pastorInviteSectionIntro')}</p>
          <label className="share-playlist-field">
            <span>{t('bulletin.pastorInviteEmail')}</span>
            <input
              type="email"
              className="playlists-text-input"
              value={draft.messagePastorEmail ?? ''}
              placeholder={t('bulletin.pastorInviteEmailPlaceholder')}
              autoComplete="email"
              disabled={pastorInviteSending}
              onChange={(e) => patchField('messagePastorEmail', e.target.value)}
            />
          </label>
          <div className="bulletin-message-pastor-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={pastorInviteSending || !email}
              onClick={() => void handleSendPastorInvite('message')}
            >
              {pastorInviteSending
                ? t('bulletin.pastorInviteSending')
                : t('bulletin.pastorInviteSendNow')}
            </button>
          </div>
          <p className="playlists-muted">{t('bulletin.pastorInviteScheduleHint')}</p>
        </div>
      );
    }

    if (activeSectionId === 'verse_of_week') {
      if (canManage) {
        const email = (draft.versePastorEmail ?? '').trim();
        return (
          <div className="bulletin-message-pastor-panel">
            <p className="bulletin-step-hint">{t('bulletin.versePastorInviteSectionIntro')}</p>
            {draft.verseOfWeek?.trim() ? (
              <div className="bulletin-verse-current">
                <p className="bulletin-field-label">{t('bulletin.verseOfWeekCurrent')}</p>
                <p className="bulletin-verse-current-text">{draft.verseOfWeek}</p>
              </div>
            ) : null}
            <label className="share-playlist-field">
              <span>{t('bulletin.pastorInviteEmail')}</span>
              <input
                type="email"
                className="playlists-text-input"
                value={draft.versePastorEmail ?? ''}
                placeholder={t('bulletin.pastorInviteEmailPlaceholder')}
                autoComplete="email"
                disabled={pastorInviteSending}
                onChange={(e) => patchField('versePastorEmail', e.target.value)}
              />
            </label>
            <div className="bulletin-message-pastor-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={pastorInviteSending || !email}
                onClick={() => void handleSendPastorInvite('verse_of_week')}
              >
                {pastorInviteSending
                  ? t('bulletin.pastorInviteSending')
                  : t('bulletin.versePastorInviteSendNow')}
              </button>
            </div>
            <p className="playlists-muted">{t('bulletin.versePastorInviteScheduleHint')}</p>
          </div>
        );
      }
      return (
        <div className="bulletin-verse-readonly-panel">
          {draft.verseOfWeek?.trim() ? (
            <>
              <p className="bulletin-field-label">{t('bulletin.verseOfWeek')}</p>
              <p className="bulletin-verse-current-text">{draft.verseOfWeek}</p>
            </>
          ) : (
            <p className="playlists-muted">{t('bulletin.verseAwaitingPastor')}</p>
          )}
        </div>
      );
    }

    if (activeSectionReadonly) {
      // 模板固定页：中间无需表单；分区操作在左侧右键菜单
      return null;
    }

    const common = {
      draft,
      canEdit: canManage,
      saving,
      onPatch: patchField,
      onEditSlides: openEditSlides,
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
            onPlaylistReady={handlePlaylistReady}
            onPlaylistChanged={bumpWorshipPreview}
            onLyricsPptxChange={(blobId) => {
              setDraft((prev) => (prev ? { ...prev, worshipLyricsPptxBlobId: blobId } : prev));
              bumpWorshipPreview();
            }}
            onPersistPresentationMode={persistWorshipPresentationMode}
          />
        );
      case 'offering':
        return <BulletinOfferingStep {...common} />;
      case 'birthday':
        return <BulletinBirthdayStep {...common} />;
      case 'announcement_item':
        return (
          <BulletinAnnouncementItemStep
            canEdit={canManage}
            saving={saving}
            sectionId={activeSectionId}
            announcements={announcements}
            onAnnouncementsChange={syncAnnouncementsToDraft}
            onSave={() => void handleSaveFields({}, true)}
          />
        );
      case 'baptism':
        return <BulletinBaptismStep {...common} />;
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
        <div className="bulletin-header-title-row">
          <h1>{t('bulletin.title')}</h1>
          {bulletins.length > 0 ? (
            <select
              className="bulletin-week-select"
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value || null)}
              aria-label={t('bulletin.weeks')}
            >
              {bulletins.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.outputBlobId
                    ? `${b.serviceDate} (${t('bulletin.publishedBadge')})`
                    : b.serviceDate}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="bulletin-header-actions">
          <div className="bulletin-header-btn-group" role="group" aria-label={t('bulletin.title')}>
            {draft && canPublish ? (
              <button
                type="button"
                className="btn-primary"
                disabled={publishing}
                onClick={() => void handlePublish()}
              >
                {publishing ? t('bulletin.publishing') : t('bulletin.publishToLibrary')}
              </button>
            ) : null}
            {draft ? (
              <BulletinSlideShowLauncher
                bulletin={draft}
                totalSlides={previewTotalSlides}
                skipSlides={previewSkipSlides}
                className="btn-secondary bulletin-slideshow-start"
                disabled={!permissions.canViewBulletin}
                onSessionStarted={setSlideShowSessionId}
              />
            ) : null}
            {draft ? (
              <button
                type="button"
                className="btn-secondary"
                disabled={generating}
                onClick={() => void handleGenerate()}
              >
                {generating ? t('bulletin.generating') : t('bulletin.downloadPptx')}
              </button>
            ) : null}
            {draft?.outputBlobId && permissions.canDownload ? (
              <a
                className="btn-secondary"
                href={`#/preview/${encodeURIComponent(draft.outputBlobId)}?title=${encodeURIComponent(draft.serviceDate)}`}
              >
                {t('bulletin.openInLibrary')}
              </a>
            ) : null}
            {canManage ? (
              <button type="button" className="btn-primary" disabled={saving} onClick={handleCreate}>
                {t('bulletin.create')}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}
      {canManage && driveSyncStatus?.configured ? (
        <p className="playlists-muted bulletin-drive-sync-status">
          {driveSyncStatus.lastError
            ? t('bulletin.driveSyncError', { error: driveSyncStatus.lastError })
            : t('bulletin.driveSyncLastRun', {
                time: driveSyncStatus.lastRunAt
                  ? new Date(driveSyncStatus.lastRunAt).toLocaleString()
                  : '—',
              })}{' '}
          <button
            type="button"
            className="btn-secondary"
            disabled={driveSyncing}
            onClick={() => void handleDriveSync()}
          >
            {driveSyncing ? t('bulletin.driveSyncing') : t('bulletin.driveSyncNow')}
          </button>
        </p>
      ) : null}

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
                openEditSlides(sectionId);
              }}
              onReplacePptx={handleReplaceSectionPptx}
              onResetPptx={handleResetSectionPptx}
              onStepVisibilityChange={handleSectionVisibilityChange}
              onAddAnnouncement={handleAddAnnouncement}
              onRemoveAnnouncement={handleRemoveAnnouncement}
              onStepSelect={(index) => {
                const section = navSections[index];
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
          </section>

          <aside className="bulletin-workspace-preview" aria-label={t('bulletin.previewTitle')}>
            <BulletinPreviewPanel
              scrollToSectionId={activeSectionId}
              scrollToSectionBump={previewScrollBump}
              scrollToPresentationSlide={previewScrollToSlide}
              busySectionId={busySectionId}
              bulletin={draft}
              navOrder={navSections}
              worshipRefreshKey={worshipPreviewRevision}
              onVisibleSectionChange={handleVisibleSectionChange}
              onDeckMetaChange={handleDeckMetaChange}
              onWorshipPresentationModeChange={(mode) => {
                void persistWorshipPresentationMode(mode).catch((err) => {
                  setError(friendlyError(err instanceof Error ? err.message : 'update_failed', t));
                });
              }}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
