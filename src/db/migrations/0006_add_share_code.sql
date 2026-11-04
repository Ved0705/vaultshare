ALTER TABLE "shares" ADD COLUMN "share_code" varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_share_code_unique" UNIQUE("share_code");