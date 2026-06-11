import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
function resolveSafePath(rootDir, key) {
    const root = resolve(rootDir);
    if (key.includes('..') || key.startsWith('/') || key.startsWith('\\')) {
        throw new Error('invalid storage key');
    }
    const candidate = normalize(join(root, key));
    const prefix = root.endsWith(sep) ? root : root + sep;
    if (candidate !== root && !candidate.startsWith(prefix)) {
        throw new Error('invalid storage key');
    }
    return candidate;
}
export class FsObjectStorage {
    rootDir;
    constructor(rootDir) {
        this.rootDir = rootDir;
    }
    async ensureReady() {
        await mkdir(resolve(this.rootDir), { recursive: true });
    }
    async exists(key) {
        try {
            const p = resolveSafePath(this.rootDir, key);
            const s = await stat(p);
            return s.isFile();
        }
        catch {
            return false;
        }
    }
    async putObject(key, body, _contentType) {
        const p = resolveSafePath(this.rootDir, key);
        await mkdir(dirname(p), { recursive: true });
        await writeFile(p, body);
    }
    async createReadStream(key) {
        const p = resolveSafePath(this.rootDir, key);
        return createReadStream(p);
    }
    async copyToFile(key, destPath) {
        const src = resolveSafePath(this.rootDir, key);
        await mkdir(dirname(destPath), { recursive: true });
        await pipeline(createReadStream(src), createWriteStream(destPath));
    }
    async deleteObject(key) {
        try {
            const p = resolveSafePath(this.rootDir, key);
            await unlink(p);
        }
        catch {
            // ignore missing file
        }
    }
}
//# sourceMappingURL=fs-storage.js.map