export type ScriptureReferenceParts = {
  chapter: number;
  startVerse: number;
  endVerse: number;
};

const REFERENCE_RE = /^\s*(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?\s*$/;

export function parseScriptureReference(reference: string): ScriptureReferenceParts | null {
  const match = reference.trim().match(REFERENCE_RE);
  if (!match) return null;
  const chapter = Number(match[1]);
  const startVerse = Number(match[2]);
  const endVerse = match[3] ? Number(match[3]) : startVerse;
  if (!chapter || !startVerse || !endVerse) return null;
  return {
    chapter,
    startVerse: Math.min(startVerse, endVerse),
    endVerse: Math.max(startVerse, endVerse),
  };
}
