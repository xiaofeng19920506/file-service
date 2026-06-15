import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
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

let pdftoppmAvailable: boolean | null = null;

async function isPdftoppmAvailable(): Promise<boolean> {
  if (pdftoppmAvailable !== null) return pdftoppmAvailable;
  try {
    await access('/usr/bin/pdftoppm');
    pdftoppmAvailable = true;
  } catch {
    pdftoppmAvailable = false;
  }
  return pdftoppmAvailable;
}

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

async function convertToPdf(opts: {
  sofficePath: string;
  inputPath: string;
  outDir: string;
}): Promise<string> {
  return convertWithLibreOffice({ ...opts, convertTo: 'pdf' });
}

async function exportSlidePngFromPdf(opts: {
  pdfPath: string;
  outDir: string;
  slideNumber: number;
  outBase: string;
}): Promise<string> {
  const outPrefix = join(opts.outDir, opts.outBase);
  const code = await new Promise<number>((resolve, reject) => {
    const p = spawn(
      'pdftoppm',
      [
        '-f',
        String(opts.slideNumber),
        '-l',
        String(opts.slideNumber),
        '-png',
        '-singlefile',
        opts.pdfPath,
        outPrefix,
      ],
      { stdio: 'ignore' },
    );
    p.on('error', reject);
    p.on('close', (c) => resolve(c ?? 1));
  });
  if (code !== 0) {
    throw new Error(`pdftoppm_failed:${code}`);
  }
  const pngPath = `${outPrefix}.png`;
  try {
    await access(pngPath);
  } catch {
    throw new Error(`slide_png_not_found:${opts.slideNumber}`);
  }
  return pngPath;
}

/** LO 直接转 PNG（仅可靠导出第 1 页） */
async function exportPptxFirstSlidePngDirect(opts: {
  sofficePath: string;
  inputPath: string;
  outDir: string;
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
  const numbered = files.find((name) => name === `${base}.png`) ?? files[0];
  if (!numbered) {
    throw new Error('slide_png_not_found:1');
  }
  return join(opts.outDir, numbered);
}

/** 将 PPTX 指定页导出为 PNG（1-based） */
export async function exportPptxSlidePng(opts: {
  sofficePath: string;
  inputPath: string;
  outDir: string;
  slideNumber: number;
  /** 若已生成 PDF，可复用以避免重复跑 LibreOffice */
  pdfPath?: string;
}): Promise<string> {
  if (opts.slideNumber < 1) {
    throw new Error(`invalid_slide:${opts.slideNumber}`);
  }

  const base = basename(opts.inputPath, extname(opts.inputPath));
  const usePdf = (await isPdftoppmAvailable()) && (opts.slideNumber > 1 || opts.pdfPath);

  if (!usePdf && opts.slideNumber === 1) {
    return exportPptxFirstSlidePngDirect(opts);
  }

  if (!(await isPdftoppmAvailable())) {
    if (opts.slideNumber === 1) {
      return exportPptxFirstSlidePngDirect(opts);
    }
    throw new Error('pdftoppm_required_for_multi_slide');
  }

  const pdfPath =
    opts.pdfPath ??
    (await convertToPdf({
      sofficePath: opts.sofficePath,
      inputPath: opts.inputPath,
      outDir: opts.outDir,
    }));

  return exportSlidePngFromPdf({
    pdfPath,
    outDir: opts.outDir,
    slideNumber: opts.slideNumber,
    outBase: `${base}-slide-${opts.slideNumber}`,
  });
}

/** 将整份 PPTX 转为 PDF（多页预览的前置步骤，可缓存） */
export async function exportPptxToPdf(opts: {
  sofficePath: string;
  inputPath: string;
  outDir: string;
}): Promise<string> {
  return convertToPdf(opts);
}

/** 从已有 PDF 导出指定页 PNG */
export { exportSlidePngFromPdf };
