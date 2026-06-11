import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

function resolveMigrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '../../drizzle'),
    join(process.cwd(), 'packages/shared/drizzle'),
  ];
  for (const folder of candidates) {
    if (existsSync(join(folder, 'meta', '_journal.json'))) return folder;
  }
  throw new Error('Drizzle migrations folder not found');
}

/** 应用 pending 的数据库迁移（幂等，可重复执行） */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: resolveMigrationsFolder() });
  } finally {
    await pool.end();
  }
}
