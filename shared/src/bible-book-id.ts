/** 从「中文名 English」书卷标签解析英文书名（用于圣经 JSON 文件名） */
const ENGLISH_ALIASES: Record<string, string> = {
  'Song of Songs': 'Song of Solomon',
};

const NIV_FILE_ALIASES: Record<string, string> = {
  'Song of Solomon': 'Song Of Solomon',
};

/** scrollmapper ChiUn 使用罗马数字卷名 */
const CHIUN_FILE_ALIASES: Record<string, string> = {
  '1 Chronicles': 'I Chronicles',
  '2 Chronicles': 'II Chronicles',
  '1 Corinthians': 'I Corinthians',
  '2 Corinthians': 'II Corinthians',
  '1 John': 'I John',
  '2 John': 'II John',
  '3 John': 'III John',
  '1 Kings': 'I Kings',
  '2 Kings': 'II Kings',
  '1 Peter': 'I Peter',
  '2 Peter': 'II Peter',
  '1 Samuel': 'I Samuel',
  '2 Samuel': 'II Samuel',
  '1 Thessalonians': 'I Thessalonians',
  '2 Thessalonians': 'II Thessalonians',
  '1 Timothy': 'I Timothy',
  '2 Timothy': 'II Timothy',
  Revelation: 'Revelation of John',
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

export function chiunBookFileName(englishBook: string): string {
  return CHIUN_FILE_ALIASES[englishBook] ?? englishBook;
}
