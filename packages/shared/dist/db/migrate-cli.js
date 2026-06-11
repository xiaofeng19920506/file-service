import { loadEnvFile } from '../load-env.js';
import { runMigrations } from './migrate.js';
loadEnvFile();
const url = process.env.DATABASE_URL;
if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
}
try {
    await runMigrations(url);
    console.log('Database migrations applied.');
}
catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
}
//# sourceMappingURL=migrate-cli.js.map