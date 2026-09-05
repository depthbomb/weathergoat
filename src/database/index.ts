import 'temporal-polyfill/global';
import { Pool } from 'pg';
import { env } from '@env';
import contractJson from './contract/contract.json';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract/contract';

const connectionString = env.get('DATABASE_URL');
if (!['postgres:', 'postgresql:'].includes(new URL(connectionString).protocol))
	throw new Error('WeatherGoat requires a PostgreSQL DATABASE_URL');

const pool = new Pool({
	connectionString,
	max: 4,
	connectionTimeoutMillis: 5_000,
	idleTimeoutMillis: 30_000,
	options: '-c timezone=UTC -c statement_timeout=30000 -c search_path=public',
});
const client = postgres<Contract>({ contractJson, pg: pool });

let closing: Promise<void> | undefined;
const close = () =>
	(closing ??= (async () => {
		try {
			await client.close();
		} finally {
			await pool.end();
		}
	})());

export const db = {
	...client,
	close,
	[Symbol.asyncDispose]: close,
};
