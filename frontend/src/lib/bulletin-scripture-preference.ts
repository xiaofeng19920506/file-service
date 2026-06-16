const STORAGE_PREFIX = 'bulletin-scripture-pref:';
const SCRIPTURE_PREFERENCE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type StoredScripturePreference = {
  bulletinId: string;
  scriptureBook: string;
  scriptureReference: string;
  savedAt: string;
};

function storageKey(bulletinId: string): string {
  return `${STORAGE_PREFIX}${bulletinId}`;
}

export function readLocalScripturePreference(
  bulletinId: string,
): Pick<StoredScripturePreference, 'scriptureBook' | 'scriptureReference'> | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(bulletinId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredScripturePreference;
    const savedAt = Date.parse(parsed.savedAt);
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > SCRIPTURE_PREFERENCE_TTL_MS) {
      localStorage.removeItem(storageKey(bulletinId));
      return null;
    }
    if (!parsed.scriptureBook?.trim() && !parsed.scriptureReference?.trim()) return null;
    return {
      scriptureBook: parsed.scriptureBook ?? '',
      scriptureReference: parsed.scriptureReference ?? '',
    };
  } catch {
    return null;
  }
}

export function writeLocalScripturePreference(
  bulletinId: string,
  scriptureBook: string,
  scriptureReference: string,
): void {
  if (typeof localStorage === 'undefined') return;
  const payload: StoredScripturePreference = {
    bulletinId,
    scriptureBook,
    scriptureReference,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(storageKey(bulletinId), JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function purgeExpiredLocalScripturePreferences(): void {
  if (typeof localStorage === 'undefined') return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    const bulletinId = key.slice(STORAGE_PREFIX.length);
    if (!readLocalScripturePreference(bulletinId)) {
      localStorage.removeItem(key);
    }
  }
}
