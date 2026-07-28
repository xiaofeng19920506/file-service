import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { updateBulletin, type WeeklyBulletin } from '../api/bulletins';
import {
  BULLETIN_LOCAL_SYNC_KEYS,
  fieldToSectionId,
  localDraftToPatch,
  markLocalBulletinDraftClean,
  mergeLocalDraftIntoBulletin,
  purgeExpiredLocalBulletinDrafts,
  readLocalBulletinDraft,
  writeLocalBulletinDraft,
  type BulletinLocalSyncKey,
} from '../lib/bulletin-local-draft';
import { sectionPptxOverridesKey } from '../lib/bulletin-preview-patch';

type Options = {
  canPersistRemote: boolean;
  onSectionBusyChange?: (sectionId: string | null) => void;
  onPersistingChange?: (busy: boolean) => void;
  /** 外部 Save/Publish 进行中时跳过自动 PATCH，避免双通道互踩 */
  externalSavingRef?: { current: boolean };
};

function valueFingerprint(key: BulletinLocalSyncKey, draft: WeeklyBulletin): string {
  if (key === 'sectionPptxOverrides') {
    return sectionPptxOverridesKey(draft.sectionPptxOverrides);
  }
  if (key === 'hiddenSections') {
    return (draft.hiddenSections ?? []).slice().sort().join(',');
  }
  return JSON.stringify(draft[key] ?? null);
}

export function fingerprintOf(draft: WeeklyBulletin): string {
  return BULLETIN_LOCAL_SYNC_KEYS.map((k) => `${k}=${valueFingerprint(k, draft)}`).join('\u0001');
}

function pickSyncFields(draft: WeeklyBulletin): Partial<Pick<WeeklyBulletin, BulletinLocalSyncKey>> {
  const fields: Partial<Pick<WeeklyBulletin, BulletinLocalSyncKey>> = {};
  for (const key of BULLETIN_LOCAL_SYNC_KEYS) {
    fields[key] = draft[key] as never;
  }
  return fields;
}

/** 对比指纹，返回真正变更字段对应的分区；无法归因时返回 null（勿回落 scripture） */
export function detectBusySection(prevFp: string | null, next: WeeklyBulletin): string | null {
  if (!prevFp) {
    // hydrate 后首次脏：按本地草稿里实际有的字段归因
    const local = readLocalBulletinDraft(next.id);
    if (local?.dirty && local.fields) {
      for (const key of BULLETIN_LOCAL_SYNC_KEYS) {
        if (key in local.fields && local.fields[key] !== undefined) {
          const section = fieldToSectionId(key);
          if (section) return section;
        }
      }
    }
    return null;
  }
  const prevMap = new Map(
    prevFp.split('\u0001').map((part) => {
      const eq = part.indexOf('=');
      return [part.slice(0, eq), part.slice(eq + 1)] as const;
    }),
  );
  for (const key of BULLETIN_LOCAL_SYNC_KEYS) {
    const now = valueFingerprint(key, next);
    if (prevMap.get(key) !== now) {
      return fieldToSectionId(key);
    }
  }
  return null;
}

/**
 * 改字段立刻写 localStorage；防抖后系统自行 PATCH 后端。
 * 打开周报时合并本地未同步草稿。过期响应按请求指纹丢弃。
 */
