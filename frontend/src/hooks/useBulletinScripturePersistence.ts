import { useEffect, useRef } from 'react';
import type { WeeklyBulletin } from '../api/bulletins';
import { fetchScripturePreference, saveScripturePreference } from '../api/bulletins';
import {
  purgeExpiredLocalScripturePreferences,
  readLocalScripturePreference,
  writeLocalScripturePreference,
} from '../lib/bulletin-scripture-preference';

type Options = {
  canPersistRemote: boolean;
  onPersistingChange?: (busy: boolean) => void;
};

export function useBulletinScripturePersistence(
  draft: WeeklyBulletin | null,
  patchField: <K extends keyof WeeklyBulletin>(key: K, value: WeeklyBulletin[K]) => void,
  { canPersistRemote, onPersistingChange }: Options,
) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredForRef = useRef<string | null>(null);
  // 记录已入队/已保存的内容指纹：内容没变时绝不重复 PUT。
  // 否则「保存 → 服务端 bump updatedAt → SSE → 重拉 setDraft → 重渲染 → 再保存」会形成死循环。
  const lastQueuedRef = useRef<string | null>(null);
  const onPersistingChangeRef = useRef(onPersistingChange);
  onPersistingChangeRef.current = onPersistingChange;

  useEffect(() => {
    purgeExpiredLocalScripturePreferences();
  }, []);

  useEffect(() => {
    if (!draft?.id) return;
    if (draft.scriptureBook.trim() && draft.scriptureReference.trim()) {
      restoredForRef.current = draft.id;
      return;
    }
    if (restoredForRef.current === draft.id) return;

    let cancelled = false;
    void (async () => {
      const local = readLocalScripturePreference(draft.id);
      let remote: { scriptureBook: string; scriptureReference: string } | null = null;
      if (canPersistRemote) {
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
    canPersistRemote,
    draft?.id,
    draft?.scriptureBook,
    draft?.scriptureReference,
    patchField,
  ]);

  useEffect(() => {
    if (!draft?.id) return;
    const book = draft.scriptureBook.trim();
    const reference = draft.scriptureReference.trim();
    if (!book || !reference) return;

    const fingerprint = `${draft.id}\u0000${book}\u0000${reference}`;
    if (lastQueuedRef.current === fingerprint) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      lastQueuedRef.current = fingerprint;
      writeLocalScripturePreference(draft.id, book, reference);
      if (!canPersistRemote) return;
      onPersistingChangeRef.current?.(true);
      void saveScripturePreference({
        bulletinId: draft.id,
        scriptureBook: book,
        scriptureReference: reference,
      })
        .catch(() => undefined)
        .finally(() => onPersistingChangeRef.current?.(false));
    }, 600);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [canPersistRemote, draft?.id, draft?.scriptureBook, draft?.scriptureReference]);
}
