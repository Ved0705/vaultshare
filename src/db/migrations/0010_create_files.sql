CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"mime_type" varchar(255) NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" varchar(100) NOT NULL,
	"encrypted_dek" text NOT NULL,
	"encryption_nonce" varchar(64) NOT NULL,
	"encryption_tag" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "files_size_positive_check" CHECK ("files"."size_bytes" > 0),
	CONSTRAINT "files_status_check" CHECK ("files"."status" IN ('ACTIVE', 'DELETED'))
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_vault_id_idx" ON "files" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "files_status_idx" ON "files" USING btree ("status");