import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const LIBREOFFICE_PRESENTATION_EXTS = [
  'ppt',
  'pps',
  'pot',
  'odp',
  'ppsx',
  'potx',
  'fodp',
  'otp',
] as const;

export function needsLibreofficeConversion(ext: string): boolean {
  const e = ext.toLowerCase().replace(/^\./, '');
  return (LIBREOFFICE_PRESENTATION_EXTS as readonly string[]).includes(e);
}

export async function convertWithLibreOffice(opts: {
  sofficePath: string;
  inputPath: string;
  outDir: string;
  convertTo: string;
}): Promise<string> {
  const code = await new Promise<number>((resolve, reject) => {
    const p = spawn(
      opts.sofficePath,
      [
        '--headless',
        '--nologo',
        '--nofirststartwizard',
        '--convert-to',
        opts.convertTo,
        '--outdir',
        opts.outDir,
        opts.inputPath,
      ],
      { stdio: 'ignore' },
    );
    p.on('error', reject);
    p.on('close', (c) => resolve(c ?? 1));
  });
  if (code !== 0) {
    throw new Error(`LibreOffice conversion failed (exit ${code})`);
  }
  const base = basename(opts.inputPath, extname(opts.inputPath));
  return join(opts.outDir, `${base}.${opts.convertTo}`);
}

export async function convertToPptx(opts: {
  sofficePath: string;
  inputPath: string;
  outDir: string;
}): Promise<string> {
  return convertWithLibreOffice({ ...opts, convertTo: 'pptx' });
}

/** 将 PPTX 各页导出为 PNG，按页码 1-based 返回对应文件路径 */
export async function exportPptxSlidePng(opts: {
  sofficePath: string;
  inputPath: string;
  outDir: string;
  slideNumber: number;
}): Promise<string> {
  await convertWithLibreOffice({
    sofficePath: opts.sofficePath,
    inputPath: opts.inputPath,
    outDir: opts.outDir,
    convertTo: 'png',
  });

  const base = basename(opts.inputPath, extname(opts.inputPath));
  const files = (await readdir(opts.outDir))
    .filter((name) => name.toLowerCase().endsWith('.png'))
    .sort();

  const slideIdx = opts.slideNumber - 1;
  const numbered =
    files.find((name) => name === `${base}.png` && slideIdx === 0) ??
    files.find((name) => new RegExp(`^${base}[-_]?0*${opts.slideNumber}\\.png$`, 'i').test(name)) ??
    files[slideIdx];

  if (!numbered) {
    throw new Error(`slide_png_not_found:${opts.slideNumber}`);
  }
  return join(opts.outDir, numbered);
}
