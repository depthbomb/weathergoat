import { DATABASE_PATH } from '@constants';
import type { Config } from 'drizzle-kit';

export default {
	schema: './src/db/schemas',
	dbCredentials: {
		url: DATABASE_PATH,
	},
	out: './drizzle',
} satisfies Config;
