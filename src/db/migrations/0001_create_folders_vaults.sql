CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vaults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"folder_id" uuid,
	"name" varchar(150) NOT NULL,
	"description" varchar(500),
	"encrypted_content" text NOT NULL,
	"encrypted_dek" text NOT NULL,
	"encryption_nonce" varchar(64) NOT NULL,
	"encryption_tag" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"overall_ttl_seconds" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vaults_status_check" CHECK ("vaults"."status" IN ('ACTIVE', 'EXPIRED', 'REVOKED', 'DESTROYED')),
	CONSTRAINT "vaults_overall_ttl_check" CHECK ("vaults"."overall_ttl_seconds" > 0)
);
--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "folders_owner_id_idx" ON "folders" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "vaults_owner_id_idx" ON "vaults" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "vaults_folder_id_idx" ON "vaults" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "vaults_status_idx" ON "vaults" USING btree ("status");