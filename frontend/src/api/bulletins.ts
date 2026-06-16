import { apiFetch, parseJson } from './http';
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
  outputBlobId: string | null;
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
  outputBlobId: string | null;
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

export type BulletinTemplateMap = {
  totalSlides: number;
  templateFile: string;
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
  slide5Chinese: string;
  slide6Chinese: string | null;
  slide6English: string[] | null;
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

/** 服务端用 LibreOffice 从原版 PPT 渲染幻灯片 PNG（已按参数补丁封面/读经等文字） */
export type BulletinSlidePreviewParams = {
  serviceDate?: string;
  serviceTime?: string;
  scriptureBook?: string;
  scriptureReference?: string;
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
  const query = qs.toString();
  const res = await runBulletinPreviewTask(() =>
    apiFetch(
      `/v1/bulletins/template/slides/${slideNumber}/preview.png${query ? `?${query}` : ''}`,
    ),
  );
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
