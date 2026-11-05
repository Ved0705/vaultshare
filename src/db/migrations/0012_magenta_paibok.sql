CREATE TABLE "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"request_type" varchar(20) DEFAULT 'READ' NOT NULL,
	"message" text,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" uuid,
	"response_message" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_requests_type_check" CHECK ("access_requests"."request_type" IN ('READ')),
	CONSTRAINT "access_requests_status_check" CHECK ("access_requests"."status" IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
	CONSTRAINT "access_requests_review_check" CHECK ((
                ("access_requests"."status" = 'PENDING'
                    AND "access_requests"."reviewed_at" IS NULL
                    AND "access_requests"."cancelled_at" IS NULL)
                OR
                ("access_requests"."status" IN ('APPROVED', 'REJECTED')
                    AND "access_requests"."reviewed_at" IS NOT NULL
                    AND "access_requests"."reviewed_by" IS NOT NULL
                    AND "access_requests"."cancelled_at" IS NULL)
                OR
                ("access_requests"."status" = 'CANCELLED'
                    AND "access_requests"."cancelled_at" IS NOT NULL
                    AND "access_requests"."reviewed_at" IS NULL)
            ))
);
--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_requests_vault_id_idx" ON "access_requests" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "access_requests_requester_id_idx" ON "access_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "access_requests_status_idx" ON "access_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "access_requests_pending_unique" ON "access_requests" USING btree ("vault_id","requester_id") WHERE "access_requests"."status" = 'PENDING';