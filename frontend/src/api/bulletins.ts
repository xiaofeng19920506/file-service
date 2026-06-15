import { apiFetch, parseJson } from './http';

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
