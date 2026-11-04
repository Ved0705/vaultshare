CREATE TABLE "vault_lineage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_vault_id" uuid NOT NULL,
	"derived_vault_id" uuid NOT NULL,
	"write_request_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vault_lineage_derived_vault_unique" UNIQUE("derived_vault_id"),
	CONSTRAINT "vault_lineage_write_request_unique" UNIQUE("write_request_id")
);
--> statement-breakpoint
ALTER TABLE "vault_lineage" ADD CONSTRAINT "vault_lineage_source_vault_id_vaults_id_fk" FOREIGN KEY ("source_vault_id") REFERENCES "public"."vaults"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_lineage" ADD CONSTRAINT "vault_lineage_derived_vault_id_vaults_id_fk" FOREIGN KEY ("derived_vault_id") REFERENCES "public"."vaults"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_lineage" ADD CONSTRAINT "vault_lineage_write_request_id_write_requests_id_fk" FOREIGN KEY ("write_request_id") REFERENCES "public"."write_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_lineage" ADD CONSTRAINT "vault_lineage_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vault_lineage_source_vault_idx" ON "vault_lineage" USING btree ("source_vault_id");