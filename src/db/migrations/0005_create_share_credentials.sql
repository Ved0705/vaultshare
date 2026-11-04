CREATE TABLE "share_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"passphrase_hash" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_credentials_share_id_unique" UNIQUE("share_id")
);
--> statement-breakpoint
ALTER TABLE "share_credentials" ADD CONSTRAINT "share_credentials_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_credentials_share_id_idx" ON "share_credentials" USING btree ("share_id");