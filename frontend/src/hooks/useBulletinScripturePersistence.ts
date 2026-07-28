import { useEffect, useRef } from 'react';
import type { WeeklyBulletin } from '../api/bulletins';
import { fetchScripturePreference } from '../api/bulletins';
import {
  purgeExpiredLocalScripturePreferences,
  readLocalScripturePreference,
  writeLocalScripturePreference,
} from '../lib/bulletin-scripture-preference';

type Options = {
  canFetchRemote: boolean;
};

/**
 * 仅负责「空经文时从 local / preference API 恢复」。
 * 持久化改由 useBulletinLocalDraftSync 统一：localStorage → 防抖 PATCH。
 */
export function useBulletinScripturePersistence(
  draft: WeeklyBulletin | null,
  patchField: <K extends keyof WeeklyBulletin>(key: K, value: WeeklyBulletin[K]) => void,
  { canFetchRemote }: Options,
) {
  const restoredForRef = useRef<string | null>(null);

  useEffect(() => {
    purgeExpiredLocalScripturePreferences();
  }, []);

  useEffect(() => {
    if (!draft?.id) return;
    if (draft.scriptureBook.trim() && draft.scriptureReference.trim()) {
      restoredForRef.current = draft.id;
      writeLocalScripturePreference(draft.id, draft.scriptureBook, draft.scriptureReference);
      return;
    }
    if (restoredForRef.current === draft.id) return;

    let cancelled = false;
    void (async () => {
      const local = readLocalScripturePreference(draft.id);
      let remote: { scriptureBook: string; scriptureReference: string } | null = null;
      if (canFetchRemote) {
        try {
          const pref = await fetchScripturePreference(draft.id);
          if (pref) {
            remote = {
              scriptureBook: pref.scriptureBook,
              scriptureReference: pref.scriptureReference,
            };
          }
        } catch {
          // fall back to local
        }
      }
      if (cancelled) return;
      const pick = remote ?? local;
      if (!pick?.scriptureBook?.trim() || !pick.scriptureReference?.trim()) return;
      restoredForRef.current = draft.id;
      patchField('scriptureBook', pick.scriptureBook);
      patchField('scriptureReference', pick.scriptureReference);
      writeLocalScripturePreference(draft.id, pick.scriptureBook, pick.scriptureReference);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    canFetchRemote,
    draft?.id,
    draft?.scriptureBook,
    draft?.scriptureReference,
    patchField,
  ]);
}
