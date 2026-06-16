#!/usr/bin/env node
/**
 * 下载和合本（ChiUn）与 NIV 各卷 JSON，写入 shared/data/bible/
 * 运行：node shared/scripts/sync-bible-data.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outZh = join(root, 'data/bible/zh-chiun');
const outEn = join(root, 'data/bible/en-niv');

const CHIUN_URL =
  'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/ChiUn.json';
const NIV_BOOKS_URL = 'https://raw.githubusercontent.com/aruljohn/Bible-niv/main/Books.json';
const NIV_BOOK_URL = (book) =>
  `https://raw.githubusercontent.com/aruljohn/Bible-niv/main/${encodeURIComponent(book)}.json`;

async function main() {
  await mkdir(outZh, { recursive: true });
  await mkdir(outEn, { recursive: true });

  console.log('Fetching ChiUn…');
  const chiun = await fetch(CHIUN_URL).then((r) => {
    if (!r.ok) throw new Error(`ChiUn fetch failed: ${r.status}`);
    return r.json();
  });
  for (const book of chiun.books) {
    const path = join(outZh, `${book.name}.json`);
    await writeFile(path, JSON.stringify(book), 'utf8');
  }
  console.log(`Wrote ${chiun.books.length} Chinese books to ${outZh}`);

  console.log('Fetching NIV…');
  const books = await fetch(NIV_BOOKS_URL).then((r) => r.json());
  for (const book of books) {
    const data = await fetch(NIV_BOOK_URL(book)).then((r) => {
      if (!r.ok) throw new Error(`NIV ${book}: ${r.status}`);
      return r.json();
    });
    const path = join(outEn, `${book}.json`);
    await writeFile(path, JSON.stringify(data), 'utf8');
    process.stdout.write('.');
  }
  console.log(`\nWrote ${books.length} English books to ${outEn}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
