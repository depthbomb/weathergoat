import 'dotenv/config';
import { definePrismaConfig } from 'prisma/config';
import { defineConfig } from '@prisma/orm-postgres/config';

export default definePrismaConfig({
	orm: defineConfig({
		contract: 'prisma/contract.prisma',
		output: 'src/database/contract',
		db: { connection: process.env['MIGRATION_DATABASE_URL'] ?? process.env['DATABASE_URL'] },
		migrations: { dir: 'prisma/v8-migrations' }
	})
});
