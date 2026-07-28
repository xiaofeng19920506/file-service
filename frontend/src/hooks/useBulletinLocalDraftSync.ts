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
};

function fingerprintOf(draft: WeeklyBulletin): string {
  return BULLETIN_LOCAL_SYNC_KEYS.map((k) => {
    const value =
      k === 'sectionPptxOverrides'
        ? sectionPptxOverridesKey(draft.sectionPptxOverrides)
        : JSON.stringify(draft[k] ?? null);
    return `${k}=${value}`;
  }).join('\u0001');
}

function pickSyncFields(draft: WeeklyBulletin): Partial<Pick<WeeklyBulletin, BulletinLocalSyncKey>> {
  const fields: Partial<Pick<WeeklyBulletin, BulletinLocalSyncKey>> = {};
  for (const key of BULLETIN_LOCAL_SYNC_KEYS) {
    fields[key] = draft[key] as never;
  }
  return fields;
}

function detectBusySection(prevFp: string | null, next: WeeklyBulletin): string {
  if (!prevFp) return 'scripture';
  const prevMap = new Map(
    prevFp.split('\u0001').map((part) => {
      const eq = part.indexOf('=');
      return [part.slice(0, eq), part.slice(eq + 1)] as const;
    }),
  );
  for (const key of BULLETIN_LOCAL_SYNC_KEYS) {
    const now = JSON.stringify(next[key] ?? null);
    if (prevMap.get(key) !== now) {
      return fieldToSectionId(key) ?? 'scripture';
    }
  }
  return 'scripture';
}

/**
 * 改字段立刻写 localStorage；防抖后系统自行 PATCH 后端。
 * 打开周报时合并本地未同步草稿。
 */
export function useBulletinLocalDraftSync(
  draft: WeeklyBulletin | null,
  setDraft: Dispatch<SetStateAction<WeeklyBulletin | null>>,
  { canPersistRemote, onSectionBusyChange, onPersistingChange }: Options,
) {
  const hydratedForRef = useRef<string | null>(null);
  const lastSyncedFpRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSectionBusyChangeRef = useRef(onSectionBusyChange);
  const onPersistingChangeRef = useRef(onPersistingChange);
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
    if (lastSyncedFpRef.current === fp) return;

    const busySection = detectBusySection(lastSyncedFpRef.current, draft);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      // 再次确认仍是最新指纹
      if (!canPersistRemote) {
        lastSyncedFpRef.current = fp;
        markLocalBulletinDraftClean(draft.id, draft.updatedAt);
        return;
      }

      const patch = localDraftToPatch({
        bulletinId: draft.id,
        savedAt: new Date().toISOString(),
        remoteUpdatedAt: draft.updatedAt,
        fields,
        dirty: true,
      });
      if (!Object.keys(patch).length) {
        lastSyncedFpRef.current = fp;
        return;
      }

      onSectionBusyChangeRef.current?.(busySection);
      onPersistingChangeRef.current?.(true);

      void updateBulletin(draft.id, patch)
        .then((updated) => {
          const synced = { ...draft, ...pickSyncFields(updated), updatedAt: updated.updatedAt };
          lastSyncedFpRef.current = fingerprintOf(synced);
          markLocalBulletinDraftClean(draft.id, updated.updatedAt);
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
    draft?.id,
    draft?.serviceTime,
    draft?.scriptureBook,
    draft?.scriptureReference,
    draft?.showPreServiceChairName,
    draft?.preServiceChairNames,
    draft?.birthdayMonth,
    draft?.birthdayNames,
    draft?.verseOfWeek,
    draft?.lastWeekOfferingDate,
    draft?.offeringQuarterLabel,
    draft?.baptismText,
    draft?.staffMeetingDate,
    draft?.testimonyShareDate,
    draft?.serviceRosterText,
    draft?.weeklyMeetingVariant,
    draft?.sectionPptxOverrides,
    draft?.updatedAt,
  ]);
}
