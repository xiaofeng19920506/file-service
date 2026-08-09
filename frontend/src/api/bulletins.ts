import { apiFetch, parseJson } from './http';
import type { PlaylistDetail } from './playlists';
import { runBulletinPreviewTask, type BulletinPreviewPriority } from '../lib/bulletin-preview-queue';

export type BulletinAnnouncement = {
  id: string;
  sortOrder: number;
  category: string;
  title: string;
  body: string;
};

export type SlideTextOverride = {
  slide: number;
  textIndex: number;
  text: string;
};

export type WeeklyBulletin = {
  id: string;
  serviceDate: string;
  serviceTime: string;
  status: string;
  lastWeekOfferingDate: string;
  offeringQuarterLabel: string;
  offeringTitheAmount: string;
  offeringOtherAmount: string;
  /** 后端计算：十一奉献 + 其他奉献 */
  offeringTotalAmount: string;
  birthdayMonth: string;
  birthdayNames: string;
  showPreServiceChairName: boolean;
  preServiceChairNames: string;
  staffMeetingDate: string;
  staffMeetingYear: string;
  staffMeetingMonth: string;
  staffMeetingStartTime: string;
  staffMeetingEndTime: string;
  testimonyShareDate: string;
  serviceRosterText: string;
  serviceRosterTodayDate: string;
  serviceRosterNextDate: string;
  serviceRosterChair: string;
  serviceRosterWorship: string;
  serviceRosterUsher: string;
  serviceRosterCleanNames: string;
  rotationStartMonth: string;
  rotationEndMonth: string;
  baptismText: string;
  scriptureBook: string;
  scriptureReference: string;
  verseOfWeek: string;
  weeklyMeetingVariant: number | null;
  /** 本周报内自定义本週聚会模版 */
  weeklyMeetingTemplates: { id: string; label: string; blobId: string }[];
  /** 选中的自定义模版 id；有值时优先于 variant */
  weeklyMeetingTemplateId: string | null;
  skipTestimonyWeek: boolean;
  skipDepartmentReports: boolean;
  /** 不显示的分区 id */
  hiddenSections: string[];
  /** 各分区幻灯片文字覆盖（模板 run 序号） */
  slideTextOverrides: SlideTextOverride[];
  /** 分区迷你 PPTX blob（sectionId → blobId） */
  sectionPptxOverrides: Record<string, string>;
  /** 主日信息牧师邮箱（每周一定时邀请上传 PPT） */
  messagePastorEmail: string;
  /** 已为哪个 serviceDate 发过周一邀请 */
  messagePastorInviteSentForDate: string;
  /** 本週金句牧师邮箱（每周一定时邀请填写金句） */
  versePastorEmail: string;
  versePastorInviteSentForDate: string;
  outputBlobId: string | null;
  servicePlaylistId: string | null;
  /** 敬拜赞美投影格式 */
  worshipPresentationMode: 'ppt' | 'youtube' | 'ppt_youtube';
  /** 敬拜赞美歌词 PPT blob */
  worshipLyricsPptxBlobId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string | null;
  announcements: BulletinAnnouncement[];
};

export type BulletinPatch = Partial<{
  serviceDate: string;
  serviceTime: string;
  status: string;
  lastWeekOfferingDate: string;
  offeringQuarterLabel: string;
  offeringTitheAmount: string;
  offeringOtherAmount: string;
  birthdayMonth: string;
  birthdayNames: string;
  showPreServiceChairName: boolean;
  preServiceChairNames: string;
  staffMeetingDate: string;
  staffMeetingYear: string;
  staffMeetingMonth: string;
  staffMeetingStartTime: string;
  staffMeetingEndTime: string;
  testimonyShareDate: string;
  serviceRosterText: string;
  serviceRosterTodayDate: string;
  serviceRosterNextDate: string;
  serviceRosterChair: string;
  serviceRosterWorship: string;
  serviceRosterUsher: string;
  serviceRosterCleanNames: string;
  rotationStartMonth: string;
  rotationEndMonth: string;
  baptismText: string;
  scriptureBook: string;
  scriptureReference: string;
  verseOfWeek: string;
  weeklyMeetingVariant: number | null;
  weeklyMeetingTemplates: { id: string; label: string; blobId: string }[];
  weeklyMeetingTemplateId: string | null;
  skipTestimonyWeek: boolean;
  skipDepartmentReports: boolean;
  hiddenSections: string[];
  slideTextOverrides: SlideTextOverride[];
  sectionPptxOverrides: Record<string, string>;
  messagePastorEmail: string;
  versePastorEmail: string;
  outputBlobId: string | null;
  worshipPresentationMode: 'ppt' | 'youtube' | 'ppt_youtube';
  worshipLyricsPptxBlobId: string | null;
}>;

