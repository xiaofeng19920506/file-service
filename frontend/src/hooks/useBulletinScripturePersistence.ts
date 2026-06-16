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
};

export function useBulletinScripturePersistence(
  draft: WeeklyBulletin | null,
  patchField: <K extends keyof WeeklyBulletin>(key: K, value: WeeklyBulletin[K]) => void,
  { canPersistRemote }: Options,
) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredForRef = useRef<string | null>(null);

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

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      writeLocalScripturePreference(draft.id, book, reference);
      if (!canPersistRemote) return;
      void saveScripturePreference({
        bulletinId: draft.id,
        scriptureBook: book,
        scriptureReference: reference,
      }).catch(() => undefined);
    }, 600);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [canPersistRemote, draft?.id, draft?.scriptureBook, draft?.scriptureReference]);
}
