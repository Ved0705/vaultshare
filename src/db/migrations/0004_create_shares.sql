CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"reader_id" uuid NOT NULL,
	"permissions" varchar(10)[] NOT NULL,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"max_access_count" integer NOT NULL,
	"successful_open_count" integer DEFAULT 0 NOT NULL,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_opened_at" timestamp with time zone,
	"post_open_ttl_seconds" integer,
	"post_open_expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shares_status_check" CHECK ("shares"."status" IN ('pending', 'active', 'expired', 'revoked')),
	CONSTRAINT "shares_permissions_check" CHECK (cardinality("shares"."permissions") > 0
                AND "shares"."permissions" <@ ARRAY['READ', 'WRITE']::varchar[]),
	CONSTRAINT "shares_max_access_count_check" CHECK ("shares"."max_access_count" > 0),
	CONSTRAINT "shares_successful_open_count_check" CHECK ("shares"."successful_open_count" >= 0
                AND "shares"."successful_open_count" <= "shares"."max_access_count"),
	CONSTRAINT "shares_post_open_ttl_check" CHECK ("shares"."post_open_ttl_seconds" IS NULL
                OR "shares"."post_open_ttl_seconds" > 0),
	CONSTRAINT "shares_post_open_expiry_check" CHECK ((
                ("shares"."first_opened_at" IS NULL AND "shares"."post_open_expires_at" IS NULL)
                OR
                ("shares"."first_opened_at" IS NOT NULL AND "shares"."post_open_expires_at" IS NOT NULL)
            ))
);
--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_reader_id_users_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shares_vault_id_idx" ON "shares" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "shares_reader_id_idx" ON "shares" USING btree ("reader_id");--> statement-breakpoint
CREATE INDEX "shares_status_idx" ON "shares" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shares_post_open_expires_at_idx" ON "shares" USING btree ("post_open_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shares_active_reader_vault_unique" ON "shares" USING btree ("vault_id","reader_id") WHERE "shares"."status" = 'active';