export type AnnouncementInput = {
  category?: string;
  title?: string;
  body: string;
};

export async function listBulletins(): Promise<WeeklyBulletin[]> {
  const res = await apiFetch('/v1/bulletins');
  const data = await parseJson<{ bulletins: WeeklyBulletin[] }>(res);
  return data.bulletins;
}

export async function getBulletin(id: string): Promise<WeeklyBulletin> {
  const res = await apiFetch(`/v1/bulletins/${encodeURIComponent(id)}`);
  const data = await parseJson<{ bulletin: WeeklyBulletin }>(res);
  return data.bulletin;
}

export type ServiceRotationScheduleDto = {
  source?: string;
  quarter: {
    year: number;
    startMonth: number;
    endMonth: number;
  };
  weeks: Array<{
    date: string;
    chair: string;
    usher: string;
    worship: string;
    cleaning: string;
    scripture?: string;
    communionOrTestimony?: string;
    sound?: string;
  }>;
};

export async function fetchServiceRotationSchedule(): Promise<{
  schedules: ServiceRotationScheduleDto[];
  libraryRev: string;
}> {
  const res = await apiFetch('/v1/bulletins/service-rotation/schedule');
  return parseJson(res);
}

export type BulletinDriveSyncStatus = {
  configured: boolean;
  lastRunAt?: string;
  lastError?: string | null;
  libraryRev?: string;
  rotation: {
    modifiedTime?: string;
    name?: string;
    lastSyncedAt?: string;
    lastError?: string | null;
  };
  birthday: {
    modifiedTime?: string;
    name?: string;
    lastSyncedAt?: string;
    lastError?: string | null;
  };
};

export async function fetchBulletinDriveSyncStatus(): Promise<BulletinDriveSyncStatus> {
  const res = await apiFetch('/v1/bulletins/drive-sync/status');
  return parseJson(res);
}

export async function triggerBulletinDriveSync(): Promise<{
  rotationUpdated: boolean;
  birthdayUpdated: boolean;
  state: BulletinDriveSyncStatus;
  libraryRev?: string;
}> {
  const res = await apiFetch('/v1/bulletins/drive-sync/sync', { method: 'POST' });
  return parseJson(res);
}

export async function createBulletin(serviceDate: string): Promise<WeeklyBulletin> {
  const res = await apiFetch('/v1/bulletins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceDate }),
  });
  const data = await parseJson<{ bulletin: WeeklyBulletin }>(res);
  return data.bulletin;
}

export async function updateBulletin(id: string, patch: BulletinPatch): Promise<WeeklyBulletin> {
  const res = await apiFetch(`/v1/bulletins/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await parseJson<{ bulletin: WeeklyBulletin }>(res);
  return data.bulletin;
}

export async function saveBulletinAnnouncements(
  id: string,
  announcements: AnnouncementInput[],
): Promise<WeeklyBulletin> {
  const res = await apiFetch(`/v1/bulletins/${encodeURIComponent(id)}/announcements`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ announcements }),
  });
  const data = await parseJson<{ bulletin: WeeklyBulletin }>(res);
  return data.bulletin;
}

export type BulletinTemplateSection = {
  id: string;
  slides: number[];
  role: string;
  notes?: string;
};

export type BulletinTemplateMap = {
  totalSlides: number;
  templateFile: string;
  sections: BulletinTemplateSection[];
};

export async function fetchBulletinTemplateMap(): Promise<BulletinTemplateMap> {
  const res = await apiFetch('/v1/bulletins/template/slides');
  return parseJson<BulletinTemplateMap>(res);
}

export async function fetchBulletinTemplateFile(): Promise<Blob> {
  const res = await apiFetch('/v1/bulletins/template/file');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : res.statusText;
    throw new Error(msg);
  }
  return res.blob();
}

/** 从服务器模板库取出某月生日单页 PPTX */
export async function fetchBirthdayMonthTemplateFile(month: number): Promise<Blob> {
  const res = await apiFetch(`/v1/bulletins/template/birthday/${month}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : res.statusText;
    throw new Error(msg);
  }
  return res.blob();
}

export type ScriptureSlideBodies = {
  chinesePages: string[];
  englishPages: string[][];
};

