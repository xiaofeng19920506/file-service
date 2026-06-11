import { Pool } from 'pg';
import * as schema from './schema.js';
export * from './schema.js';
export declare function createDb(connectionString: string): import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema> & {
    $client: Pool;
};
export type Db = ReturnType<typeof createDb>;
//# sourceMappingURL=index.d.ts.map