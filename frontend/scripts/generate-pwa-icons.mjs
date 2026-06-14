import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = path.join(root, 'public/icons/icon.svg');
const outDir = path.join(root, 'public/icons');

const svg = await readFile(svgPath);

await mkdir(outDir, { recursive: true });

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon-32.png', size: 32 },
];

for (const { name, size } of sizes) {
  const png = await sharp(svg).resize(size, size).png().toBuffer();
  await writeFile(path.join(outDir, name), png);
  console.log(`wrote ${name}`);
}

console.log('done');
