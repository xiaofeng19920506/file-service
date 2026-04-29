import path from "node:path";

export function safeExt(originalName: string): string {
  const ext = path.extname(originalName).slice(0, 16);
  if (!ext) return "";
  if (!/^\.[a-zA-Z0-9._-]+$/.test(ext)) return "";
  return ext;
}
