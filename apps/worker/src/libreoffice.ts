import { spawn } from 'node:child_process';
import { basename, extname, join } from 'node:path';

export function needsLibreofficeConversion(ext: string): boolean {
  const e = ext.toLowerCase().replace(/^\./, '');
  return ['ppt', 'pps', 'pot', 'odp'].includes(e);
}

export async function convertToPptx(opts: {
  sofficePath: string;
  inputPath: string;
  outDir: string;
}): Promise<string> {
  const code = await new Promise<number>((resolve, reject) => {
    const p = spawn(
      opts.sofficePath,
      [
        '--headless',
        '--nologo',
        '--nofirststartwizard',
        '--convert-to',
        'pptx',
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
  return join(opts.outDir, `${base}.pptx`);
}
