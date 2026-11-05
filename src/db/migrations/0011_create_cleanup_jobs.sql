CREATE TABLE "cleanup_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_type" varchar(30) NOT NULL,
	"resource_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cleanup_jobs_resource_type_check" CHECK ("cleanup_jobs"."resource_type" IN ('FILE_BLOB', 'VAULT')),
	CONSTRAINT "cleanup_jobs_status_check" CHECK ("cleanup_jobs"."status" IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
	CONSTRAINT "cleanup_jobs_attempts_check" CHECK ("cleanup_jobs"."attempts" >= 0 AND "cleanup_jobs"."max_attempts" > 0)
);
--> statement-breakpoint
CREATE INDEX "cleanup_jobs_status_run_after_idx" ON "cleanup_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "cleanup_jobs_resource_idx" ON "cleanup_jobs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cleanup_jobs_active_resource_unique" ON "cleanup_jobs" USING btree ("resource_type","resource_id") WHERE "cleanup_jobs"."status" IN ('PENDING', 'PROCESSING');