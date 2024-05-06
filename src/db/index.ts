import * as schema from '@db/schemas';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { DRIZZLE_DIR, DATABASE_PATH } from '@constants';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

export const sqlite = new Database(DATABASE_PATH);
export const db     = drizzle(sqlite, { schema });

export function runMigrations() {
	migrate(db, { migrationsFolder: DRIZZLE_DIR });
	sqlite.close();
}
