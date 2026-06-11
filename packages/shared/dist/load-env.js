import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
/** 从 cwd 向上查找 .env 并加载（不覆盖已有环境变量） */
export function loadEnvFile() {
    if (process.env.DOTENV_LOADED === '1')
        return;
    let dir = process.cwd();
    for (let i = 0; i < 8; i++) {
        const envPath = resolve(dir, '.env');
        if (existsSync(envPath)) {
            config({ path: envPath, override: false });
            process.env.DOTENV_LOADED = '1';
            return;
        }
        const parent = dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
}
//# sourceMappingURL=load-env.js.map