CREATE TABLE "write_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"source_vault_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"encrypted_content" text NOT NULL,
	"encrypted_dek" text NOT NULL,
	"encryption_nonce" varchar(64) NOT NULL,
	"encryption_tag" varchar(64) NOT NULL,
	"derived_vault_id" uuid,
	"reviewed_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "write_requests_share_id_unique" UNIQUE("share_id"),
	CONSTRAINT "write_requests_status_check" CHECK ("write_requests"."status" IN ('PENDING', 'APPROVED', 'REJECTED')),
	CONSTRAINT "write_requests_review_consistency_check" CHECK ((
                ("write_requests"."status" = 'PENDING' AND "write_requests"."reviewed_at" IS NULL AND "write_requests"."reviewed_by" IS NULL AND "write_requests"."derived_vault_id" IS NULL)
                OR
                ("write_requests"."status" = 'APPROVED' AND "write_requests"."reviewed_at" IS NOT NULL AND "write_requests"."reviewed_by" IS NOT NULL AND "write_requests"."derived_vault_id" IS NOT NULL)
                OR
                ("write_requests"."status" = 'REJECTED' AND "write_requests"."reviewed_at" IS NOT NULL AND "write_requests"."reviewed_by" IS NOT NULL AND "write_requests"."derived_vault_id" IS NULL)
            ))
);
--> statement-breakpoint
ALTER TABLE "write_requests" ADD CONSTRAINT "write_requests_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "write_requests" ADD CONSTRAINT "write_requests_source_vault_id_vaults_id_fk" FOREIGN KEY ("source_vault_id") REFERENCES "public"."vaults"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "write_requests" ADD CONSTRAINT "write_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "write_requests" ADD CONSTRAINT "write_requests_derived_vault_id_vaults_id_fk" FOREIGN KEY ("derived_vault_id") REFERENCES "public"."vaults"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "write_requests" ADD CONSTRAINT "write_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "write_requests_source_vault_id_idx" ON "write_requests" USING btree ("source_vault_id");--> statement-breakpoint
CREATE INDEX "write_requests_requested_by_idx" ON "write_requests" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "write_requests_status_idx" ON "write_requests" USING btree ("status");