export async function fetchScriptureSlideBodies(
  scriptureBook: string,
  scriptureReference: string,
): Promise<ScriptureSlideBodies | null> {
  const qs = new URLSearchParams({
    scriptureBook,
    scriptureReference,
  });
  const res = await apiFetch(`/v1/bulletins/scripture-bodies?${qs}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : res.statusText;
    throw new Error(msg);
  }
  return parseJson<ScriptureSlideBodies>(res);
}

export type ScripturePreference = {
  bulletinId: string;
  scriptureBook: string;
  scriptureReference: string;
  updatedAt: string;
  expiresAt: string;
};

export async function fetchScripturePreference(
  bulletinId: string,
): Promise<ScripturePreference | null> {
  const qs = new URLSearchParams({ bulletinId });
  const res = await apiFetch(`/v1/bulletins/scripture-preference?${qs}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : res.statusText;
    throw new Error(msg);
  }
  const data = await parseJson<{ preference: ScripturePreference }>(res);
  return data.preference;
}

export async function saveScripturePreference(input: {
  bulletinId: string;
  scriptureBook: string;
  scriptureReference: string;
}): Promise<ScripturePreference> {
  const res = await apiFetch('/v1/bulletins/scripture-preference', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : res.statusText;
    throw new Error(msg);
  }
  const data = await parseJson<{ preference: ScripturePreference }>(res);
  return data.preference;
}

/** 服务端用 LibreOffice 从原版 PPT 渲染幻灯片 PNG（已按参数补丁封面/读经等文字） */
export type BulletinSlidePreviewParams = {
  serviceDate?: string;
  serviceTime?: string;
  scriptureBook?: string;
  scriptureReference?: string;
  showPreServiceChairName?: boolean;
  preServiceChairNames?: string;
  birthdayMonth?: string;
  birthdayNames?: string;
  verseOfWeek?: string;
  /** 动态公告（已过滤隐藏项；可带 id 供 deck remap） */
  announcements?: { id?: string; title: string; body: string }[];
  hiddenSections?: string[];
  weeklyMeetingVariant?: number | null;
  /** 草稿文字覆盖（与预览/导出一致） */
  slideTextOverrides?: SlideTextOverride[];
  /**
   * 周报 id：服务端据此加载 sectionPptxOverrides 并拼进预览 PPTX，
   * 否则右侧预览只看模板补丁，分区编辑器里改的字体/样式都看不到。
   */
  bulletinId?: string;
  /**
   * 分区 PPT 覆盖指纹（sectionId:blobId），仅用于前端缓存失效；
   * 实际内容由服务端按 bulletinId 读取。
   */
  sectionPptxKey?: string;
};

export type BulletinDeckPlanDto = {
  rev: string;
  totalSlides: number;
  slides: { index: number; slideInFile: number; sectionId: string }[];
  sections: { id: string; slides: number[] }[];
};

function bulletinPreviewQuery(params: BulletinSlidePreviewParams): string {
  const qs = new URLSearchParams();
  if (params.serviceDate) qs.set('serviceDate', params.serviceDate);
  if (params.serviceTime) qs.set('serviceTime', params.serviceTime);
  if (params.scriptureBook) qs.set('scriptureBook', params.scriptureBook);
  if (params.scriptureReference) qs.set('scriptureReference', params.scriptureReference);
  if (params.showPreServiceChairName) qs.set('showPreServiceChairName', '1');
  if (params.preServiceChairNames) qs.set('preServiceChairNames', params.preServiceChairNames);
  if (params.birthdayMonth) qs.set('birthdayMonth', params.birthdayMonth);
  if (params.birthdayNames) qs.set('birthdayNames', params.birthdayNames);
  if (params.verseOfWeek) qs.set('verseOfWeek', params.verseOfWeek);
  if (params.announcements !== undefined) {
    qs.set('announcements', JSON.stringify(params.announcements));
  }
  if (params.hiddenSections?.length) qs.set('hiddenSections', params.hiddenSections.join(','));
  if (params.weeklyMeetingVariant != null) {
    qs.set('weeklyMeetingVariant', String(params.weeklyMeetingVariant));
  }
  // [] 也必须显式发送：省略会让服务端回退读取数据库里的旧覆盖，
  // 导致用户刚清空覆盖时编辑数据与 PNG 预览不一致。
  if (params.slideTextOverrides !== undefined) {
    qs.set('slideTextOverrides', JSON.stringify(params.slideTextOverrides));
  }
  if (params.bulletinId) qs.set('bulletinId', params.bulletinId);
  // 仅作 URL cache-buster：分区 PPT 覆盖变化后 URL 必须不同，
  // 否则浏览器/代理可能复用旧 PNG（服务端会忽略此参数，按 bulletinId 取真实覆盖）。
  if (params.sectionPptxKey) qs.set('sectionPptxKey', params.sectionPptxKey);
  return qs.toString();
}

