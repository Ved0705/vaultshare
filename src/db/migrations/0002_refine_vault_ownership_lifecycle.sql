ALTER TABLE "vaults" DROP CONSTRAINT "vaults_folder_id_folders_id_fk";
--> statement-breakpoint
ALTER TABLE "vaults" ADD COLUMN "first_shared_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "vaults" ADD COLUMN "expiry_policy" varchar(20) DEFAULT 'DESTROY' NOT NULL;
--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_id_owner_id_unique" UNIQUE("id","owner_id");
--> statement-breakpoint
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_folder_id_owner_id_folders_id_owner_id_fk" FOREIGN KEY ("folder_id","owner_id") REFERENCES "public"."folders"("id","owner_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_expiry_policy_check" CHECK ("vaults"."expiry_policy" IN ('DESTROY', 'REVOKE_ACCESS'));