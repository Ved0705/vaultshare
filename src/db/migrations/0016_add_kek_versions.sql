ALTER TABLE "vaults" ADD COLUMN "kek_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "write_requests" ADD COLUMN "kek_version" integer NOT NULL DEFAULT 1;
