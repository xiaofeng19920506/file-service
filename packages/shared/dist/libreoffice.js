import { spawn } from 'node:child_process';
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
];
export function needsLibreofficeConversion(ext) {
    const e = ext.toLowerCase().replace(/^\./, '');
    return LIBREOFFICE_PRESENTATION_EXTS.includes(e);
}
export async function convertWithLibreOffice(opts) {
    const code = await new Promise((resolve, reject) => {
        const p = spawn(opts.sofficePath, [
            '--headless',
            '--nologo',
            '--nofirststartwizard',
            '--convert-to',
            opts.convertTo,
            '--outdir',
            opts.outDir,
            opts.inputPath,
        ], { stdio: 'ignore' });
        p.on('error', reject);
        p.on('close', (c) => resolve(c ?? 1));
    });
    if (code !== 0) {
        throw new Error(`LibreOffice conversion failed (exit ${code})`);
    }
    const base = basename(opts.inputPath, extname(opts.inputPath));
    return join(opts.outDir, `${base}.${opts.convertTo}`);
}
export async function convertToPptx(opts) {
    return convertWithLibreOffice({ ...opts, convertTo: 'pptx' });
}
//# sourceMappingURL=libreoffice.js.map