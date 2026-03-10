-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FeedbackBan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_FeedbackBan" ("active", "createdAt", "id", "reason", "updatedAt", "userId") SELECT "active", "createdAt", "id", "reason", "updatedAt", "userId" FROM "FeedbackBan";
DROP TABLE "FeedbackBan";
ALTER TABLE "new_FeedbackBan" RENAME TO "FeedbackBan";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
