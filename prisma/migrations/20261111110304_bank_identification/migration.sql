-- CreateTable
CREATE TABLE "Identification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "state_hash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "subject" TEXT,
    "next" TEXT NOT NULL,
    "started_by" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "completed_at" TEXT,
    "identity_hash" TEXT,
    "person_name" TEXT,
    "method" TEXT,
    "transaction_id" TEXT,
    "used_at" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "identity_hash" TEXT,
    "role" TEXT NOT NULL,
    "customer_id" TEXT,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Account_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("created_at", "customer_id", "email", "failed_attempts", "id", "locked_until", "password_hash", "role", "updated_at") SELECT "created_at", "customer_id", "email", "failed_attempts", "id", "locked_until", "password_hash", "role", "updated_at" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");
CREATE UNIQUE INDEX "Account_identity_hash_key" ON "Account"("identity_hash");
CREATE UNIQUE INDEX "Account_customer_id_key" ON "Account"("customer_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Identification_state_hash_key" ON "Identification"("state_hash");