export function useBulletinLocalDraftSync(
  draft: WeeklyBulletin | null,
  setDraft: Dispatch<SetStateAction<WeeklyBulletin | null>>,
  { canPersistRemote, onSectionBusyChange, onPersistingChange, externalSavingRef }: Options,
) {
  const hydratedForRef = useRef<string | null>(null);
  const lastSyncedFpRef = useRef<string | null>(null);
  const draftRef = useRef(draft);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightFpRef = useRef<string | null>(null);
  const onSectionBusyChangeRef = useRef(onSectionBusyChange);
  const onPersistingChangeRef = useRef(onPersistingChange);
  draftRef.current = draft;
  onSectionBusyChangeRef.current = onSectionBusyChange;
  onPersistingChangeRef.current = onPersistingChange;

  useEffect(() => {
    purgeExpiredLocalBulletinDrafts();
  }, []);

  // 切换周报时合并 localStorage（只跑一次 / id）
  useEffect(() => {
    if (!draft?.id) {
      hydratedForRef.current = null;
      return;
    }
    if (hydratedForRef.current === draft.id) return;
    hydratedForRef.current = draft.id;

    const local = readLocalBulletinDraft(draft.id);
    const merged = mergeLocalDraftIntoBulletin(draft, local);
    if (local?.dirty) {
      lastSyncedFpRef.current = null;
    } else {
      lastSyncedFpRef.current = fingerprintOf(merged);
    }
    if (merged !== draft) {
      setDraft(merged);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在切换 bulletin id 时 hydrate
  }, [draft?.id]);

  useEffect(() => {
    if (!draft?.id) return;
    if (hydratedForRef.current !== draft.id) return;

    const fields = pickSyncFields(draft);
    writeLocalBulletinDraft(draft.id, fields, {
      remoteUpdatedAt: draft.updatedAt,
      dirty: true,
    });

    const fp = fingerprintOf(draft);
    if (lastSyncedFpRef.current === fp) {
      markLocalBulletinDraftClean(draft.id, draft.updatedAt);
      return;
    }
    // 已有同指纹的 PATCH 在飞，等它结束即可
    if (inFlightFpRef.current === fp) return;

    const busySection = detectBusySection(lastSyncedFpRef.current, draft);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (externalSavingRef?.current) {
        // 手动 Save/Publish 锁住时延后；保持 dirty，下次编辑或解锁后再试
        return;
      }
      if (!canPersistRemote) {
        lastSyncedFpRef.current = fp;
        markLocalBulletinDraftClean(draft.id, draft.updatedAt);
        return;
      }

      const latest = draftRef.current;
      if (!latest || latest.id !== draft.id) return;
      const latestFp = fingerprintOf(latest);
      if (latestFp !== fp) return;

      const patch = localDraftToPatch({
        bulletinId: latest.id,
        savedAt: new Date().toISOString(),
        remoteUpdatedAt: latest.updatedAt,
        fields: pickSyncFields(latest),
        dirty: true,
      });
      if (!Object.keys(patch).length) {
        lastSyncedFpRef.current = fp;
        return;
      }

      const requestFp = fp;
      inFlightFpRef.current = requestFp;
      onSectionBusyChangeRef.current?.(busySection);
      onPersistingChangeRef.current?.(true);

      void updateBulletin(latest.id, patch)
        .then((updated) => {
          const current = draftRef.current;
          if (!current || current.id !== updated.id) return;
          const currentFp = fingerprintOf(current);
          // 过期响应：本地又改了，丢弃回写，保留 dirty 等下一轮
          if (currentFp !== requestFp) return;

          const synced = { ...current, ...pickSyncFields(updated), updatedAt: updated.updatedAt };
          lastSyncedFpRef.current = fingerprintOf(synced);
          markLocalBulletinDraftClean(updated.id, updated.updatedAt);
          setDraft((prev) =>
            prev && prev.id === updated.id
              ? { ...prev, updatedAt: updated.updatedAt, ...pickSyncFields(updated) }
              : prev,
          );
        })
        .catch(() => {
          /* 保留 dirty，下次编辑会再试 */
        })
        .finally(() => {
          if (inFlightFpRef.current === requestFp) {
            inFlightFpRef.current = null;
          }
          onPersistingChangeRef.current?.(false);
          onSectionBusyChangeRef.current?.(null);
        });
    }, 650);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    canPersistRemote,
    setDraft,
    externalSavingRef,
    draft?.id,
    draft?.serviceDate,
    draft?.serviceTime,
    draft?.scriptureBook,
    draft?.scriptureReference,
    draft?.showPreServiceChairName,
    draft?.preServiceChairNames,
    draft?.birthdayMonth,
    draft?.birthdayNames,
    draft?.verseOfWeek,
    draft?.lastWeekOfferingDate,
    draft?.offeringTitheAmount,
    draft?.offeringOtherAmount,
    draft?.baptismText,
    draft?.staffMeetingDate,
    draft?.testimonyShareDate,
    draft?.serviceRosterText,
    draft?.weeklyMeetingVariant,
    draft?.hiddenSections,
    draft?.sectionPptxOverrides,
    draft?.updatedAt,
  ]);
}
