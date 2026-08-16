import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

const migrationUrl = new URL(
	'../../../prisma/migrations/20260815220000_cascade_announcement_subscription_deliveries/migration.sql',
	import.meta.url
);

test('deleting an announcement subscription cascades to its deliveries', async () => {
	const database = new Database(':memory:');

	try {
		database.exec(`
			PRAGMA foreign_keys=ON;
			CREATE TABLE "Announcement" (
				"id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
			);
			CREATE TABLE "AnnouncementSubscription" (
				"id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
			);
			CREATE TABLE "AnnouncementDelivery" (
				"id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
				"announcementId" INTEGER NOT NULL,
				"subscriptionId" INTEGER NOT NULL,
				"sentAt" DATETIME,
				"failedAt" DATETIME,
				"error" TEXT,
				"attemptCount" INTEGER NOT NULL DEFAULT 0,
				"nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("announcementId") REFERENCES "Announcement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
				FOREIGN KEY ("subscriptionId") REFERENCES "AnnouncementSubscription" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
			);
			INSERT INTO "Announcement" DEFAULT VALUES;
			INSERT INTO "AnnouncementSubscription" DEFAULT VALUES;
			INSERT INTO "AnnouncementDelivery" ("announcementId", "subscriptionId") VALUES (1, 1);
		`);

		database.exec(await Bun.file(migrationUrl).text());
		database.exec('DELETE FROM "AnnouncementSubscription" WHERE "id" = 1;');

		const delivery = database.query('SELECT "id" FROM "AnnouncementDelivery" WHERE "id" = 1;').get();
		expect(delivery).toBeNull();
	} finally {
		database.close();
	}
});
