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

/** 输入停止后再 PATCH 后端；过短会导致每个字都打保存 */
export const BULLETIN_AUTOSAVE_DEBOUNCE_MS = 1800;

type Options = {
  canPersistRemote: boolean;
  onSectionBusyChange?: (sectionId: string | null) => void;
  onPersistingChange?: (busy: boolean) => void;
  /** 外部 Save/Publish 进行中时跳过自动 PATCH，避免双通道互踩 */
  externalSavingRef?: { current: boolean };
  /** 测试可覆盖防抖间隔 */
  debounceMs?: number;
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
    // 必须与 fingerprintOf 使用同一套 valueFingerprint（含 sectionPptxOverridesKey），
    // 否则 overrides 会永远对不上，误判为变更并回落到错误分区。
    const now = valueFingerprint(key, next);
    if (prevMap.get(key) !== now) {
      const section = fieldToSectionId(key);
      // sectionPptxOverrides 等无法映射分区：跳过，继续找可归因字段
      if (section) return section;
    }
  }
  return null;
}

/**
 * 改字段立刻写 localStorage；输入停顿 debounceMs 后再 PATCH 后端。
 * 同一时间只允许一个自动保存在飞；结束后若仍有未同步改动再排一次。
 */
export function useBulletinLocalDraftSync(
  draft: WeeklyBulletin | null,
  setDraft: Dispatch<SetStateAction<WeeklyBulletin | null>>,
  {
    canPersistRemote,
    onSectionBusyChange,
    onPersistingChange,
    externalSavingRef,
    debounceMs = BULLETIN_AUTOSAVE_DEBOUNCE_MS,
  }: Options,
) {
  const hydratedForRef = useRef<string | null>(null);
  const lastSyncedFpRef = useRef<string | null>(null);
  const draftRef = useRef(draft);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightFpRef = useRef<string | null>(null);
  /** 飞行中又有输入：结束后补一次 */
  const pendingAfterFlightRef = useRef(false);
  const onSectionBusyChangeRef = useRef(onSectionBusyChange);
  const onPersistingChangeRef = useRef(onPersistingChange);
  const canPersistRemoteRef = useRef(canPersistRemote);
  const debounceMsRef = useRef(debounceMs);
  draftRef.current = draft;
  onSectionBusyChangeRef.current = onSectionBusyChange;
  onPersistingChangeRef.current = onPersistingChange;
  canPersistRemoteRef.current = canPersistRemote;
  debounceMsRef.current = debounceMs;

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
    // 另有请求在飞：标记结束后再存，避免并发 PATCH
    if (inFlightFpRef.current) {
      pendingAfterFlightRef.current = true;
      return;
    }

    const busySection = detectBusySection(lastSyncedFpRef.current, draft);
    const bulletinId = draft.id;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const run = () => {
        if (externalSavingRef?.current) {
          // 手动 Save/Publish 锁住时延后重试
          saveTimerRef.current = setTimeout(run, debounceMsRef.current);
          return;
        }
        if (!canPersistRemoteRef.current) {
          const latestSkip = draftRef.current;
          if (latestSkip && latestSkip.id === bulletinId) {
            const skipFp = fingerprintOf(latestSkip);
            lastSyncedFpRef.current = skipFp;
            markLocalBulletinDraftClean(bulletinId, latestSkip.updatedAt);
          }
          return;
        }

        const latest = draftRef.current;
        if (!latest || latest.id !== bulletinId) return;
        const latestFp = fingerprintOf(latest);
        if (latestFp === lastSyncedFpRef.current) return;
        if (inFlightFpRef.current) {
          pendingAfterFlightRef.current = true;
          return;
        }

        const patch = localDraftToPatch({
          bulletinId: latest.id,
          savedAt: new Date().toISOString(),
          remoteUpdatedAt: latest.updatedAt,
          fields: pickSyncFields(latest),
          dirty: true,
        });
        if (!Object.keys(patch).length) {
          lastSyncedFpRef.current = latestFp;
          return;
        }

        const requestFp = latestFp;
        const sectionForUi = detectBusySection(lastSyncedFpRef.current, latest) ?? busySection;
        inFlightFpRef.current = requestFp;
        onSectionBusyChangeRef.current?.(sectionForUi);
        onPersistingChangeRef.current?.(true);

        void updateBulletin(latest.id, patch)
          .then((updated) => {
            const current = draftRef.current;
            if (!current || current.id !== updated.id) return;
            const currentFp = fingerprintOf(current);
            // 过期响应：本地又改了，丢弃回写，保留 dirty 等下一轮
            if (currentFp !== requestFp) {
              pendingAfterFlightRef.current = true;
              return;
            }

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
            pendingAfterFlightRef.current = true;
          })
          .finally(() => {
            if (inFlightFpRef.current === requestFp) {
              inFlightFpRef.current = null;
            }
            onPersistingChangeRef.current?.(false);
            onSectionBusyChangeRef.current?.(null);

            if (!pendingAfterFlightRef.current) return;
            pendingAfterFlightRef.current = false;
            const again = draftRef.current;
            if (!again || again.id !== bulletinId) return;
            if (fingerprintOf(again) === lastSyncedFpRef.current) return;
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(run, debounceMsRef.current);
          });
      };

      run();
    }, debounceMsRef.current);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    canPersistRemote,
    setDraft,
    externalSavingRef,
    debounceMs,
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
    draft?.staffMeetingYear,
    draft?.staffMeetingMonth,
    draft?.staffMeetingStartTime,
    draft?.staffMeetingEndTime,
    draft?.testimonyShareDate,
    draft?.serviceRosterText,
    draft?.weeklyMeetingVariant,
    draft?.hiddenSections,
    draft?.sectionPptxOverrides,
    draft?.updatedAt,
  ]);
}
