import { apiFetch, parseJson } from './http';
import type { PlaylistDetail } from './playlists';
import { runBulletinPreviewTask } from '../lib/bulletin-preview-queue';

export type BulletinAnnouncement = {
  id: string;
  sortOrder: number;
  category: string;
  title: string;
  body: string;
};

export type WeeklyBulletin = {
  id: string;
  serviceDate: string;
  serviceTime: string;
  status: string;
  lastWeekOfferingDate: string;
  offeringQuarterLabel: string;
  birthdayMonth: string;
  birthdayNames: string;
  showPreServiceChairName: boolean;
  preServiceChairNames: string;
  staffMeetingDate: string;
  testimonyShareDate: string;
  serviceRosterText: string;
  baptismText: string;
  scriptureBook: string;
  scriptureReference: string;
  verseOfWeek: string;
  weeklyMeetingVariant: number | null;
  skipTestimonyWeek: boolean;
  skipDepartmentReports: boolean;
  /** 不显示的分区 id */
  hiddenSections: string[];
  outputBlobId: string | null;
  servicePlaylistId: string | null;
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
  birthdayMonth: string;
  birthdayNames: string;
  showPreServiceChairName: boolean;
  preServiceChairNames: string;
  staffMeetingDate: string;
  testimonyShareDate: string;
  serviceRosterText: string;
  baptismText: string;
  scriptureBook: string;
  scriptureReference: string;
  verseOfWeek: string;
  weeklyMeetingVariant: number | null;
  skipTestimonyWeek: boolean;
  skipDepartmentReports: boolean;
  hiddenSections: string[];
  outputBlobId: string | null;
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
  hiddenSections?: string[];
  weeklyMeetingVariant?: number | null;
};

export async function fetchBulletinSlidePreviewPng(
  slideNumber: number,
  params: BulletinSlidePreviewParams,
): Promise<Blob> {
  const qs = new URLSearchParams();
  if (params.serviceDate) qs.set('serviceDate', params.serviceDate);
  if (params.serviceTime) qs.set('serviceTime', params.serviceTime);
  if (params.scriptureBook) qs.set('scriptureBook', params.scriptureBook);
  if (params.scriptureReference) qs.set('scriptureReference', params.scriptureReference);
  if (params.showPreServiceChairName) qs.set('showPreServiceChairName', '1');
  if (params.preServiceChairNames) qs.set('preServiceChairNames', params.preServiceChairNames);
  if (params.hiddenSections?.length) qs.set('hiddenSections', params.hiddenSections.join(','));
  if (params.weeklyMeetingVariant != null) {
    qs.set('weeklyMeetingVariant', String(params.weeklyMeetingVariant));
  }
  const query = qs.toString();
  const path = `/v1/bulletins/template/slides/${slideNumber}/preview.png${query ? `?${query}` : ''}`;

  const maxAttempts = 3;
  let lastError = 'slide_preview_unavailable';
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await runBulletinPreviewTask(() => apiFetch(path));
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
};

export async function ensureBulletinWorshipPlaylist(bulletinId: string): Promise<WorshipPlaylistInvite> {
  const res = await apiFetch(`/v1/bulletins/${encodeURIComponent(bulletinId)}/worship-playlist`, {
    method: 'POST',
  });
  return parseJson<WorshipPlaylistInvite>(res);
}

export async function inviteBulletinWorshipLeader(
  bulletinId: string,
  body: { email?: string; message?: string },
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
