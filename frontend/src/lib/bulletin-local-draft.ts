import type { BulletinPatch, WeeklyBulletin } from '../api/bulletins';

const STORAGE_PREFIX = 'bulletin-local-draft:';
const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 可进 localStorage、并防抖同步到后端的字段 */
export const BULLETIN_LOCAL_SYNC_KEYS = [
  'serviceDate',
  'serviceTime',
  'scriptureBook',
  'scriptureReference',
  'showPreServiceChairName',
  'preServiceChairNames',
  'birthdayMonth',
  'birthdayNames',
  'verseOfWeek',
  'lastWeekOfferingDate',
  'offeringTitheAmount',
  'offeringOtherAmount',
  'offeringTotalAmount',
  'baptismText',
  'staffMeetingDate',
  'testimonyShareDate',
  'serviceRosterText',
  'weeklyMeetingVariant',
  'hiddenSections',
  'sectionPptxOverrides',
] as const satisfies ReadonlyArray<keyof BulletinPatch>;

export type BulletinLocalSyncKey = (typeof BULLETIN_LOCAL_SYNC_KEYS)[number];

export type BulletinLocalDraft = {
  bulletinId: string;
  /** 本地最后写入时间 */
  savedAt: string;
  /** 写入时对应的远端 updatedAt（若有） */
  remoteUpdatedAt: string | null;
  fields: Partial<Pick<WeeklyBulletin, BulletinLocalSyncKey>>;
  dirty: boolean;
};

function storageKey(bulletinId: string): string {
  return `${STORAGE_PREFIX}${bulletinId}`;
}

export function fieldToSectionId(key: BulletinLocalSyncKey | string): string | null {
  switch (key) {
    case 'serviceDate':
    case 'serviceTime':
      return 'cover';
    case 'scriptureBook':
    case 'scriptureReference':
      return 'scripture';
    case 'showPreServiceChairName':
    case 'preServiceChairNames':
      return 'pre_service';
    case 'birthdayMonth':
    case 'birthdayNames':
      return 'birthday';
    case 'verseOfWeek':
      return 'verse_of_week';
    case 'lastWeekOfferingDate':
    case 'offeringTitheAmount':
    case 'offeringOtherAmount':
      return 'offering';
    case 'baptismText':
      return 'announcements';
    case 'staffMeetingDate':
    case 'testimonyShareDate':
    case 'serviceRosterText':
    case 'weeklyMeetingVariant':
    case 'hiddenSections':
      return 'more';
    case 'sectionPptxOverrides':
      return null;
    default:
      return null;
  }
}

export function readLocalBulletinDraft(bulletinId: string): BulletinLocalDraft | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(bulletinId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BulletinLocalDraft;
    const savedAt = Date.parse(parsed.savedAt);
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(storageKey(bulletinId));
      return null;
    }
    if (parsed.bulletinId !== bulletinId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isLocalBulletinDraftDirty(bulletinId: string): boolean {
  return readLocalBulletinDraft(bulletinId)?.dirty === true;
}

export function writeLocalBulletinDraft(
  bulletinId: string,
  fields: Partial<Pick<WeeklyBulletin, BulletinLocalSyncKey>>,
  opts?: { remoteUpdatedAt?: string | null; dirty?: boolean; merge?: boolean },
): BulletinLocalDraft | null {
  if (typeof localStorage === 'undefined') return null;
  const prev = opts?.merge === false ? null : readLocalBulletinDraft(bulletinId);
  const next: BulletinLocalDraft = {
    bulletinId,
    savedAt: new Date().toISOString(),
    remoteUpdatedAt:
      opts?.remoteUpdatedAt !== undefined
        ? opts.remoteUpdatedAt
        : (prev?.remoteUpdatedAt ?? null),
    fields: { ...(prev?.fields ?? {}), ...fields },
    dirty: opts?.dirty ?? true,
  };
  try {
    localStorage.setItem(storageKey(bulletinId), JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

export function markLocalBulletinDraftClean(
  bulletinId: string,
  remoteUpdatedAt: string | null,
): void {
  const prev = readLocalBulletinDraft(bulletinId);
  if (!prev) return;
  writeLocalBulletinDraft(bulletinId, prev.fields, {
    remoteUpdatedAt,
    dirty: false,
    merge: false,
  });
}

/** 把本地未同步字段叠到远端快照上（本地更新更晚才覆盖） */
export function mergeLocalDraftIntoBulletin(
  remote: WeeklyBulletin,
  local: BulletinLocalDraft | null,
): WeeklyBulletin {
  if (!local?.fields || Object.keys(local.fields).length === 0) return remote;
  const localTs = Date.parse(local.savedAt);
  const remoteTs = remote.updatedAt ? Date.parse(remote.updatedAt) : 0;
  // 本地脏数据，或本地保存时间不早于远端，才覆盖
  if (!local.dirty && Number.isFinite(remoteTs) && localTs < remoteTs) return remote;

  const merged: WeeklyBulletin = { ...remote };
  for (const key of BULLETIN_LOCAL_SYNC_KEYS) {
    if (key in local.fields && local.fields[key] !== undefined) {
      (merged as Record<string, unknown>)[key] = local.fields[key];
    }
  }
  return merged;
}

export function localDraftToPatch(local: BulletinLocalDraft): BulletinPatch {
  const patch: BulletinPatch = {};
  for (const key of BULLETIN_LOCAL_SYNC_KEYS) {
    if (key in local.fields && local.fields[key] !== undefined) {
      (patch as Record<string, unknown>)[key] = local.fields[key];
    }
  }
  // 隐藏分区变更时同步布尔别名，避免后端只认 flags 的旧路径
  if (patch.hiddenSections) {
    const hidden = new Set(patch.hiddenSections);
    patch.skipTestimonyWeek = hidden.has('testimony_week');
    patch.skipDepartmentReports = hidden.has('department_reports');
  }
  return patch;
}

export function purgeExpiredLocalBulletinDrafts(): void {
  if (typeof localStorage === 'undefined') return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    const bulletinId = key.slice(STORAGE_PREFIX.length);
    if (!readLocalBulletinDraft(bulletinId)) {
      localStorage.removeItem(key);
    }
  }
}