/** 模板某页可编辑文字 run（与补丁 textIndex 对齐） */
export async function fetchBulletinSlideTextRuns(
  slideNumber: number,
): Promise<{ slide: number; runs: { textIndex: number; text: string }[] }> {
  const res = await apiFetch(
    `/v1/bulletins/template/slides/${slideNumber}/text-runs`,
  );
  return parseJson(res);
}

/** 与预览 PNG 同一套补丁算出的分区（避免读经加页后前端页码错位） */
export async function fetchBulletinDeckPlan(
  params: BulletinSlidePreviewParams,
): Promise<BulletinDeckPlanDto> {
  const query = bulletinPreviewQuery(params);
  const path = `/v1/bulletins/template/deck-plan${query ? `?${query}` : ''}`;
  const res = await apiFetch(path);
  return parseJson<BulletinDeckPlanDto>(res);
}

export async function fetchBulletinSlidePreviewPng(
  slideNumber: number,
  params: BulletinSlidePreviewParams,
  options?: { priority?: BulletinPreviewPriority },
): Promise<Blob> {
  const query = bulletinPreviewQuery(params);
  const path = `/v1/bulletins/template/slides/${slideNumber}/preview.png${query ? `?${query}` : ''}`;
  const priority = options?.priority ?? 'normal';

  const maxAttempts = 3;
  let lastError = 'slide_preview_unavailable';
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await runBulletinPreviewTask(() => apiFetch(path), priority);
    if (res.ok) return res.blob();

    const data = await res.json().catch(() => ({}));
    lastError =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : res.statusText;

    if (res.status === 503 && attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      continue;
    }
    throw new Error(lastError);
  }
  throw new Error(lastError);
}

export type WorshipPlaylistInvite = {
  bulletin: WeeklyBulletin;
  playlist: { id: string; title: string };
  inviteToken: string;
  inviteUrl: string;
  expiresAtUnix: number;
  emailed?: boolean;
  emailedCount?: number;
  emailError?: string;
};

export type WorshipTeamMember = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};

export async function listWorshipTeamMembers(): Promise<{ members: WorshipTeamMember[] }> {
  const res = await apiFetch('/v1/bulletins/worship-team-members');
  return parseJson<{ members: WorshipTeamMember[] }>(res);
}

export async function ensureBulletinWorshipPlaylist(bulletinId: string): Promise<WorshipPlaylistInvite> {
  const res = await apiFetch(`/v1/bulletins/${encodeURIComponent(bulletinId)}/worship-playlist`, {
    method: 'POST',
  });
  return parseJson<WorshipPlaylistInvite>(res);
}

export async function inviteBulletinWorshipLeader(
  bulletinId: string,
  body: { email?: string; emails?: string[]; userIds?: string[]; message?: string },
): Promise<WorshipPlaylistInvite> {
  const res = await apiFetch(
    `/v1/bulletins/${encodeURIComponent(bulletinId)}/worship-playlist/invite`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  return parseJson<WorshipPlaylistInvite>(res);
}

export type BulletinSectionPastorInvite = {
  inviteToken: string;
  inviteUrl: string;
  expiresAtUnix: number;
  emailed: boolean;
  email: string;
  sectionId: string;
  bulletin?: WeeklyBulletin;
};

export async function inviteBulletinSectionPastor(
  bulletinId: string,
  sectionId: string,
  body?: { email?: string; message?: string },
): Promise<BulletinSectionPastorInvite> {
  const res = await apiFetch(
    `/v1/bulletins/${encodeURIComponent(bulletinId)}/sections/${encodeURIComponent(sectionId)}/invite`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    },
  );
  return parseJson<BulletinSectionPastorInvite>(res);
}

export type BulletinSectionInviteInfo = {
  bulletinId: string;
  serviceDate: string;
  serviceTime: string;
  sectionId: string;
  hasPptxOverride: boolean;
  pptxBlobId?: string | null;
  pptxFileName?: string | null;
  pptxUploadedAt?: string | null;
  verseOfWeek?: string;
  expiresAtUnix: number;
};

export async function fetchBulletinSectionInvite(
  token: string,
): Promise<BulletinSectionInviteInfo> {
  const res = await apiFetch(`/v1/bulletins/section-invite/${encodeURIComponent(token)}`);
  return parseJson<BulletinSectionInviteInfo>(res);
}

/** 邀请链接下载已上传的分区 PPT（公开，凭 token） */
export function bulletinSectionInvitePptxDownloadUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  return `${base}/v1/bulletins/section-invite/${encodeURIComponent(token)}/pptx`;
}

