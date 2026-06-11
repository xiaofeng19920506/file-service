import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
export * from './schema.js';
export function createDb(connectionString) {
    const pool = new Pool({ connectionString });
    return drizzle(pool, { schema });
}
//# sourceMappingURL=index.js.map