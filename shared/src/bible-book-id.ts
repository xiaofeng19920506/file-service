/** 从「中文名 English」书卷标签解析英文书名（用于圣经 JSON 文件名） */
const ENGLISH_ALIASES: Record<string, string> = {
  'Song of Songs': 'Song of Solomon',
};

const NIV_FILE_ALIASES: Record<string, string> = {
  'Song of Solomon': 'Song Of Solomon',
};

export function englishBookNameFromLabel(bookLabel: string): string {
  const space = bookLabel.indexOf(' ');
  if (space < 0) return bookLabel.trim();
  const english = bookLabel.slice(space + 1).trim();
  return ENGLISH_ALIASES[english] ?? english;
}

export function nivBookFileName(englishBook: string): string {
  return NIV_FILE_ALIASES[englishBook] ?? englishBook;
}