export async function uploadBulletinSectionInvitePptx(
  token: string,
  file: File,
): Promise<{ ok: true; blobId: string; sectionId: string; fileName?: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch(`/v1/bulletins/section-invite/${encodeURIComponent(token)}/pptx`, {
    method: 'POST',
    body: form,
  });
  return parseJson<{ ok: true; blobId: string; sectionId: string; fileName?: string }>(res);
}

export async function submitBulletinSectionInviteVerse(
  token: string,
  verseOfWeek: string,
): Promise<{ ok: true; verseOfWeek: string; sectionId: string }> {
  const res = await apiFetch(`/v1/bulletins/section-invite/${encodeURIComponent(token)}/verse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verseOfWeek }),
  });
  return parseJson<{ ok: true; verseOfWeek: string; sectionId: string }>(res);
}

export type BulletinWorshipPlaylistDetail = PlaylistDetail & {
  bulletin: { id: string; serviceDate: string; serviceTime: string };
  canEdit?: boolean;
};

export type BulletinWorshipPlaylistEmpty = {
  bulletin: WeeklyBulletin;
  playlist: null;
  items: [];
  canEdit: boolean;
};

export type BulletinWorshipPlaylistResponse =
  | BulletinWorshipPlaylistDetail
  | BulletinWorshipPlaylistEmpty;

export async function getBulletinWorshipPlaylist(
  bulletinId: string,
): Promise<BulletinWorshipPlaylistResponse> {
  const res = await apiFetch(`/v1/bulletins/${encodeURIComponent(bulletinId)}/worship-playlist`);
  return parseJson<BulletinWorshipPlaylistResponse>(res);
}

export async function openBulletinWorshipPlaylist(
  bulletinId: string,
): Promise<BulletinWorshipPlaylistDetail> {
  const res = await apiFetch(
    `/v1/bulletins/${encodeURIComponent(bulletinId)}/worship-playlist/open`,
    { method: 'POST' },
  );
  return parseJson<BulletinWorshipPlaylistDetail>(res);
}

export async function addBulletinWorshipPlaylistItems(
  bulletinId: string,
  url: string,
): Promise<PlaylistDetail & { addedCount: number; skippedCount: number }> {
  const res = await apiFetch(
    `/v1/bulletins/${encodeURIComponent(bulletinId)}/worship-playlist/items`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    },
  );
  return parseJson<PlaylistDetail & { addedCount: number; skippedCount: number }>(res);
}

export async function addBulletinWorshipPlaylistItemsByVideos(
  bulletinId: string,
  items: { videoId: string; title: string }[],
): Promise<PlaylistDetail & { addedCount: number; skippedCount: number }> {
  const res = await apiFetch(
    `/v1/bulletins/${encodeURIComponent(bulletinId)}/worship-playlist/items`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    },
  );
  return parseJson<PlaylistDetail & { addedCount: number; skippedCount: number }>(res);
}

export async function reorderBulletinWorshipPlaylistItems(
  bulletinId: string,
  itemIds: string[],
): Promise<PlaylistDetail> {
  const res = await apiFetch(
    `/v1/bulletins/${encodeURIComponent(bulletinId)}/worship-playlist/items/order`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds }),
    },
  );
  return parseJson<PlaylistDetail>(res);
}

export async function removeBulletinWorshipPlaylistItem(
  bulletinId: string,
  itemId: string,
): Promise<void> {
  const res = await apiFetch(
    `/v1/bulletins/${encodeURIComponent(bulletinId)}/worship-playlist/items/${encodeURIComponent(itemId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : res.statusText;
    throw new Error(msg);
  }
}

export async function patchBulletinWorshipPlaylistItem(
  bulletinId: string,
  itemId: string,
  body: {
    title?: string;
    playStartSec?: number | null;
    playEndSec?: number | null;
    playClips?: Array<{
      startSec: number;
      endSec: number | null;
      label?: string | null;
    }> | null;
  },
): Promise<PlaylistDetail> {
  const res = await apiFetch(
    `/v1/bulletins/${encodeURIComponent(bulletinId)}/worship-playlist/items/${encodeURIComponent(itemId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  return parseJson<PlaylistDetail>(res);
}

export async function importBulletinWorshipYoutubePlaylist(
  bulletinId: string,
  youtubePlaylistId: string,
): Promise<PlaylistDetail & { addedCount: number; skippedCount: number }> {
  const res = await apiFetch(
    `/v1/bulletins/${encodeURIComponent(bulletinId)}/worship-playlist/import-youtube`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtubePlaylistId }),
    },
  );
  return parseJson(res);
}
